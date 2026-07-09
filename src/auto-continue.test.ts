import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  isAutoContinueEnabled,
  setAutoContinue,
  handleSessionIdle,
  resetSessionContinueCount,
  recordAssistantOutput,
  __resetInternalState,
} from "./auto-continue.js";

// Mock client matching PluginInput["client"] shape
function createMockClient(options?: {
  todos?: Array<{ content: string; status: string; priority: string }>;
  promptAsyncFail?: boolean;
  todoFail?: boolean;
}) {
  return {
    session: {
      todo: vi.fn().mockImplementation(async (_args) => {
        if (options?.todoFail) throw new Error("todo failed");
        return { data: options?.todos ?? [] };
      }),
      promptAsync: vi.fn().mockImplementation(async (_args) => {
        if (options?.promptAsyncFail) throw new Error("prompt failed");
        return {};
      }),
    },
  } as any;
}

const pendingTodos = [{ content: "task", status: "pending", priority: "high" }];

describe("auto-continue", () => {
  beforeEach(() => {
    __resetInternalState();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to disabled", () => {
    expect(isAutoContinueEnabled("session-1")).toBe(false);
  });

  it("can be enabled and disabled", () => {
    setAutoContinue("session-1", true);
    expect(isAutoContinueEnabled("session-1")).toBe(true);
    setAutoContinue("session-1", false);
    expect(isAutoContinueEnabled("session-1")).toBe(false);
  });

  it("does not trigger when disabled", async () => {
    const client = createMockClient();
    const result = await handleSessionIdle(client, "session-1");
    expect(result.continued).toBe(false);
    expect(client.session.promptAsync).not.toHaveBeenCalled();
  });

  it("does not trigger when no incomplete todos", async () => {
    setAutoContinue("session-1", true);
    const client = createMockClient({
      todos: [{ content: "done task", status: "completed", priority: "high" }],
    });
    const result = await handleSessionIdle(client, "session-1");
    expect(result).toEqual({ continued: false, reason: "no-todos" });
  });

  it("triggers when enabled and has incomplete todos", async () => {
    setAutoContinue("session-1", true);
    const client = createMockClient({ todos: pendingTodos });
    const result = await handleSessionIdle(client, "session-1");
    expect(result).toEqual({ continued: true });
    expect(client.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: "session-1" },
        body: expect.objectContaining({
          parts: [{ type: "text", text: expect.stringContaining("auto-continue") }],
        }),
      })
    );
  });

  it("includes goal reminder when provided", async () => {
    setAutoContinue("session-1", true);
    const client = createMockClient({ todos: pendingTodos });
    const result = await handleSessionIdle(client, "session-1", { activeGoal: "Fix the auth bug" });
    expect(result).toEqual({ continued: true });
    expect(client.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          parts: [{ type: "text", text: expect.stringContaining("Fix the auth bug") }],
        }),
      })
    );
  });

  it("includes TODO.md check-in in message", async () => {
    setAutoContinue("session-1", true);
    const client = createMockClient({ todos: pendingTodos });
    const result = await handleSessionIdle(client, "session-1");
    expect(result).toEqual({ continued: true });
    expect(client.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          parts: [{ type: "text", text: expect.stringContaining("TODO.md") }],
        }),
      })
    );
  });

  it("sends wrap-up on per-session limit instead of hard stop", async () => {
    setAutoContinue("session-1", true);
    const client = createMockClient({ todos: pendingTodos });
    for (let i = 0; i < 20; i++) {
      await handleSessionIdle(client, "session-1");
      // Advance time past cooldown for each iteration
      vi.advanceTimersByTime(4000);
    }
    const result = await handleSessionIdle(client, "session-1");
    expect(result).toEqual({ continued: false, reason: "limit" });
    expect(isAutoContinueEnabled("session-1")).toBe(false);
    // Should have sent wrap-up prompt
    const lastCall = client.session.promptAsync.mock.calls.at(-1)?.[0];
    expect(lastCall?.body?.parts[0].text).toContain("limit reached");
    expect(lastCall?.body?.parts[0].text).toContain("Summarize");
  });

  it("detects stalled turns and sends wrap-up", async () => {
    setAutoContinue("session-1", true);
    const client = createMockClient({ todos: pendingTodos });
    // Simulate 3 consecutive low-output turns
    recordAssistantOutput("session-1", 50);
    recordAssistantOutput("session-1", 30);
    recordAssistantOutput("session-1", 10);
    const result = await handleSessionIdle(client, "session-1");
    expect(result).toEqual({ continued: false, reason: "stalled" });
    expect(isAutoContinueEnabled("session-1")).toBe(false);
    // Should have sent wrap-up prompt for stalled detection
    expect(client.session.promptAsync).toHaveBeenCalled();
    const lastCall = client.session.promptAsync.mock.calls.at(-1)?.[0];
    expect(lastCall?.body?.parts[0].text).toContain("stalled");
  });

  it("resets stalled count on normal output", async () => {
    setAutoContinue("session-1", true);
    const client = createMockClient({ todos: pendingTodos });
    recordAssistantOutput("session-1", 50);
    recordAssistantOutput("session-1", 50);
    // Normal output resets the counter
    recordAssistantOutput("session-1", 500);
    // First call to set lastContinueAt
    const firstResult = await handleSessionIdle(client, "session-1");
    expect(firstResult).toEqual({ continued: true });
    // Second call should still work since stalled count was reset
    vi.advanceTimersByTime(4000);
    const result = await handleSessionIdle(client, "session-1");
    expect(result).toEqual({ continued: true });
  });

  it("tracks prompt failures and disables after max", async () => {
    setAutoContinue("session-1", true);
    const client = createMockClient({ todos: pendingTodos, promptAsyncFail: true });
    await handleSessionIdle(client, "session-1");
    vi.advanceTimersByTime(4000);
    await handleSessionIdle(client, "session-1");
    vi.advanceTimersByTime(4000);
    await handleSessionIdle(client, "session-1");
    vi.advanceTimersByTime(4000);
    const result = await handleSessionIdle(client, "session-1");
    expect(result).toEqual({ continued: false, reason: "prompt-failed" });
    expect(isAutoContinueEnabled("session-1")).toBe(false);
  });

  it("resets all counters on session reset", async () => {
    setAutoContinue("session-1", true);
    const client = createMockClient({ todos: pendingTodos });
    const firstResult = await handleSessionIdle(client, "session-1");
    expect(firstResult).toEqual({ continued: true });
    recordAssistantOutput("session-1", 10);
    resetSessionContinueCount("session-1");
    vi.advanceTimersByTime(4000);
    const result = await handleSessionIdle(client, "session-1");
    expect(result).toEqual({ continued: true });
  });
});
