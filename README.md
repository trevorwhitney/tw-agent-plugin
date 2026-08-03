# tw-plugin

Personal coding agent plugin — skills, commands, agents, and tools for OpenCode.

## Structure

```
tw-plugin/
├── src/
│   └── opencode/index.ts       # OpenCode plugin entry point (custom tools & hooks)
├── skills/                     # Skills
│   ├── github/
│   ├── grafana/
│   ├── fix-correctness-bug/
│   ├── explain-correctness-failure/
│   ├── debug-ci-failure/
│   ├── tdd-workflow/
│   ├── writing-plans/
│   ├── subagent-driven-development/
│   └── security-review/
├── commands/                   # Slash commands
├── agents/                     # Agent definitions
└── scripts/deploy.sh           # Deploys to OpenCode config
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

### Install dependencies and build

```bash
yarn install
yarn build
```

### Deploy

The deploy script installs skills, commands, agents, and the built plugin into
your OpenCode config (`~/.config/opencode/`). It also syncs the bundled
[superpowers](https://github.com/trevorwhitney/superpowers) fork to
`~/.agents/superpowers` and registers its skills/commands/plugin.

```bash
yarn deploy
# or
bash scripts/deploy.sh
```

Then restart OpenCode to pick up the plugin and skill changes.

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

Edit `src/opencode/index.ts`. Most shared logic lives under `src/review/`,
`src/workmux/`, and `src/shared/`.

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

The review pipeline (used by `/code-review`, `/plan-review`, `/spec-review`) is
configured in `~/.config/opencode/tw-plugin.json`. Choose which critic agents
participate per review type by listing them in the `review` section.

Example:

```json
{
  "review": {
    "code-review": { "agents": ["code-reviewer", "challenger", "performance-reviewer"] },
    "plan-review": { "agents": ["challenger", "brainstormer"] },
    "spec-review": { "agents": ["challenger", "brainstormer"] },
    "timeoutMs": 300000
  }
}
```

Defaults when no config file is present:

| Review type   | Default ensemble                                       |
| ------------- | ------------------------------------------------------ |
| `code-review` | `code-reviewer`, `challenger`, `performance-reviewer`  |
| `plan-review` | `challenger`, `brainstormer`                           |
| `spec-review` | `challenger`, `brainstormer`                           |

Fallbacks (in order) when a per-type entry is missing:

1. Per-type `review.<type>.agents` array.
2. Flat `review.agents` array (fanned out to all three types).
3. Legacy `review.agentA` / `review.agentB`.
4. Built-in defaults above.

| Field                  | Type       | Description                                        |
| ---------------------- | ---------- | -------------------------------------------------- |
| `review.<type>.agents` | `string[]` | Per-type ensemble (agent names)                    |
| `review.agents`        | `string[]` | Optional flat fallback for all types               |
| `review.timeoutMs`     | `number`   | Per-agent timeout in milliseconds (5 min default)  |

## Useful commands

```bash
yarn build      # Compile TypeScript
yarn dev        # Watch mode
yarn typecheck  # Type-check without emitting
yarn deploy     # Deploy to OpenCode config
yarn test       # Run the test suite
```
