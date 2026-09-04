// ---------------------------------------------------------------------------
// Orchestration rules — injected into the system prompt so the model delegates
// only when the handoff or parallelism has a concrete benefit.
// ---------------------------------------------------------------------------
export const ORCHESTRATION_RULES = `<orchestration-rules>
## Delegation Awareness

Delegate when work is genuinely independent, benefits from context isolation,
or can run in parallel without shared edits. Do not delegate merely because a
task has several steps.

- Use the \`explore\` subagent for broad, read-only codebase searches.
- Use \`brainstormer\` to verify codebase patterns or assumptions.
- Use \`implementer\` for a bounded coding outcome that another agent can own
  end to end.
- Use \`challenger\` for adversarial analysis or hard debugging and
  \`code-reviewer\` for code quality review.

Before delegating implementation, provide a concise task brief with the desired
outcome, constraints, relevant context, acceptance criteria, and verification.
A formal spec or exhaustive implementation plan is not required. The parent
remains responsible for integrating the result and verifying the final state.

Do the work yourself when handoff overhead exceeds the benefit, dependencies
are tightly coupled, or the task relies heavily on the current conversation.

## Subagents vs. worktree agents vs. messaging

Three distinct execution surfaces — pick deliberately:

- **\`Task\`-tool subagents** — in-session, isolated context, ephemeral; you await one summarized result. Use for scoped discovery/implementation you fold back into this session.
- **workmux worktree agents** — separate, long-lived opencode processes, each in its own git worktree/branch. This is the right response to "spawn an agent" / "do that in a new worktree": spawn is **fire-and-forget** via the workmux worktree flow (\`workmux add\`), with \`status\`/\`wait\`/\`capture\`/\`merge\` for lifecycle. Do not set up communication unless coordination is actually needed.
- **\`send-to-agent\` tool** — message an already-running worktree agent (or let peer agents message each other) by its handle (the worktree directory name). The message is delivered into the target's live session: runs if idle, queues if busy. Use this — not \`workmux send\` — to hand a running agent a task, ask it a question, or coordinate between agents. Reserve \`workmux send\` for typing TUI/slash-commands (e.g. \`/merge\`) into a pane.

</orchestration-rules>`;
