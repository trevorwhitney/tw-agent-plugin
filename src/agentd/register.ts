import { type AgentdOpts, jobToken, postAgentd } from "./client.js";

type SessionCreatedEvent = {
  type: string;
  properties?: { info?: { id?: string; parentID?: string } };
};

let registered = false;

// resetRegistration clears the once-guard. Test seam.
export function resetRegistration(): void {
  registered = false;
}

// registerAgentdSession announces the root session's id to agentd when this
// opencode process is a consult job. Subagent sessions (parentID set) and
// repeat events are ignored.
export async function registerAgentdSession(
  event: SessionCreatedEvent,
  opts: AgentdOpts = {},
): Promise<boolean> {
  if (registered) return false;
  const token = jobToken(opts.env);
  if (!token) return false;
  const info = event.properties?.info;
  if (!info?.id || info.parentID) return false;
  await postAgentd(`/jobs/${token}/session`, { session_id: info.id }, opts);
  registered = true;
  return true;
}
