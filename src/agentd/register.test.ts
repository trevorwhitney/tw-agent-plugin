import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerAgentdSession, resetRegistration } from "./register.js";

const env = { AGENTD_JOB_TOKEN: "42", AGENTD_SOCKET: "/x.sock" };
const created = (id: string, parentID?: string) => ({
  type: "session.created",
  properties: { info: { id, parentID } },
});

describe("registerAgentdSession", () => {
  beforeEach(() => resetRegistration());

  it("POSTs the root session id once", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await registerAgentdSession(created("ses_1"), { env, fetchFn })).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://agentd/jobs/42/session",
      expect.objectContaining({ body: JSON.stringify({ session_id: "ses_1" }) }),
    );
    expect(await registerAgentdSession(created("ses_2"), { env, fetchFn })).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("ignores subagent sessions", async () => {
    const fetchFn = vi.fn();
    expect(await registerAgentdSession(created("ses_child", "ses_parent"), { env, fetchFn })).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("no-ops without a job token", async () => {
    const fetchFn = vi.fn();
    expect(await registerAgentdSession(created("ses_1"), { env: {}, fetchFn })).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
