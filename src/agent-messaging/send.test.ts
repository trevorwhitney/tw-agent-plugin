import { describe, it, expect, vi } from "vitest";
import { sendToAgent } from "./send.js";
import type { MirrorRecord } from "./mirror.js";

const rec = (o: Partial<MirrorRecord>): MirrorRecord => ({
  project: "loki",
  worktree: "compaction",
  path: "/w/loki/compaction",
  handle: "compaction",
  mode: "opencode",
  idx: 0,
  status: "waiting",
  session_id: "ses_a",
  updated_ts: 1,
  schema: 1,
  ...o,
});

function deps(over: Partial<Parameters<typeof sendToAgent>[1]> = {}) {
  const promptAsync = vi.fn().mockResolvedValue({ error: undefined });
  return {
    promptAsync,
    d: {
      selfWorktree: "/nonexistent/loki/other",
      records: [
        rec({}),
        rec({
          handle: "other",
          path: "/nonexistent/loki/other",
          session_id: "ses_self",
        }),
      ],
      readServerUrl: vi.fn().mockResolvedValue("http://127.0.0.1:5001/"),
      makeClient: vi.fn().mockReturnValue({ session: { promptAsync } }),
      ...over,
    },
  };
}

describe("sendToAgent", () => {
  it("delivers via promptAsync to the resolved server + session", async () => {
    const { d, promptAsync } = deps();
    const out = await sendToAgent({ to: "compaction", message: "go" }, d as any);
    expect(d.makeClient).toHaveBeenCalledWith("http://127.0.0.1:5001/");
    expect(promptAsync).toHaveBeenCalledWith({
      path: { id: "ses_a" },
      body: {
        parts: [
          {
            type: "text",
            text: "[message from agent other @ /nonexistent/loki/other]\n\ngo",
          },
        ],
      },
    });
    expect(out).toMatch(/delivered to compaction/i);
  });

  it("errors and lists handles when target unknown", async () => {
    const { d } = deps();
    const out = await sendToAgent({ to: "ghost", message: "x" }, d as any);
    expect(out).toMatch(/not found/i);
    expect(out).toMatch(/compaction/);
  });

  it("reports 'not ready' when the matched target has no session_id", async () => {
    const notReady: any = rec({ handle: "starting", path: "/w/loki/starting" });
    delete notReady.session_id;
    const { d } = deps({ records: [notReady] });
    const out = await sendToAgent({ to: "starting", message: "x" }, d as any);
    expect(out).toMatch(/not ready/i);
  });

  it("rejects self-send", async () => {
    const { d } = deps();
    const out = await sendToAgent({ to: "other", message: "x" }, d as any);
    expect(out).toMatch(/cannot send to self/i);
  });

  it("errors when serverUrl is missing", async () => {
    const { d } = deps({ readServerUrl: vi.fn().mockResolvedValue(null) });
    const out = await sendToAgent({ to: "compaction", message: "x" }, d as any);
    expect(out).toMatch(/server address unknown/i);
  });

  it("reports a down target on connection failure", async () => {
    const promptAsync = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const { d } = deps({
      makeClient: vi.fn().mockReturnValue({ session: { promptAsync } }),
    });
    const out = await sendToAgent({ to: "compaction", message: "x" }, d as any);
    expect(out).toMatch(/appears down/i);
  });

  it("reports rejection when promptAsync returns an error envelope", async () => {
    const promptAsync = vi.fn().mockResolvedValue({ error: { data: { message: "bad" } } });
    const { d } = deps({
      makeClient: vi.fn().mockReturnValue({ session: { promptAsync } }),
    });
    const out = await sendToAgent({ to: "compaction", message: "x" }, d as any);
    expect(out).toMatch(/was rejected/i);
  });
});
