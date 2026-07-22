import { describe, it, expect } from "vitest";
import { agentsDir, serversDir, normalizePath, serverFileName, agentSlot } from "./paths.js";

describe("paths", () => {
  it("resolves state dirs from XDG_STATE_HOME", () => {
    const env = { XDG_STATE_HOME: "/x/state", HOME: "/home/tw" };
    expect(agentsDir(env)).toBe("/x/state/agentmux/agents");
    expect(serversDir(env)).toBe("/x/state/agentmux/servers");
  });

  it("falls back to HOME/.local/state", () => {
    const env = { HOME: "/home/tw" };
    expect(agentsDir(env)).toBe("/home/tw/.local/state/agentmux/agents");
    expect(serversDir(env)).toBe("/home/tw/.local/state/agentmux/servers");
  });

  it("normalizes non-existent paths via resolve fallback", () => {
    expect(normalizePath("/nonexistent/a/b/")).toBe("/nonexistent/a/b");
    expect(normalizePath("/nonexistent/a/b/../b")).toBe("/nonexistent/a/b");
  });

  it("encodes the servers filename from worktree + slot, escaping separators", () => {
    expect(serverFileName("/nonexistent/foo/bar", "opencode#0")).toBe(
      "%2Fnonexistent%2Ffoo%2Fbar%23opencode%230.json",
    );
  });

  it("gives distinct filenames to different slots in the same worktree", () => {
    expect(serverFileName("/nonexistent/foo/bar", "opencode#0")).not.toBe(
      serverFileName("/nonexistent/foo/bar", "opencode#1"),
    );
  });

  it("resolves the slot from TW_AGENT_SLOT, defaulting to opencode#0", () => {
    expect(agentSlot({ TW_AGENT_SLOT: "opencode#2" })).toBe("opencode#2");
    expect(agentSlot({})).toBe("opencode#0");
    expect(agentSlot({ TW_AGENT_SLOT: "  " })).toBe("opencode#0");
  });
});
