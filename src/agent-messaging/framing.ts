import { basename } from "path";
import { normalizePath } from "./paths.js";
import type { MirrorRecord } from "./mirror.js";

export function resolveSelfHandle(records: MirrorRecord[], selfWorktree: string): string {
  const norm = normalizePath(selfWorktree);
  const match = records.find((r) => normalizePath(r.path) === norm);
  return match?.handle ?? basename(norm);
}

export function frameMessage(selfHandle: string, selfWorktree: string, message: string): string {
  return `[message from agent ${selfHandle} @ ${normalizePath(selfWorktree)}]\n\n${message}`;
}
