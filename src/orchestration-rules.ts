// ---------------------------------------------------------------------------
// Orchestration rules — injected into the system prompt so the model always
// evaluates delegation opportunities before executing multi-step work.
// ---------------------------------------------------------------------------
export const ORCHESTRATION_RULES = `<orchestration-rules>
## Delegation Awareness

Before executing any multi-step task (3+ steps), pause and evaluate:

1. **Discovery vs. Execution** — Can research/exploration run separately from implementation?
   - Use the \`explore\` subagent type (via Task tool) for broad codebase searches (fast, cheap, parallel-capable)
   - Use \`@brainstormer\` subagent for understanding existing code patterns before proposing changes (note: this is the read-only codebase researcher agent, distinct from the \`brainstorming\` skill which is an interactive design workflow)

2. **Parallel Opportunities** — Are there independent subtasks that can run simultaneously?
   - Multiple file searches across different areas → parallel Task tool calls with \`explore\` type
   - Independent implementation tasks → parallel \`@implementer\` agents
   - Research + implementation prep → run in parallel if no dependency

3. **Cost-Efficient Routing** — Match the model to the task complexity:
   - Bounded, well-specified implementation → \`implementer\` (cheaper model, faster)
   - Adversarial review or hard debugging → \`challenger\` (strongest model)
   - Code quality review → \`code-reviewer\`

4. **Context Isolation** — Would a focused subagent with limited context perform better?
   - Context-heavy investigation where the parent only needs a summary → delegate
   - Work that requires your current conversation context → do it yourself
   - Single small change (<20 lines, one file) → do it yourself

**Skip delegation when:** overhead of explaining > doing it yourself, sequential dependencies require your current context, or the task is trivially small.

</orchestration-rules>`;
