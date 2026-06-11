import { describe, it, expect, vi } from "vitest";
import { createOpencodeRunner } from "./runner.js";

function createMockClient(options: {
  createResult?: any;
  promptResults?: any[];
  promptImpl?: (args: any) => Promise<any>;
}) {
  const promptResults = options.promptResults ? [...options.promptResults] : undefined;
  return {
    session: {
      create: vi.fn().mockImplementation(async () => options.createResult ?? { data: { id: "sess-1" } }),
      prompt: vi.fn().mockImplementation(async (args: any) => {
        if (options.promptImpl) return options.promptImpl(args);
        if (promptResults) return promptResults.shift();
        return { data: { parts: [] } };
      }),
      abort: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("createOpencodeRunner", () => {
  it("returns joined text from a successful prompt", async () => {
    const client = createMockClient({
      promptResults: [
        {
          data: {
            parts: [
              { type: "text", text: "hello" },
              { type: "text", text: "world" },
              { type: "tool", state: {} },
            ],
          },
          error: undefined,
        },
      ],
    });
    const run = createOpencodeRunner(client, "parent-1");
    const result = await run("code-reviewer", "Round 1 — Reviewer A", "review this", 1000);
    expect(result).toEqual({ text: "hello\nworld" });
  });

  it("surfaces a server error envelope instead of crashing on undefined data", async () => {
    // SDK returns { data: undefined, error } when the server responds 400/404.
    const client = createMockClient({
      promptImpl: async () => ({
        data: undefined,
        error: { data: { message: "agent 'code-reviewer' not found" } },
      }),
    });
    const run = createOpencodeRunner(client, "parent-1");
    const result = await run("code-reviewer", "Round 1 — Reviewer A", "review this", 1000);

    expect(result.text).toBe("");
    expect(result.error).toBeDefined();
    expect(result.error).not.toMatch(/undefined is not an object/i);
    expect(result.error).toMatch(/not found/i);
    // Should have retried once (2 total attempts) before degrading.
    expect(client.session.prompt).toHaveBeenCalledTimes(2);
  }, 15000);

  it("surfaces an error when session creation returns no data", async () => {
    const client = createMockClient({
      createResult: { data: undefined, error: { data: { message: "cannot create session" } } },
    });
    const run = createOpencodeRunner(client, "parent-1");
    const result = await run("code-reviewer", "Round 1 — Reviewer A", "review this", 1000);

    expect(result.text).toBe("");
    expect(result.error).toBeDefined();
    expect(result.error).not.toMatch(/undefined is not an object/i);
  }, 15000);
});
