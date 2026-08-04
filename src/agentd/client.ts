import { join } from "node:path";

export type Env = {
  AGENTD_JOB_TOKEN?: string;
  AGENTD_SOCKET?: string;
  XDG_STATE_HOME?: string;
  HOME?: string;
};

export function jobToken(env: Env = process.env): string | undefined {
  const t = env.AGENTD_JOB_TOKEN?.trim();
  return t && t !== "" ? t : undefined;
}

export function socketPath(env: Env = process.env): string {
  if (env.AGENTD_SOCKET && env.AGENTD_SOCKET !== "") return env.AGENTD_SOCKET;
  const state =
    env.XDG_STATE_HOME && env.XDG_STATE_HOME !== ""
      ? env.XDG_STATE_HOME
      : join(env.HOME ?? "", ".local", "state");
  return join(state, "agentd", "agentd.sock");
}

// Bun extends fetch with a `unix` option for unix-socket HTTP.
export type FetchFn = (url: string, init: RequestInit & { unix?: string }) => Promise<Response>;

export type AgentdOpts = { env?: Env; fetchFn?: FetchFn };

export async function postAgentd(path: string, body: unknown, opts: AgentdOpts = {}): Promise<string> {
  const env = opts.env ?? process.env;
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchFn);
  const res = await fetchFn(`http://agentd${path}`, {
    unix: socketPath(env),
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`agentd ${path}: ${res.status} ${text}`);
  return text;
}
