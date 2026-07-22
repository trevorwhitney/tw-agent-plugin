import { writeFile, rename, readFile, unlink, readdir, mkdir, access } from "fs/promises";
import { join } from "path";
import { normalizePath, serverFileName } from "./paths.js";

export const SERVER_SCHEMA = 1;

export type ServerRecord = {
  path: string;
  slot: string;
  serverUrl: string;
  updatedTs: number;
  schema: number;
};

export async function writeServerRecord(
  dir: string,
  worktreePath: string,
  slot: string,
  serverUrl: string,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const path = normalizePath(worktreePath);
  const rec: ServerRecord = { path, slot, serverUrl, updatedTs: Date.now(), schema: SERVER_SCHEMA };
  const file = join(dir, serverFileName(path, slot));
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(rec));
  await rename(tmp, file);
}

export async function readServerUrl(
  dir: string,
  worktreePath: string,
  slot: string,
): Promise<string | null> {
  const file = join(dir, serverFileName(worktreePath, slot));
  try {
    const rec = JSON.parse(await readFile(file, "utf-8")) as ServerRecord;
    return typeof rec.serverUrl === "string" ? rec.serverUrl : null;
  } catch {
    return null;
  }
}

export async function deleteServerRecord(
  dir: string,
  worktreePath: string,
  slot: string,
): Promise<void> {
  try {
    await unlink(join(dir, serverFileName(worktreePath, slot)));
  } catch {
    /* absent is fine */
  }
}

// The filename encodes worktree+slot, so recover the worktree from the record's
// own `path` field rather than parsing the name. Corrupt/partial records are
// left in place; the owning agent overwrites them on its next publish.
export async function pruneDeadServers(dir: string): Promise<void> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return;
  }
  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    const file = join(dir, name);
    let worktreePath: string | null = null;
    try {
      const rec = JSON.parse(await readFile(file, "utf-8")) as ServerRecord;
      if (typeof rec.path === "string") worktreePath = rec.path;
    } catch {
      continue;
    }
    if (!worktreePath) continue;
    try {
      await access(worktreePath);
    } catch {
      await unlink(file).catch(() => {});
    }
  }
}
