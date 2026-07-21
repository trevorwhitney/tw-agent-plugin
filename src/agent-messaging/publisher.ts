import { writeServerRecord, deleteServerRecord, pruneDeadServers } from "./server-registry.js";

export async function publishServer(dir: string, worktree: string, serverUrl: URL): Promise<void> {
  await pruneDeadServers(dir);
  await writeServerRecord(dir, worktree, serverUrl.toString());
}

export async function unpublishServer(dir: string, worktree: string): Promise<void> {
  await deleteServerRecord(dir, worktree);
}
