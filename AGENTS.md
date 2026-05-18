# Worktrees

Place worktrees as siblings to this project directory, under `~/workspace/project/`.
For example, a worktree tracking branch `foo` should go to `~/workspace/project/foo`.

# System Prompt Injection Pattern

This repo is a plugin for **pi** and **opencode**. When the user says "update the system prompt", "add an instruction", "inject a rule", or similar — they mean adding a persistent instruction that gets injected into every agent session, not editing a one-off config file.

## How it works

Persistent instructions are defined as exported string constants in `src/`, then injected at session start by both plugins:

- **Pi** (`src/tw-pi.ts`): injected in the `before_agent_start` handler via `extraSystemPrompt`
- **OpenCode** (`src/opencode/index.ts`): injected in `experimental.chat.system.transform`

## Adding a new instruction

1. Create `src/<name>-rules.ts` (follow the pattern of `src/tool-priority-rules.ts` or `src/git-commit-rules.ts`):
   ```ts
   export const MY_RULES = `<my-rules>\n...\n</my-rules>`;
   ```
2. Import and append it in **both**:
   - `src/tw-pi.ts` — add to `extraSystemPrompt`
   - `src/opencode/index.ts` — add `output.system.push(MY_RULES)` in the transform hook
3. Run `npm run build` to verify.

## Existing instruction modules

- `src/tool-priority-rules.ts` — prefer CLI tools (gh, gcx, grafana-assistant) over MCP equivalents
- `src/obsidian-docs-rules.ts` — write specs/plans to Obsidian vault and symlink back
- `src/git-commit-rules.ts` — always sign commits; stop and raise to user if signing fails

Do **not** add persistent instructions to `CLAUDE.md` — that file is Claude Code–specific and not used by pi or opencode.
