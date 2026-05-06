import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RunSubagent, PhaseResult } from "../review/types.js";
import { createAgentLoader, type LoadedAgent } from "./agent-loader.js";

const RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };
  return { command: "pi", args };
}

async function spawnAgent(
  cwd: string,
  agent: LoadedAgent,
  systemPromptPath: string,
  prompt: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<PhaseResult> {
  const piArgs = ["--mode", "json", "-p", "--no-session", "--no-extensions", "--no-skills", "--no-context-files", "--model", agent.model];
  if (agent.tools) piArgs.push("--tools", agent.tools);
  piArgs.push("--append-system-prompt", systemPromptPath, prompt);

  return new Promise<PhaseResult>((resolve) => {
    const invocation = getPiInvocation(piArgs);
    const proc = spawn(invocation.command, invocation.args, {
      cwd, shell: false, stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "", stderr = "", assistantText = "", wasAborted = false;

    const timeoutHandle = setTimeout(() => {
      wasAborted = true;
      proc.kill("SIGTERM");
      setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5_000);
    }, timeoutMs);

    const abortHandler = () => {
      wasAborted = true;
      proc.kill("SIGTERM");
      setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5_000);
    };

    if (signal) {
      if (signal.aborted) abortHandler();
      else signal.addEventListener("abort", abortHandler, { once: true });
    }

    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: any;
      try { event = JSON.parse(line); } catch { return; }
      if (event.type === "message_end" && event.message?.role === "assistant") {
        for (const part of event.message.content ?? []) {
          if (part.type === "text") {
            assistantText += (assistantText ? "\n" : "") + part.text;
          }
        }
      }
    };

    proc.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    });

    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (buffer.trim()) processLine(buffer);

      if (wasAborted && !assistantText) {
        resolve({ text: "", error: `timed out after ${Math.round(timeoutMs / 1000)}s` });
      } else if (code !== 0 && !assistantText) {
        resolve({ text: "", error: stderr.trim() || `exit code ${code}` });
      } else {
        resolve({ text: assistantText });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutHandle);
      if (signal) signal.removeEventListener("abort", abortHandler);
      resolve({ text: "", error: err.message });
    });
  });
}

export function createPiRunner(
  cwd: string,
  signal?: AbortSignal,
): { runSubagent: RunSubagent; cleanup: () => void } {
  let tempDir: string | null = null;
  const tempFiles = new Map<string, string>();
  const { loadAgent } = createAgentLoader();

  async function getOrWriteAgentPromptFile(name: string, body: string): Promise<string> {
    const existing = tempFiles.get(name);
    if (existing) return existing;
    if (!tempDir) {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-review-"));
    }
    const filePath = path.join(tempDir, `${name}-system-prompt.md`);
    await fs.promises.writeFile(filePath, body, { encoding: "utf-8", mode: 0o600 });
    tempFiles.set(name, filePath);
    return filePath;
  }

  const runSubagent: RunSubagent = async (
    agentName: string,
    _title: string,
    prompt: string,
    timeoutMs: number,
  ): Promise<PhaseResult> => {
    let agent: LoadedAgent;
    let promptPath: string;
    try {
      agent = await loadAgent(agentName);
      promptPath = await getOrWriteAgentPromptFile(agentName, agent.systemPrompt);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[review] ${agentName} unavailable: ${message}`);
      return { text: "", error: message };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await spawnAgent(cwd, agent, promptPath, prompt, timeoutMs, signal);
      if (!result.error || result.error.startsWith("timed out")) return result;
      if (attempt === 0) {
        console.warn(`[review] ${agentName} failed (${result.error}), retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return result;
    }
    return { text: "", error: "unreachable" };
  };

  const cleanup = (): void => {
    for (const file of tempFiles.values()) {
      try { fs.unlinkSync(file); } catch {}
    }
    tempFiles.clear();
    if (tempDir) {
      try { fs.rmdirSync(tempDir); } catch {}
      tempDir = null;
    }
  };

  return { runSubagent, cleanup };
}
