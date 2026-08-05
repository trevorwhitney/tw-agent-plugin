import { describe, it, expect } from "vitest";
import { runReviewPipeline } from "./pipeline.js";
import type { PromptSet, RunSubagent } from "./types.js";

const prompts: PromptSet = {
  round1: (label, target) => `R1 ${label} :: ${target}`,
  round2: (label, own) => `R2 ${label} :: ${own}`,
  synthesis: (results) => results.map((r) => `${r.label}|${r.round1}|${r.round2}`).join("\n"),
};

function recordingRunner(): { runner: RunSubagent; calls: { title: string; prompt: string }[] } {
  const calls: { title: string; prompt: string }[] = [];
  const runner: RunSubagent = async (_agent, title, prompt) => {
    calls.push({ title, prompt });
    return { text: `${title} output` };
  };
  return { runner, calls };
}

describe("runReviewPipeline scope preamble", () => {
  it("prepends the preamble to Round 1 prompts only", async () => {
    const { runner, calls } = recordingRunner();

    await runReviewPipeline(runner, "TARGET", prompts, {
      agents: ["a", "b"],
      timeoutMs: 1000,
      scopePreamble: "## Scope\nchanged: foo.ts",
    });

    const round1 = calls.filter((c) => c.title.startsWith("Round 1"));
    const round2 = calls.filter((c) => c.title.startsWith("Round 2"));

    expect(round1).toHaveLength(2);
    for (const c of round1) {
      expect(c.prompt.startsWith("## Scope\nchanged: foo.ts")).toBe(true);
    }
    for (const c of round2) {
      expect(c.prompt).not.toContain("## Scope");
    }
  });

  it("leaves Round 1 prompts unchanged when no preamble is given", async () => {
    const { runner, calls } = recordingRunner();

    await runReviewPipeline(runner, "TARGET", prompts, {
      agents: ["a"],
      timeoutMs: 1000,
    });

    const round1 = calls.find((c) => c.title.startsWith("Round 1"));
    expect(round1?.prompt).toBe("R1 Reviewer A :: TARGET");
  });
});
