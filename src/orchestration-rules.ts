// ---------------------------------------------------------------------------
// Orchestration rules — injected into the system prompt so the model delegates
// only when the handoff or parallelism has a concrete benefit.
// ---------------------------------------------------------------------------
export const ORCHESTRATION_RULES = `<orchestration-rules>
## Execution Surface

Use the native \`Task\` tool by default for delegation, agent spawning, fan-out,
and parallel work. Task-tool subagents are child sessions with isolated context
that report their result back to the current session.

- Requests mentioning "subagent", "Task tool", "in-session", "current session",
  or "as many subagents as necessary" mean Task-tool subagents unless the user
  also explicitly requests workspace isolation, persistence, or host control.
- The words "spawn", "agent", "delegate", "parallelize", and "fan out" do not
  by themselves imply workspaces or worktrees.
- Use a Superset workspace orchestration skill only when the user explicitly
  requests a workspace, worktree, isolated branch, separate long-lived session,
  or host-level coordination. Do not load one merely to parallelize work.
- When the user names a model or reasoning level, select a configured subagent
  whose model and variant match. Do not switch to workspace agents because an
  exact in-session profile is unavailable.
- Launch independent Task calls concurrently in one tool-use message. Use only
  as many subagents as there are useful independent work units; avoid duplicate
  work and unbounded fan-out.

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

Use \`send-to-agent\` to message an already-running local agent by its handle
when direct coordination is needed. Its existence does not change the default
preference for Task-tool subagents when starting new delegated work.

</orchestration-rules>`;
