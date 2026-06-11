# tw-plugin

Personal coding agent plugin — skills, commands, agents, and tools for OpenCode, Claude Code, and Pi.

## Structure

```
tw-plugin/
├── .claude-plugin/plugin.json  # Claude Code plugin manifest
├── CLAUDE.md                   # Tool-priority rules for Claude Code
├── src/
│   ├── opencode/index.ts       # OpenCode plugin entry point (custom tools & hooks)
│   ├── tw-pi.ts                # Pi extension entry point (custom tools & hooks)
│   └── pi-package.json         # Pi extension manifest (linked as package.json)
├── skills/                     # Shared skills (all platforms)
│   ├── github/
│   ├── grafana/
│   ├── fix-correctness-bug/
│   ├── explain-correctness-failure/
│   ├── debug-ci-failure/
│   ├── tdd-workflow/
│   ├── writing-plans/
│   ├── subagent-driven-development/
│   └── security-review/
├── commands/                   # Shared slash commands (OpenCode + Claude Code)
├── agents/                     # Shared agent definitions (OpenCode + Claude Code)
├── pi-agents/                  # Pi-specific agent definitions
├── prompts/                    # Pi prompt templates
└── scripts/deploy.sh           # Deploys to OpenCode, Claude Code, and Pi configs
```

## Installation

### Prerequisites

This project uses **Yarn 4** (Berry), pinned via the `packageManager` field in
`package.json` and provisioned through [corepack](https://github.com/nodejs/corepack).
Enable it once:

```bash
corepack enable
```

If `corepack enable` fails with an `EPERM` symlink error — common when Node is
installed read-only (e.g. via Nix) — install/activate the pinned Yarn directly
instead:

```bash
corepack prepare yarn@4.15.0 --activate
```

After that, `yarn` in this repo resolves to 4.15.0 automatically.

### OpenCode

#### 1. Install dependencies and build

```bash
yarn install
yarn build
```

#### 2. Restart OpenCode

Restart OpenCode to pick up the plugin and skill changes.

### Claude Code

Two approaches are available:

**Development/testing** — pass the plugin directory at startup:

```bash
claude --plugin-dir /path/to/tw-plugin
```

**Persistent install** — run the deploy script, which registers the plugin in `~/.claude/plugins/installed_plugins.json` and enables it in `~/.claude/settings.json`:

```bash
yarn deploy
# or
bash scripts/deploy.sh
```

After install, skills are available as slash commands prefixed with `/tw:` (e.g. `/tw:code-review`).

### Pi

The deploy script also installs into `~/.pi/agent/`:

- Skills (including the bundled superpowers fork) → `~/.pi/agent/skills/`
- Agents → `~/.pi/agent/agents/` (from both `pi-agents/` and superpowers)
- Prompt templates → `~/.pi/agent/prompts/`
- The plugin extension is symlinked into `~/.pi/agent/extensions/tw-plugin/`, which provides the review pipeline tool, beads/workmux integration, and tool-priority rules via Pi's extension API
- The bundled `subagent` example extension is also installed so Pi can dispatch subagents

```bash
yarn install
yarn build
yarn deploy
```

Then restart Pi to pick up the changes.

## Platform differences

| Feature                        | OpenCode                    | Claude Code                             | Pi                              |
| ------------------------------ | --------------------------- | --------------------------------------- | ------------------------------- |
| Skills                         | Yes                         | Yes                                     | Yes                             |
| Commands (slash)               | Yes                         | Yes (prefixed `/tw:`)                   | No (uses prompts + agents)      |
| Agents                         | Yes                         | Yes                                     | Yes (`pi-agents/` + superpowers) |
| Prompt templates               | No                          | No                                      | Yes (`prompts/`)                |
| Custom tools (review pipeline) | Yes                         | No (requires JS plugin SDK)             | Yes (via Pi extension)          |
| Beads integration              | Yes                         | No (requires JS hooks)                  | Yes (via Pi extension)          |
| Workmux status                 | Yes                         | No (separate CC hooks in settings.json) | Yes (via Pi extension)          |
| Tool-priority rules            | Via system prompt injection | Via CLAUDE.md                           | Via system prompt injection     |

## Development

### Adding a new skill

Create `skills/<skill-name>/SKILL.md` with YAML frontmatter:

```markdown
---
name: my-skill
description: Short description shown in the skill picker.
---

# My Skill

Detailed instructions for the agent when this skill is loaded.
```

### Adding a custom tool

For OpenCode, edit `src/opencode/index.ts`. For Pi, edit `src/tw-pi.ts`. Most shared logic lives under `src/review/`, `src/beads/`, `src/workmux/`, and `src/shared/` so both entry points can reuse it.

OpenCode example:

```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

export default (async (_ctx) => {
  return {
    tool: {
      "my-tool": tool({
        description: "Does something useful",
        args: {
          input: tool.schema.string().describe("The input value"),
        },
        async execute(args) {
          return `Result: ${args.input}`;
        },
      }),
    },
  };
}) satisfies Plugin;
```

Then rebuild: `yarn build`.

For Pi, custom tools are registered through the `ExtensionAPI` in `src/tw-pi.ts` — see the existing review pipeline registration there for a working example.

### Adding a slash command

Create `commands/<command-name>.md` with YAML frontmatter:

```markdown
---
description: Short description of the command.
argument-hint: "<required-arg>"
---

Command template that the agent receives when `/command-name` is invoked. Use `$ARGUMENTS` to reference the user's input.
```

### Skill frontmatter reference

| Field           | Type      | Description                                  |
| --------------- | --------- | -------------------------------------------- |
| `name`          | string    | Skill identifier (matches directory name)    |
| `description`   | string    | Shown in the skill picker                    |
| `model`         | string?   | Override the model used when skill is active |
| `agent`         | string?   | Restrict to a specific agent                 |
| `argument-hint` | string?   | Hint shown when skill accepts arguments      |
| `allowed-tools` | string[]? | Restrict which tools the skill can use       |
| `subtask`       | boolean?  | Whether this skill runs as a subtask         |

## Configuration

The review pipeline (used by `/code-review`, `/plan-review`, `/spec-review`) is configured per host. OpenCode and Pi each load their own config file with a different schema, because Pi reviews dispatch persona-diverse agents (one persona per role) while OpenCode reviews dispatch model-diverse critics (same persona, different models).

### OpenCode — model-diverse critics

Config file: `~/.config/opencode/tw-plugin.json`. Choose which critic agents participate by listing them in `review.agents`. Available critics:

- `critic-codex` — OpenAI Codex
- `critic-opus` — Anthropic Opus
- `critic-sonnet` — Anthropic Sonnet

Example:

```json
{
  "review": {
    "agents": ["critic-sonnet", "critic-opus", "critic-codex"],
    "timeoutMs": 300000
  }
}
```

Defaults when no config file is present:

```json
{
  "review": {
    "agents": ["critic-codex", "critic-opus", "critic-sonnet"],
    "timeoutMs": 300000
  }
}
```

| Field              | Type       | Default                                            | Description                       |
| ------------------ | ---------- | -------------------------------------------------- | --------------------------------- |
| `review.agents`    | `string[]` | `["critic-codex", "critic-opus", "critic-sonnet"]` | Critic agents used for all review types |
| `review.timeoutMs` | `number`   | `300000` (5 min)                                   | Per-agent timeout in milliseconds |

For backwards compatibility, the legacy `review.agentA` / `review.agentB` two-critic shape is still accepted.

### Pi — persona-diverse review ensembles

Config file: `~/.pi/agent/tw-plugin.json`. Pi uses a **per-review-type** schema so each review (`code-review`, `plan-review`, `spec-review`) gets its own ensemble of personas. Each persona is a `.md` file in `pi-agents/` (deployed to `~/.pi/agent/agents/`) with its own model, tools, and system prompt.

Available personas (see `pi-agents/`):

- `code-reviewer` — quality + codebase consistency (Codex)
- `spec-reviewer` — spec-to-implementation mapping (Sonnet)
- `security-reviewer` — vulnerability analysis, opt-in (Codex)
- `challenger` — adversarial review, finds gaps and unsupported claims (Opus)
- `brainstormer` — codebase research / grounding (Sonnet)
- `planner` — spec → implementation plan (Opus)

Example config:

```json
{
  "review": {
    "code-review": { "agents": ["code-reviewer", "spec-reviewer", "challenger"] },
    "plan-review": { "agents": ["challenger", "brainstormer"] },
    "spec-review": { "agents": ["challenger", "brainstormer"] },
    "timeoutMs": 300000
  }
}
```

Defaults when no config file is present (same as the example above):

| Review type   | Default ensemble                                    |
| ------------- | --------------------------------------------------- |
| `code-review` | `code-reviewer`, `spec-reviewer`, `challenger`      |
| `plan-review` | `challenger`, `brainstormer`                        |
| `spec-review` | `challenger`, `brainstormer`                        |

Fallbacks (in order) when a per-type entry is missing:

1. Per-type `review.<type>.agents` array.
2. Flat `review.agents` array (fanned out to all three types).
3. Legacy `review.agentA` / `review.agentB`.
4. Built-in defaults above.

| Field                       | Type       | Description                              |
| --------------------------- | ---------- | ---------------------------------------- |
| `review.<type>.agents`      | `string[]` | Per-type ensemble (persona names)        |
| `review.agents`             | `string[]` | Optional flat fallback for all types     |
| `review.timeoutMs`          | `number`   | Per-agent timeout in milliseconds (5 min default) |

Adding a new persona: drop a new `<name>.md` file in `pi-agents/` with `name`, `description`, `model`, and (optionally) `tools` frontmatter, run `yarn deploy`, then reference it by name in the config.

## Useful commands

```bash
yarn build      # Compile TypeScript
yarn dev        # Watch mode
yarn typecheck  # Type-check without emitting
yarn deploy     # Deploy to OpenCode, Claude Code, and Pi configs
yarn test       # Run the test suite
```
