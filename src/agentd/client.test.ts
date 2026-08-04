import { describe, it, expect, vi } from "vitest";
import { jobToken, socketPath, postAgentd } from "./client.js";

describe("jobToken", () => {
  it("returns the trimmed token", () => {
    expect(jobToken({ AGENTD_JOB_TOKEN: " 42 " })).toBe("42");
  });
  it("returns undefined when unset or blank", () => {
    expect(jobToken({})).toBeUndefined();
    expect(jobToken({ AGENTD_JOB_TOKEN: "" })).toBeUndefined();
  });
});

describe("socketPath", () => {
  it("prefers AGENTD_SOCKET", () => {
    expect(socketPath({ AGENTD_SOCKET: "/x/agentd.sock" })).toBe("/x/agentd.sock");
  });
  it("falls back to XDG state dir then HOME", () => {
    expect(socketPath({ XDG_STATE_HOME: "/xdg" })).toBe("/xdg/agentd/agentd.sock");
    expect(socketPath({ HOME: "/home/u" })).toBe("/home/u/.local/state/agentd/agentd.sock");
  });
});

describe("postAgentd", () => {
  it("POSTs JSON over the unix socket", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await postAgentd("/jobs/42/report", { verdict: "approve" }, {
      env: { AGENTD_SOCKET: "/x/agentd.sock" },
      fetchFn,
    });
    expect(fetchFn).toHaveBeenCalledWith("http://agentd/jobs/42/report", {
      unix: "/x/agentd.sock",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verdict: "approve" }),
    });
  });
  it("throws on non-2xx with the body in the message", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(`{"error":"job 42 is done"}`, { status: 409 }));
    await expect(
      postAgentd("/jobs/42/report", {}, { env: { AGENTD_SOCKET: "/x.sock" }, fetchFn }),
    ).rejects.toThrow(/409.*job 42 is done/s);
  });
});
