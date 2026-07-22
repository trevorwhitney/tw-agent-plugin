import { writeServerRecord, deleteServerRecord, pruneDeadServers } from "./server-registry.js";

export async function publishServer(
  dir: string,
  worktree: string,
  slot: string,
  serverUrl: URL,
): Promise<void> {
  await pruneDeadServers(dir);
  await writeServerRecord(dir, worktree, slot, serverUrl.toString());
}

export async function unpublishServer(dir: string, worktree: string, slot: string): Promise<void> {
  await deleteServerRecord(dir, worktree, slot);
}
