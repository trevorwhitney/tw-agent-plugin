import { type Plugin, tool } from "@opencode-ai/plugin";
import { loadOpencodeReviewConfig } from "../review/config.js";
import { runReviewPipeline } from "../review/pipeline.js";
import { codeReviewPrompts, planReviewPrompts, specReviewPrompts } from "../review/prompts/index.js";
import { runCouncil } from "../council/tool.js";
import { loadOpencodePluginConfig } from "../shared/config.js";
import type { EventSessionStatus, EventSessionCompacted, TextPart } from "@opencode-ai/sdk";
import {
  setAutoContinue,
  handleSessionIdle,
  resetSessionContinueCount,
} from "../auto-continue.js";
import {
  getGoal,
  setGoal,
  clearGoal,
  pauseGoal,
  resumeGoal,
  formatGoalStatus,
  goalSystemPrompt,
  goalCompactionContext,
  scanForGoalMarkers,
} from "../goal.js";
import {
  loadCommands,
  loadAgent,
  createBeadsContextManager,
  BEADS_AWARENESS,
} from "../beads/index.js";
import { loadCommands as loadWorkmuxCommands } from "../workmux/index.js";
import { TOOL_PRIORITY_RULES } from "../tool-priority-rules.js";
import { OBSIDIAN_DOCS_RULES } from "../obsidian-docs-rules.js";
import { GIT_COMMIT_RULES } from "../git-commit-rules.js";
import { COMMENT_RULES } from "../comment-rules.js";
import { ORCHESTRATION_RULES } from "../orchestration-rules.js";
import { SECRET_HANDLING_RULES } from "../secret-redaction/rules.js";
import {
  redact,
  captureSecretsFromCommand,
  captureSecretsFromFileRead,
} from "../secret-redaction/redactor.js";
import { createOpencodeRunner } from "./runner.js";
import { astGrepSearch, astGrepReplace } from "../ast-grep/tool.js";
import { createGcxTools } from "../grafana/gcx-tools.js";

// Pre-build a single combined rules block so we only prepend one text part.
const COMBINED_RULES = [
  TOOL_PRIORITY_RULES,
  OBSIDIAN_DOCS_RULES,
  GIT_COMMIT_RULES,
  COMMENT_RULES,
  BEADS_AWARENESS,
  ORCHESTRATION_RULES,
  SECRET_HANDLING_RULES,
].join("\n");

export const TwOpenCodePlugin: Plugin = async ({ $, client }) => {
  const [beadsCommands, beadsAgents, workmuxCommands] = await Promise.all([
    loadCommands(),
    loadAgent(),
    loadWorkmuxCommands(),
  ]);
  const beads = createBeadsContextManager(client, $);

  return {
    // Inject rules into the first user message of each session rather than
    // as system messages on every step.  This matches the approach used by
    // superpowers.js and avoids per-step system-message token bloat.
    "experimental.chat.messages.transform": async (_input, output) => {
      if (!output.messages.length) return;
      const firstUser = output.messages.find(
        (m: { info: { role: string } }) => m.info.role === "user",
      );
      if (!firstUser?.parts?.length) return;

      // Guard: skip if already injected (hook fires on every step because
      // opencode reloads messages from DB each time).
      if (
        firstUser.parts.some(
          (p: { type: string; text?: string }) =>
            p.type === "text" && p.text?.includes("<tool-priority-rules>"),
        )
      )
        return;

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({
        id: ref.id,
        sessionID: ref.sessionID,
        messageID: ref.messageID,
        type: "text",
        text: COMBINED_RULES,
      });
    },

    "chat.message": async (_input, output) => {
      await beads.handleChatMessage(_input, output);
    },

    // Redact credential values from tool output before it reaches the model.
    // Also learns exact secret values from known secret sources (op/agenix,
    // token/password files) so they are masked in all subsequent output.
    "tool.execute.after": async (input, output) => {
      try {
        if (input.tool === "bash") {
          const command = String(input.args?.command ?? "");
          captureSecretsFromCommand(command, output.output ?? "");
        } else if (input.tool === "read") {
          const path = String(input.args?.filePath ?? "");
          captureSecretsFromFileRead(path, output.output ?? "");
        }
      } catch {
        /* capture is best-effort; never block on it */
      }
      if (typeof output.output === "string") {
        output.output = redact(output.output);
      }
      if (typeof output.title === "string") {
        output.title = redact(output.title);
      }
    },

    "command.execute.before": async (input, output) => {
      if (input.command !== "goal") return;

      const args = input.arguments.trim();
      const sub = args.toLowerCase();

      if (!args) {
        (output.parts as unknown[]).push({ type: "text", text: formatGoalStatus(input.sessionID) });
        return;
      }

      if (["clear", "stop", "off", "reset", "none", "cancel"].includes(sub)) {
        clearGoal(input.sessionID);
        (output.parts as unknown[]).push({ type: "text", text: "Goal cleared." });
        return;
      }

      if (sub === "pause") {
        const paused = pauseGoal(input.sessionID);
        (output.parts as unknown[]).push({
          type: "text",
          text: paused ? "Goal paused." : "No active goal to pause.",
        });
        return;
      }

      if (sub === "resume") {
        const resumed = resumeGoal(input.sessionID);
        (output.parts as unknown[]).push({
          type: "text",
          text: resumed ? "Goal resumed." : "No paused goal to resume.",
        });
        return;
      }

      if (sub === "status") {
        (output.parts as unknown[]).push({ type: "text", text: formatGoalStatus(input.sessionID) });
        return;
      }

      const goal = setGoal(input.sessionID, args);
      (output.parts as unknown[]).push({
        type: "text",
        text: `Goal set: ${goal.objective}\n\nThe agent will keep all work aligned with this objective. End a response with [goal:complete] when done, or [goal:blocked] if you need user input.`,
      });
    },

    "experimental.chat.system.transform": async (input, output) => {
      if (!input.sessionID) return;
      const goalPrompt = goalSystemPrompt(input.sessionID);
      if (goalPrompt) {
        output.system.push(goalPrompt);
      }
    },

    "experimental.session.compacting": async (input, output) => {
      const ctx = goalCompactionContext(input.sessionID);
      if (ctx) {
        output.context.push(ctx);
      }
    },

    event: async ({ event }) => {
      const type = event.type as string;
      switch (type) {
        case "session.status": {
          const statusEvent = event as EventSessionStatus;
          const { sessionID, status } = statusEvent.properties;
          if (status.type === "busy") {
            await $`workmux set-window-status working`.quiet().nothrow();
          }
          if (status.type === "idle") {
            await $`workmux set-window-status done`.quiet().nothrow();

            // Check last assistant message for stall detection and goal markers
            try {
              const msgs = await client.session.messages({ path: { id: sessionID }, query: { limit: 5 } });
              const lastAssistant = msgs.data?.find((m: any) => m.info.role === "assistant");
              if (lastAssistant) {
                const textParts = (lastAssistant.parts ?? []).filter((p: any): p is TextPart => p.type === "text");
                const fullText = textParts.map((p: TextPart) => p.text).join("\n");
                const marker = scanForGoalMarkers(sessionID, fullText);
                if (marker === "complete") {
                  setAutoContinue(sessionID, false);
                }
              }
            } catch { /* best effort */ }

            const goal = getGoal(sessionID);
            const result = await handleSessionIdle(client, sessionID, {
              activeGoal: goal?.objective,
            });
            if (result.continued) {
              await $`workmux set-window-status working`.quiet().nothrow();
            }
          }
          break;
        }
        case "permission.asked":
        case "question.asked":
          await $`workmux set-window-status waiting`.quiet().nothrow();
          break;
        case "session.idle":
          await $`workmux set-window-status done`.quiet().nothrow();
          break;
        case "session.created": {
          const createdProps = event.properties as { id?: string } | undefined;
          if (createdProps?.id) {
            resetSessionContinueCount(createdProps.id);
          }
          await $`workmux set-window-status clear`.quiet().nothrow();
          break;
        }
        case "global.disposed":
          await $`workmux set-window-status clear`.quiet().nothrow();
          break;
        case "session.compacted":
          await beads.handleCompactionEvent(event as EventSessionCompacted);
          break;
      }
    },

    tool: {
      // gcx_* tools — Grafana Cloud resource management via the gcx CLI.
      ...createGcxTools($),
      "auto-continue": tool({
        description:
          "Enable or disable todo auto-continuation. When enabled, the agent " +
          "automatically resumes when there are incomplete todos after going idle. " +
          "Enable when working through multi-step plans. Disable for interactive work.",
        args: {
          enabled: tool.schema.boolean().describe("Whether to enable auto-continue"),
        },
        async execute(args, context) {
          setAutoContinue(context.sessionID, args.enabled);
          return `Auto-continue ${args.enabled ? "enabled" : "disabled"}.`;
        },
      }),
      "review-pipeline": tool({
        description:
          "Run a multi-reviewer pipeline. Configured agents independently review the target, " +
          "then cross-examine each other's findings. Returns all review rounds for synthesis. " +
          "Use this tool when the user runs /code-review, /plan-review, or /spec-review.",
        args: {
          type: tool.schema.enum(["code-review", "plan-review", "spec-review"]),
          target: tool.schema.string().describe(
            "The review target — a PR URL, file paths, commit range, spec content, or description of what to review"
          ),
        },
        async execute(args, context) {
          const prompts =
            args.type === "code-review"
              ? codeReviewPrompts
              : args.type === "plan-review"
                ? planReviewPrompts
                : specReviewPrompts;
          const config = await loadOpencodeReviewConfig();
          const ensemble = config[args.type];
          const pipelineConfig = { agents: ensemble.agents, timeoutMs: config.timeoutMs };

          const runner = createOpencodeRunner(client, context.sessionID);
          const synthesisText = await runReviewPipeline(
            runner,
            args.target,
            prompts,
            pipelineConfig,
          );

          return synthesisText;
        },
      }),
      "ast-grep-search": tool({
        description:
          "Search code using AST structural patterns (ast-grep). More reliable than " +
          "regex for finding code patterns like function calls, class definitions, " +
          "or specific code structures. Requires 'sg' CLI (brew install ast-grep).",
        args: {
          pattern: tool.schema.string().describe(
            "AST pattern to search for. Examples: 'console.log($$$)', " +
            "'function $FUNC($$$) { $$$ }', 'if ($COND) { $$$ }'"
          ),
          lang: tool.schema.string().optional().describe(
            "Language to parse as (e.g., 'typescript', 'python', 'go'). Auto-detected if omitted."
          ),
          path: tool.schema.string().optional().describe(
            "File or directory path to search in. Defaults to current directory."
          ),
        },
        async execute(args) {
          return astGrepSearch($, args.pattern, { lang: args.lang, path: args.path });
        },
      }),
      "ast-grep-replace": tool({
        description:
          "Replace code using AST structural patterns (ast-grep). Safer than regex-based " +
          "find-and-replace because it understands code structure. Requires 'sg' CLI.",
        args: {
          pattern: tool.schema.string().describe("AST pattern to match"),
          replacement: tool.schema.string().describe(
            "Replacement pattern. Use $VARNAME to reference captured nodes from the search pattern."
          ),
          lang: tool.schema.string().optional().describe("Language to parse as"),
          path: tool.schema.string().optional().describe("File or directory path"),
        },
        async execute(args) {
          return astGrepReplace($, args.pattern, args.replacement, {
            lang: args.lang,
            path: args.path,
          });
        },
      }),
      "council": tool({
        description:
          "Consult multiple LLM models in parallel on a question and synthesize " +
          "their responses. Use for high-stakes architectural decisions, ambiguous " +
          "problems where model diversity adds value, or when the user explicitly " +
          "asks for multiple opinions. NOT for routine code review (use review-pipeline instead).",
        args: {
          question: tool.schema.string().describe(
            "The question or decision to present to the council. Be specific about " +
            "what decision, trade-off, or answer needs to be resolved."
          ),
          models: tool.schema.array(tool.schema.string()).optional().describe(
            "Override councillor models for this invocation (format: 'provider/model', e.g. " +
            "'anthropic/claude-opus-4-6'). Each string is split on '/' into providerID/modelID. " +
            "Uses config defaults if omitted."
          ),
        },
        async execute(args, context) {
          const pluginConfig = await loadOpencodePluginConfig();
          if (!pluginConfig.council && !args.models) {
            return "Council is not configured. Add a 'council' section to ~/.config/opencode/tw-plugin.json with 'councillors' (array of {providerID, modelID}), 'synthesizer' (agent name), and 'timeoutMs'. Or pass 'models' to this tool call.";
          }
          const baseConfig = pluginConfig.council ?? {
            councillors: [],
            synthesizer: "council-synthesizer",
            timeoutMs: 120000,
          };
          if (args.models) {
            const invalid = args.models.filter((m: string) => !m.includes("/") || m.startsWith("/") || m.endsWith("/"));
            if (invalid.length) {
              return `Invalid model format (expected 'provider/model'): ${invalid.join(", ")}`;
            }
          }
          const config = args.models
            ? {
                ...baseConfig,
                councillors: args.models.map((m: string) => {
                  const [providerID, ...rest] = m.split("/");
                  return { providerID, modelID: rest.join("/") };
                }),
              }
            : baseConfig;
          const result = await runCouncil(
            client,
            context.sessionID,
            args.question,
            config,
          );
          return result.synthesis;
        },
      }),
      },

    config: async (config) => {
      config.command = {
        ...config.command,
        ...beadsCommands,
        ...workmuxCommands,
        goal: {
          template: "goal",
          description: "Session goal. /goal <text> to set, /goal to show, /goal pause|resume|clear",
        },
      };
      config.agent = { ...config.agent, ...beadsAgents };
    },
  };
};
