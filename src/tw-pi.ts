import type { ExtensionAPI, Skill } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { Type, StringEnum } from "@earendil-works/pi-ai";
import { TOOL_PRIORITY_RULES } from "./tool-priority-rules.js";
import { OBSIDIAN_DOCS_RULES } from "./obsidian-docs-rules.js";
import { GIT_COMMIT_RULES } from "./git-commit-rules.js";
import { COMMENT_RULES } from "./comment-rules.js";
import { ORCHESTRATION_RULES } from "./orchestration-rules.js";
import { loadPiReviewConfig } from "./review/config.js";
import { runReviewPipeline } from "./review/pipeline.js";
import {
  codeReviewPrompts,
  planReviewPrompts,
  specReviewPrompts,
} from "./review/prompts/index.js";
import { createPiRunner } from "./pi/runner.js";
import { getSuperpowersBootstrap } from "./pi/superpowers-bootstrap.js";
import { registerGcxTools } from "./grafana/gcx-pi.js";
import { BEADS_AWARENESS } from "./beads/index.js";
import { BEADS_GUIDANCE, loadCommands as loadBeadsCommands } from "./beads/vendor.js";
import { loadCommands as loadWorkmuxCommands } from "./workmux/index.js";
import { execSync, spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runShellQuiet(command: string, cwd?: string): boolean {
  try {
    spawnSync("sh", ["-c", command], {
      cwd,
      stdio: "ignore",
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function shellOutput(command: string, cwd?: string): string {
  try {
    return execSync(command, {
      cwd,
      timeout: 10_000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function isGitRepo(cwd?: string): boolean {
  return shellOutput("git rev-parse --git-dir", cwd) !== "";
}

function tryAutoInit(cwd?: string): boolean {
  if (!isGitRepo(cwd)) return false;
  try {
    const result = spawnSync("bd", ["init", "--stealth", "--quiet"], {
      cwd,
      stdio: "ignore",
      timeout: 10_000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function getBeadsPrimeOutput(cwd?: string): string {
  return shellOutput("bd prime", cwd);
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function(pi: ExtensionAPI) {
  // Track which sessions have had beads context injected
  const injectedSessions = new Set<string>();
  // Skills discovered by pi, updated on each turn via before_agent_start
  let discoveredSkills: Skill[] = [];

  // ── System prompt: tool priority rules + beads awareness ──────────────
  pi.on("before_agent_start", async (event, ctx) => {
    // Capture discovered skills so the skill tool can resolve by name
    discoveredSkills = event.systemPromptOptions.skills ?? [];

    let extraSystemPrompt = "\n\n" + TOOL_PRIORITY_RULES + "\n\n" + OBSIDIAN_DOCS_RULES + "\n\n" + GIT_COMMIT_RULES + "\n\n" + COMMENT_RULES + "\n\n" + BEADS_AWARENESS + "\n\n" + ORCHESTRATION_RULES;
    const bootstrap = await getSuperpowersBootstrap();
    if (bootstrap) {
      extraSystemPrompt += "\n\n" + bootstrap;
    }

    // Inject beads context as a message on the first turn of each session
    const sessionFile = ctx.sessionManager.getSessionFile();
    const sessionKey = sessionFile ?? "ephemeral";

    if (!injectedSessions.has(sessionKey)) {
      injectedSessions.add(sessionKey);

      // Check if beads context was already injected (e.g., after resume/fork)
      const entries = ctx.sessionManager.getEntries();
      const hasBeadsContext = entries.some(
        (e) => e.type === "custom" && e.customType === "beads-context",
      );

      if (!hasBeadsContext) {
        let primeOutput = getBeadsPrimeOutput(ctx.cwd);
        if (!primeOutput) {
          // Try auto-init then retry
          if (tryAutoInit(ctx.cwd)) {
            primeOutput = getBeadsPrimeOutput(ctx.cwd);
          }
        }

        if (primeOutput) {
          const beadsContext = `<beads-context>\n${primeOutput}\n</beads-context>\n\n${BEADS_GUIDANCE}`;
          pi.appendEntry("beads-context", { text: beadsContext });
          return {
            systemPrompt: event.systemPrompt + extraSystemPrompt,
            message: {
              customType: "beads-context",
              content: beadsContext,
              display: false,
            },
          };
        }
      }
    }

    return {
      systemPrompt: event.systemPrompt + extraSystemPrompt,
    };
  });

  // ── Re-inject beads context after compaction ──────────────────────────
  // Clear the injection tracking so next before_agent_start re-injects fresh context.
  pi.on("session_compact", async (_event, _ctx) => {
    const sessionFile = _ctx.sessionManager.getSessionFile();
    const sessionKey = sessionFile ?? "ephemeral";
    injectedSessions.delete(sessionKey);
  });

  // ── Workmux status tracking ───────────────────────────────────────────
  pi.on("agent_start", async () => {
    runShellQuiet("workmux set-window-status working");
  });

  pi.on("agent_end", async () => {
    runShellQuiet("workmux set-window-status done");
  });

  pi.on("session_shutdown", async () => {
    runShellQuiet("workmux set-window-status clear");
  });

  pi.on("session_start", async (event) => {
    if (event.reason === "startup") {
      runShellQuiet("workmux set-window-status clear");
    }
  });

  // ── Register workmux commands ─────────────────────────────────────────
  // Load commands asynchronously at startup. The pi context may become
  // stale if a session replacement occurs before the promises resolve, so
  // guard registerCommand with a try/catch.
  loadWorkmuxCommands().then((commands) => {
    if (!commands) return;
    for (const [name, cmd] of Object.entries(commands)) {
      try {
        // name is "workmux:foo" — register as "/workmux:foo"
        pi.registerCommand(name, {
          description: cmd.description,
          handler: async (args, _ctx) => {
            const prompt = cmd.template.replace(/\$ARGUMENTS/g, args || "");
            pi.sendUserMessage(prompt);
          },
        });
      } catch {
        // Context went stale — commands will be re-registered on next load
        break;
      }
    }
  });

  // ── Register beads commands ───────────────────────────────────────────
  loadBeadsCommands().then((commands) => {
    if (!commands) return;
    for (const [name, cmd] of Object.entries(commands)) {
      try {
        pi.registerCommand(name, {
          description: cmd.description,
          handler: async (args, _ctx) => {
            const prompt = cmd.template.replace(/\$ARGUMENTS/g, args || "");
            pi.sendUserMessage(prompt);
          },
        });
      } catch {
        // Context went stale — commands will be re-registered on next load
        break;
      }
    }
  });

  // ── Register the skill tool ───────────────────────────────────────────
  pi.registerTool({
    name: "skill",
    label: "Load Skill",
    description:
      "Load a skill by name. Returns the full skill content (instructions, checklists, workflows). " +
      "Use this when a task matches a skill description from the available_skills list. " +
      "You MUST invoke this tool before starting work whenever a skill might apply.",
    parameters: Type.Object({
      name: Type.String({
        description: "The skill name from the available_skills list (e.g. 'brainstorming', 'test-driven-development')",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const skill = discoveredSkills.find((s) => s.name === params.name);
      if (!skill) {
        const available = discoveredSkills.map((s) => s.name).join(", ");
        return {
          content: [{
            type: "text",
            text: `Skill not found: "${params.name}". Available skills: ${available}`,
          }],
          details: {},
          isError: true,
        };
      }
      try {
        const content = await readFile(skill.filePath, "utf-8");
        return {
          content: [{ type: "text", text: content }],
          details: { skillName: skill.name, filePath: skill.filePath },
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Failed to read skill file: ${skill.filePath}: ${err instanceof Error ? err.message : String(err)}`,
          }],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ── Register the review pipeline tool ─────────────────────────────────
  pi.registerTool({
    name: "review_pipeline",
    label: "Review Pipeline",
    description:
      "Run a multi-reviewer pipeline. Configured agents independently review the target, " +
      "then cross-examine each other's findings. Returns all review rounds for synthesis. " +
      "Use this tool when the user runs /code-review, /plan-review, or /spec-review.",
    parameters: Type.Object({
      type: StringEnum(["code-review", "plan-review", "spec-review"] as const, {
        description: "The type of review to run",
      }),
      target: Type.String({
        description:
          "The review target — a PR URL, file paths, commit range, spec content, or description of what to review",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const prompts =
        params.type === "code-review"
          ? codeReviewPrompts
          : params.type === "plan-review"
            ? planReviewPrompts
            : specReviewPrompts;

      const config = await loadPiReviewConfig();
      const ensemble = config[params.type];
      const pipelineConfig = { agents: ensemble.agents, timeoutMs: config.timeoutMs };
      const { runSubagent, cleanup } = createPiRunner(ctx.cwd, signal ?? undefined);

      try {
        const synthesis = await runReviewPipeline(
          runSubagent,
          params.target,
          prompts,
          pipelineConfig,
        );
        return {
          content: [{ type: "text", text: synthesis }],
          details: {},
        };
      } finally {
        cleanup();
      }
    },
  });

  // ── Register the gcx_* Grafana tools ──────────────────────────────────
  registerGcxTools(pi);
}
