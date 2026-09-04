export const DEVELOPMENT_WORKFLOW_RULES = `<development-workflow-rules>
## Default Development Workflow

- Act directly on clear, bounded requests. Do not add mandatory brainstorming,
  design approval, specification, planning, or skill-selection gates.
- For ambiguous or high-impact work, state a brief approach and ask only about
  unresolved choices that would materially change the result.
- Keep planning proportional. Use a short in-chat outline when it improves
  coordination. Create a persistent spec or plan only when the user asks for
  one or when complex, dependent work needs a durable handoff.
- Delegate with a concise task brief containing the outcome, constraints,
  relevant context, acceptance criteria, and verification. Do not generate an
  exhaustive implementation plan solely to make delegation possible.
- Test in proportion to the change and the repository's conventions. For a bug,
  add a failing regression test first when practical. Prefer meaningful
  behavior checks over arbitrary coverage targets or mandatory test layers.
- Before reporting completion, inspect the final diff and run the relevant
  checks. State what was verified and do not claim a check passed without fresh
  command evidence.

</development-workflow-rules>`;
