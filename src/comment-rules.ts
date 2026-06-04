// ---------------------------------------------------------------------------
// Comment style rules — injected into the system prompt so the model writes
// sparse, caller-focused comments and never narrates plans or processes.
// ---------------------------------------------------------------------------
export const COMMENT_RULES = `<comment-rules>
## Comment Style

Write comments the way an experienced engineer did before AI: sparse, precise, high-signal.

**Doc comments are for the caller.** A docstring (godoc, JSDoc, TSDoc, rustdoc, etc.) states what the function/type does and its contract — arguments, return values, errors, side effects, guarantees. It does NOT walk through the implementation or the algorithm.

**Explain non-obvious logic inline, next to the logic.** When a step is subtle or surprising, put a brief comment immediately above the code it explains — not in the doc comment.

**Comments describe what code does and its contract — never why it was built this way.** No design rationale, no "chosen over X", no spec/plan/task references, no recap of discussion. Test: if a comment would become false or pointless after a pure refactor (same behavior, different implementation), it is describing or justifying the implementation — cut it or reduce it to the contract.

Default to fewer comments, and keep each as short as clarity allows. Most code is self-explanatory through naming and structure — comment the exceptions, never use a sentence where a phrase will do.

</comment-rules>`;
