import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { TOOL_PRIORITY_RULES } from "./tool-priority-rules.js";
import { loadReviewConfig } from "./review/config.js";
import { runReviewPipeline } from "./review/pipeline.js";
import {
  codeReviewPrompts,
  planReviewPrompts,
  specReviewPrompts,
} from "./review/prompts/index.js";
import { createPiRunner } from "./pi/runner.js";
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

export default function (pi: ExtensionAPI) {
  // Track which sessions have had beads context injected
  const injectedSessions = new Set<string>();

  // ── System prompt: tool priority rules + beads awareness ──────────────
  pi.on("before_agent_start", async (event, ctx) => {
    let extraSystemPrompt = "\n\n" + TOOL_PRIORITY_RULES + "\n\n" + BEADS_AWARENESS;

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
  // Load commands synchronously at startup by kicking off the async load
  // and registering when ready. Pi's jiti loader is synchronous for the
  // default export, but registerCommand can be called at any time.
  loadWorkmuxCommands().then((commands) => {
    if (!commands) return;
    for (const [name, cmd] of Object.entries(commands)) {
      // name is "workmux:foo" — register as "/workmux:foo"
      pi.registerCommand(name, {
        description: cmd.description,
        handler: async (args, _ctx) => {
          const prompt = cmd.template.replace(/\$ARGUMENTS/g, args || "");
          pi.sendUserMessage(prompt);
        },
      });
    }
  });

  // ── Register beads commands ───────────────────────────────────────────
  loadBeadsCommands().then((commands) => {
    if (!commands) return;
    for (const [name, cmd] of Object.entries(commands)) {
      pi.registerCommand(name, {
        description: cmd.description,
        handler: async (args, _ctx) => {
          const prompt = cmd.template.replace(/\$ARGUMENTS/g, args || "");
          pi.sendUserMessage(prompt);
        },
      });
    }
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

      const config = await loadReviewConfig();
      const { runSubagent, cleanup } = createPiRunner(ctx.cwd, signal ?? undefined);

      try {
        const synthesis = await runReviewPipeline(
          runSubagent,
          params.target,
          prompts,
          config,
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
}
