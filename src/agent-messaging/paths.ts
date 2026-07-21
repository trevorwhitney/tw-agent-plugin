import { resolve, join } from "path";
import { realpathSync } from "fs";

export type Env = { XDG_STATE_HOME?: string; HOME?: string };

function stateRoot(env: Env): string {
  if (env.XDG_STATE_HOME && env.XDG_STATE_HOME !== "") return env.XDG_STATE_HOME;
  return join(env.HOME ?? "", ".local", "state");
}

export function agentsDir(env: Env = process.env): string {
  return join(stateRoot(env), "agentmux", "agents");
}

export function serversDir(env: Env = process.env): string {
  return join(stateRoot(env), "agentmux", "servers");
}

// Canonical absolute path. realpathSync resolves symlinks so both sides of the
// join key agree; on a missing path it throws, so fall back to a lexical resolve.
export function normalizePath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p).replace(/\/+$/, "");
  }
}

export function serverFileName(worktreePath: string): string {
  return encodeURIComponent(normalizePath(worktreePath)) + ".json";
}
