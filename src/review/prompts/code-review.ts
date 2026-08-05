import { crossReviewInstructions, formatOtherReviews } from "./shared.js";
import type { PromptSet, LabeledReview, ReviewerLabel } from "../types.js";

// Applied to Round 1 only. Raises search rigor without lowering the reporting
// bar: hunt hard, but report nothing you can't prove. Round 2 cross-examination
// is the backstop that prunes anything that slips through as speculation.
const ADVERSARIAL_STANCE = `\
## Stance

Assume each file hides at least one defect and actively try to disprove that. \
"Looks fine" is not a conclusion — attempt to break every function: adversarial \
inputs, boundary values, concurrent access, error paths, resource exhaustion.

This raises how hard you look; it does NOT lower what you report. Only surface a \
finding you can prove with a code citation and a concrete failure (the input, \
state, or sequence that triggers it). Do not pad with speculation, "might want to \
consider" hedges, or style nits to appear thorough. A real bug with evidence beats \
ten maybes. If a file genuinely survives the hunt, say so.`;

export const CODE_REVIEW_INSTRUCTIONS = `\
# Code Review Instructions

Read this file before performing your review. Follow these instructions precisely.

## Review Focus Areas

Examine the code for each of the following. Do not skip any category.

The named patterns under each category are common defect signatures with a
suggested severity. They are a starting checklist to hunt for, NOT an exhaustive
list — apply judgement, adjust severity to the actual blast radius, and report
defects that fit no pattern here. Only report a pattern you can prove is present.

**Bugs & Logic Errors:**
- Incorrect control flow, off-by-one, nil/null dereference
- Race conditions, deadlocks, resource leaks
- Edge cases that produce wrong results
- Named patterns:
  - Off-by-one: \`<\` vs \`<=\` in loop bounds; index reaching \`len\` where \`len-1\` was meant — HIGH
  - Logic inversion: checking the negated condition (\`if err == nil { return err }\`, \`if !ok { use() }\`) — HIGH
  - Shadowed error/variable: an inner declaration hides the outer, silently dropping the outer value — HIGH
  - Accumulator not reset between calls/iterations, so the second invocation is wrong — HIGH
  - Swallowed error: \`if err != nil { return }\` with no propagate/log, or discarding a returned error — CRITICAL
  - Early return that skips required cleanup (bypasses a deferred/finally release) — HIGH
  - Missing default/fallthrough on a switch over external values — new cases silently no-op — MEDIUM
  - Aliasing: appending to / mutating a slice or object that shares backing storage with another live reference — HIGH

**Security:**
- Injection (SQL, command, template)
- Authentication/authorization gaps
- Secrets in code, insecure defaults
- Input validation missing or insufficient
- Named patterns:
  - String-concatenated SQL / shell / template from any external input — CRITICAL
  - Path built from user input without traversal (\`..\`) containment — CRITICAL
  - Missing authz check on a state-changing or data-returning handler — CRITICAL
  - Secret, key, or token literal committed in source — CRITICAL
  - Untrusted deserialization / eval of external data — CRITICAL
  - Integer overflow from external input used in a size/offset calculation — CRITICAL

**Performance:**
- Unnecessary allocations, copies, or conversions
- O(n^2) or worse where O(n) is possible
- Missing caching, redundant I/O
- Unbounded growth (memory, goroutines, connections)
- Named patterns:
  - N+1 query/IO: a call inside a loop that should be batched — HIGH
  - Unbounded fan-out: spawning workers/tasks per input with no concurrency limit — HIGH
  - Allocation in a hot loop that could be hoisted or pre-sized — MEDIUM
  - Unbounded cache/buffer/collection with no eviction or size cap — HIGH

**Concurrency:**
- Named patterns:
  - Lazy init of a shared field without a once-guard or lock — data race — CRITICAL
  - Shared mutable state (map/slice/field) written by one path and read by another without synchronization — CRITICAL
  - Deadlock: unbuffered send/receive where both sides aren't guaranteed to run; select with no exit case — HIGH
  - Goroutine/thread launched with no panic recovery, cancellation, or timeout path — HIGH
  - Partial state left mutated when a write path errors midway — HIGH

**Design & Maintainability:**
- Clean separation of concerns?
- Sound abstraction boundaries?
- Proper error handling with context?
- Type safety and contracts enforced?

**Complexity:**
- Can any function/block be simplified?
- Nested conditionals that should be early returns?
- Overly clever code that obscures intent?

**Duplication & Reuse:**
- Does the change introduce logic that already exists elsewhere?
- Are there parallel abstractions that should be consolidated?
- DRY principle followed?

**Testing:**
- Tests actually test logic (not just mocks)?
- Edge cases and error paths covered?
- Integration tests where needed?
- Named patterns:
  - Test name lies: the name claims one behavior, the body asserts another — HIGH
  - Regression test that returns/asserts before the guarded code is ever exercised — CRITICAL
  - Over-mocking where the real implementation is practical, hiding divergence — MEDIUM
  - Error-returning function with zero coverage of its error path — MEDIUM
  - Test mutating shared/global state or the real filesystem without isolated cleanup — MEDIUM

**Requirements Fit:**
- Implementation matches stated intent?
- No scope creep?
- Breaking changes documented?

## How to Gather Context

If you are given a specific target (file paths, PR URL, commit range), use that directly.

If no specific target is given, determine what to review:
\`\`\`bash
# Find the base branch
git log --oneline --graph -20

# Diff against base
git diff main...HEAD --stat
git diff main...HEAD
\`\`\`

Read the changed files in full to understand surrounding context, not just the diff.

## Output Format

For each finding, provide ALL of the following:

1. **Category** — one of: bug, security, performance, design, complexity, duplication, testing, requirements
2. **Severity** — one of:
   - **Critical** — bugs, security issues, data loss risks, broken functionality
   - **High** — architecture problems, missing error handling, test gaps
   - **Medium** — design improvements, simplification opportunities
   - **Low** — style, minor optimization, documentation
3. **Location** — \`file:line\` or \`file:line-line\`
4. **Description** — what is wrong and WHY it matters
5. **Recommendation** — specific fix, not vague ("improve error handling")

Also note **strengths** — what is well done. Be specific with file references.

## Rules

**DO:**
- Reference file paths, line numbers, and code snippets for every finding
- Explain WHY each issue matters, not just WHAT
- Categorize by actual severity — not everything is Critical
- Acknowledge what is well done
- Read surrounding code before judging a change in isolation

**DO NOT:**
- Say "looks good" without checking each focus area
- Mark style nitpicks as Critical or High
- Give feedback on code you did not actually read
- Be vague — every finding needs a location and a concrete recommendation
- Invent issues to appear thorough — if the code is good, say so`;

export const codeReviewPrompts: PromptSet = {
  round1(label: ReviewerLabel, target: string): string {
    return (
      `You are ${label} — an experienced engineer performing an independent code review.\n\n` +
      ADVERSARIAL_STANCE +
      "\n\n" +
      CODE_REVIEW_INSTRUCTIONS +
      "\n\nReview target:\n" +
      target
    );
  },

  round2(label: ReviewerLabel, ownReview: string, otherReviews: LabeledReview[]): string {
    const otherCount = otherReviews.length;
    const otherLabels = otherReviews.map((r) => r.label).join(" and ");
    return (
      `You are ${label}. You and ${otherCount} other experienced engineer${otherCount > 1 ? "s" : ""} (${otherLabels}) independently reviewed the same code. Now compare notes.\n\n` +
      "Your review:\n\n" +
      ownReview +
      "\n\n" +
      formatOtherReviews(otherReviews) +
      "\n\n" +
      crossReviewInstructions(otherReviews)
    );
  },

  synthesis(results): string {
    const rounds = results
      .map(
        (r) =>
          `Round 1 — ${r.label} (independent review): ${r.round1}\n` +
          `Round 2 — ${r.label} (cross-review): ${r.round2}`,
      )
      .join("\n");

    return (
      `You have the complete conversation between ${results.length} experienced reviewers who independently reviewed the code and then discussed their findings.\n\n` +
      rounds +
      "\n\nSynthesize into a final code review report. Include ONLY findings where the reviewers reached agreement or where the evidence clearly supports the finding. For each:\n" +
      "- Category (bug/security/performance/design/complexity/duplication/testing)\n" +
      "- Severity (critical/high/medium/low)\n" +
      "- File and location\n" +
      "- Description and recommendation\n\n" +
      "Also include a Strengths section for what was well done.\n\n" +
      "Drop anything that was resolved through discussion.\n\n" +
      SHIP_IT_TRIAGE
    );
  },
};

// Post-synthesis re-prioritization. One of the reviewers (Reviewer with the
// ship-it persona) argued a ship-fast counter-position during the debate; this
// phase makes the synthesizer apply that lens to the consolidated report so the
// final output is triaged, not just a flat findings list. The floor is hard:
// data-loss, security, and broken-core-functionality never get demoted here.
const SHIP_IT_TRIAGE = `\
## Final phase — ship-it triage

After producing the findings and strengths above, re-prioritize the surviving \
findings through a ship-fast lens: the goal is to deliver value now and iterate, \
not to reach perfection before merge. Reorganize the findings into these buckets:

- **Ship blockers** — findings that genuinely must be fixed before merge. This \
ALWAYS includes any data-loss/corruption, security, or broken-core-functionality \
issue, regardless of how the debate went. Beyond that floor, include a finding \
only if the cost of shipping without the fix clearly exceeds the cost of delay.
- **Ship now, fix later** — real findings that are legitimate follow-ups rather \
than blockers. One line each: what it is and why it can wait.
- **Dropped as non-blocking** — nits, style, over-defensive programming, YAGNI \
violations, and perfectionism that should not gate the merge. Name each briefly \
so the author sees what was set aside and why.

Rules for this phase:
- Never move a data-loss, security, or broken-core-functionality finding out of \
Ship blockers. If you believe such an item is an acceptable risk, keep it visible \
under a **"Accepted risk — needs human sign-off"** heading with your reasoning; \
do not silently drop it.
- Do not invent new findings here. Only triage what synthesis already produced.

End with a single verdict line: **SHIP IT** / **SHIP WITH FOLLOW-UPS** / **FIX BLOCKERS FIRST**.`;
