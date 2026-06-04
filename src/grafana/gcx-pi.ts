// ---------------------------------------------------------------------------
// gcx_* tools — pi adapter.
//
// Maps the runtime-agnostic command specs in gcx-spec.ts onto pi's
// registerTool API (TypeBox schemas, AgentToolResult return, ctx.ui.confirm
// for destructive confirmation, ctx.exec for shell execution).
// ---------------------------------------------------------------------------
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, StringEnum, type TSchema } from "@earendil-works/pi-ai";
import {
  GCX_COMMANDS,
  runGcx,
  resolveJson,
  type ExecFn,
  type GcxArgs,
  type ParamSpec,
  type ParamsSpec,
} from "./gcx-spec.js";

// ctx.exec runs the binary + args directly (no shell), so argv[0] is the
// command and the rest are arguments. This preserves the same argv the
// opencode adapter passes through `sh -c`.
function piExec(exec: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>): ExecFn {
  return async (argv) => {
    const [command, ...args] = argv;
    const result = await exec(command, args);
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  };
}

// Map a neutral ParamSpec to a TypeBox schema.
function toTypeBox(p: ParamSpec): TSchema {
  let schema: TSchema;
  switch (p.kind) {
    case "string":
      schema = Type.String({ description: p.description });
      break;
    case "boolean":
      schema = Type.Boolean({ description: p.description });
      break;
    case "number":
      schema = Type.Number({ description: p.description });
      break;
    case "enum":
      schema = StringEnum(p.values as [string, ...string[]], { description: p.description });
      break;
  }
  return p.optional ? Type.Optional(schema) : schema;
}

function toParameters(params: ParamsSpec) {
  const props: Record<string, TSchema> = {};
  for (const [name, spec] of Object.entries(params)) {
    props[name] = toTypeBox(spec);
  }
  return Type.Object(props);
}

// ---------------------------------------------------------------------------
// Register every gcx_* tool on the pi extension API.
// ---------------------------------------------------------------------------
export function registerGcxTools(pi: ExtensionAPI): void {
  const exec = piExec((command, args) => pi.exec(command, args));

  for (const cmd of GCX_COMMANDS) {
    pi.registerTool({
      name: cmd.name,
      label: cmd.title({}),
      description: cmd.description,
      parameters: toParameters(cmd.params),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const a = (params ?? {}) as GcxArgs;

        if (cmd.destructive) {
          const { action } = cmd.destructive(a);
          // ctx.ui.confirm is unavailable in non-interactive (print/RPC) mode.
          // Skip the prompt there; require an explicit `force` flag instead.
          if (ctx.hasUI) {
            const ok = await ctx.ui.confirm("Confirm destructive gcx command", action);
            if (!ok) {
              return {
                content: [{ type: "text", text: `Cancelled: ${action}` }],
                details: {},
              };
            }
          } else if (!a.force) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `Refusing to run destructive command without confirmation: ${action}\n` +
                    `Re-run with force=true to proceed in non-interactive mode.`,
                },
              ],
              details: {},
            };
          }
        }

        const text = await runGcx(exec, cmd.buildArgv(a), cmd.title(a), resolveJson(cmd, a));
        return { content: [{ type: "text", text }], details: {} };
      },
    });
  }
}
