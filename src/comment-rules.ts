// ---------------------------------------------------------------------------
// Comment style rules — injected into the system prompt so the model defaults
// to self-documenting code, comments the "why" not the "what", and never
// narrates plans or processes.
// ---------------------------------------------------------------------------
export const COMMENT_RULES = `<comment-rules>
## Comment Style

The best code is self-documenting and needs no comments. Default to **zero** comments and add one only when the code (and it's tests) cannot speak for itself. 

**Make the code self-documenting first.** Before writing a comment, make the code clearer instead: rename a variable, extract a well-named function, simplify the structure. A good name removes the need for a comment. Reach for a comment only after naming and structure have failed to make the intent obvious.

**Never comment the "what."** Do not narrate what a line or block does — the reader can see that. If a comment merely restates the code, delete it.

**Comment the "why," not the "what."** The rare comment that earns its place explains something the code cannot: why a non-obvious choice was made, a subtle constraint, a gotcha, or why correct-but-surprising code is in fact correct (so nobody "fixes" it later). Keep these next to the logic they explain, and keep them as succinct as possible.

**Doc comments are for the caller.** A docstring (godoc, JSDoc, TSDoc, rustdoc, etc.) states the contract — arguments, return values, errors, side effects, guarantees —  for public methods only. It does NOT walk through the implementation or the algorithm. Skip docstrings on obvious members: \`GetName()\` returning the name needs none.

**No process or rationale dumps.** No design rationale beyond a terse "why," no "chosen over X", no spec/plan/task references, no recap of discussion, no commented-out code, no decorative banners.
</comment-rules>`;
