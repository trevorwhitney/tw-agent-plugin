import { describe, it, expect } from "vitest";
import { createSendToAgentTool } from "./index.js";

describe("createSendToAgentTool", () => {
  it("builds a tool whose execute resolves self-worktree from context", async () => {
    const t = createSendToAgentTool();
    expect(typeof t.execute).toBe("function");
    expect(t.description).toMatch(/send/i);
    const out = await t.execute(
      { to: "nobody", message: "hi" },
      {
        sessionID: "s",
        messageID: "m",
        agent: "build",
        directory: "/nonexistent/tmp",
        worktree: "/nonexistent/tmp",
        abort: new AbortController().signal,
        metadata: () => {},
        ask: async () => {},
      } as any,
    );
    expect(out).toMatch(/not found/i);
  });
});
