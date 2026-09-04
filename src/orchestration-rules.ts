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

## Subagents vs. workspace agents

Pick the execution surface deliberately:

- **\`Task\`-tool subagents** — in-session, isolated context, ephemeral; you await one summarized result. Use for scoped discovery/implementation you fold back into this session.
- **Workspace agents** — separate, long-lived sessions in isolated workspaces. Use the available workspace orchestration skill and platform tooling when the user explicitly asks to spawn, hand off to, or coordinate agents.
- **\`send-to-agent\` tool** — message an already-running local agent by its handle when direct coordination is needed.

</orchestration-rules>`;
