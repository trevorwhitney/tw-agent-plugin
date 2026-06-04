// ---------------------------------------------------------------------------
// gcx_* tools — opencode adapter.
//
// Maps the runtime-agnostic command specs in gcx-spec.ts onto opencode's
// `tool()` API (zod schemas via tool.schema, string return, context.ask for
// destructive confirmation). Bound to Bun's shell `$`.
// ---------------------------------------------------------------------------
import { tool } from "@opencode-ai/plugin/tool";
import type { ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginInput } from "@opencode-ai/plugin";
import {
  GCX_COMMANDS,
  runGcx,
  resolveJson,
  type ExecFn,
  type GcxArgs,
  type ParamSpec,
  type ParamsSpec,
} from "./gcx-spec.js";

type BunShell = PluginInput["$"];

// Build an ExecFn backed by Bun's shell. argv[0] is the binary; the full
// command is run through `sh -c` to preserve the existing quoting behaviour.
function bunExec($: BunShell): ExecFn {
  return async (argv) => {
    const cmdStr = argv.join(" ");
    const result = await $`sh -c ${cmdStr}`.quiet().nothrow();
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      code: result.exitCode,
    };
  };
}

// Map a neutral ParamSpec to a zod schema via tool.schema.
function toZod(p: ParamSpec) {
  let schema;
  switch (p.kind) {
    case "string":
      schema = tool.schema.string();
      break;
    case "boolean":
      schema = tool.schema.boolean();
      break;
    case "number":
      schema = tool.schema.number();
      break;
    case "enum":
      schema = tool.schema.enum(p.values as [string, ...string[]]);
      break;
  }
  schema = schema.describe(p.description);
  return p.optional ? schema.optional() : schema;
}

function toArgs(params: ParamsSpec): Record<string, ReturnType<typeof toZod>> {
  const out: Record<string, ReturnType<typeof toZod>> = {};
  for (const [name, spec] of Object.entries(params)) {
    out[name] = toZod(spec);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Factory: returns the full map of gcx_* tools bound to the provided shell.
// Spread the result into a plugin's `tool` block to register them.
// ---------------------------------------------------------------------------
export function createGcxTools($: BunShell): Record<string, ToolDefinition> {
  const exec = bunExec($);
  const tools: Record<string, ToolDefinition> = {};

  for (const cmd of GCX_COMMANDS) {
    tools[cmd.name] = tool({
      description: cmd.description,
      args: toArgs(cmd.params),
      async execute(args, context) {
        const a = args as GcxArgs;
        if (cmd.destructive) {
          const { action, metadata } = cmd.destructive(a);
          await context.ask({
            permission: "gcx.delete",
            patterns: [action],
            always: ["gcx.delete"],
            metadata,
          });
        }
        return runGcx(exec, cmd.buildArgv(a), cmd.title(a), resolveJson(cmd, a));
      },
    });
  }

  return tools;
}
