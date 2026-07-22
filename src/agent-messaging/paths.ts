import { resolve, join } from "path";
import { realpathSync } from "fs";

export type Env = { XDG_STATE_HOME?: string; HOME?: string; TW_AGENT_SLOT?: string };

function stateRoot(env: Env): string {
  if (env.XDG_STATE_HOME && env.XDG_STATE_HOME !== "") return env.XDG_STATE_HOME;
  return join(env.HOME ?? "", ".local", "state");
}

// A slot uniquely identifies one agent within a worktree (tw-vim-lib runs
// several: opencode#0, opencode#1, ...). tw-vim-lib passes it via TW_AGENT_SLOT;
// the send side reconstructs the same string from a mirror record's mode+idx.
// Default to the common single-agent slot when unset.
export function agentSlot(env: Env = process.env): string {
  const s = env.TW_AGENT_SLOT;
  return s && s.trim() !== "" ? s : "opencode#0";
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

// Keyed by worktree path AND slot so multiple agents in one worktree each get
// their own record instead of clobbering a shared worktree-only file. The whole
// composite is percent-encoded, so the "#" separator is unambiguous.
export function serverFileName(worktreePath: string, slot: string): string {
  return encodeURIComponent(normalizePath(worktreePath) + "#" + slot) + ".json";
}
