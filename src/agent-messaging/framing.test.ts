import { describe, it, expect } from "vitest";
import { resolveSelfHandle, frameMessage } from "./framing.js";
import type { MirrorRecord } from "./mirror.js";

const rec = (o: Partial<MirrorRecord>): MirrorRecord => ({
  project: "p",
  worktree: "bar",
  path: "/nonexistent/foo/bar",
  handle: "bar",
  mode: "opencode",
  idx: 0,
  status: "waiting",
  session_id: "s",
  updated_ts: 1,
  schema: 1,
  ...o,
});

describe("framing", () => {
  it("resolves self handle from the mirror by worktree path", () => {
    expect(resolveSelfHandle([rec({})], "/nonexistent/foo/bar")).toBe("bar");
  });

  it("falls back to basename when no record matches", () => {
    expect(resolveSelfHandle([], "/nonexistent/foo/bar/")).toBe("bar");
  });

  it("frames with handle and absolute path", () => {
    const text = frameMessage("bar", "/nonexistent/foo/bar", "hello there");
    expect(text).toBe("[message from agent bar @ /nonexistent/foo/bar]\n\nhello there");
  });
});
