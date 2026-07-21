import { writeFile, rename, readFile, unlink, readdir, mkdir, access } from "fs/promises";
import { join } from "path";
import { normalizePath, serverFileName } from "./paths.js";

export const SERVER_SCHEMA = 1;

export type ServerRecord = {
  path: string;
  serverUrl: string;
  updatedTs: number;
  schema: number;
};

export async function writeServerRecord(
  dir: string,
  worktreePath: string,
  serverUrl: string,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const path = normalizePath(worktreePath);
  const rec: ServerRecord = { path, serverUrl, updatedTs: Date.now(), schema: SERVER_SCHEMA };
  const file = join(dir, serverFileName(path));
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(rec));
  await rename(tmp, file);
}

export async function readServerUrl(dir: string, worktreePath: string): Promise<string | null> {
  const file = join(dir, serverFileName(worktreePath));
  try {
    const rec = JSON.parse(await readFile(file, "utf-8")) as ServerRecord;
    return typeof rec.serverUrl === "string" ? rec.serverUrl : null;
  } catch {
    return null;
  }
}

export async function deleteServerRecord(dir: string, worktreePath: string): Promise<void> {
  try {
    await unlink(join(dir, serverFileName(worktreePath)));
  } catch {
    /* absent is fine */
  }
}

// Recover the worktree path from the filename rather than parsing the file, so
// prune still works when a record is partially written or corrupt.
export async function pruneDeadServers(dir: string): Promise<void> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return;
  }
  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    const worktreePath = decodeURIComponent(name.slice(0, -".json".length));
    try {
      await access(worktreePath);
    } catch {
      await unlink(join(dir, name)).catch(() => {});
    }
  }
}
