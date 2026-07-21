import { readdir, readFile } from "fs/promises";
import { join } from "path";

// session_id is optional: the neovim writer omits it until it captures the
// session, so consumers must treat "absent" as "not ready yet".
export type MirrorRecord = {
  project: string;
  worktree: string;
  path: string;
  handle: string;
  mode: string;
  idx: number;
  status: string;
  session_id?: string;
  updated_ts: number;
  schema: number;
};

export async function readMirror(dir: string): Promise<MirrorRecord[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const out: MirrorRecord[] = [];
  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    try {
      const rec = JSON.parse(await readFile(join(dir, name), "utf-8")) as MirrorRecord;
      if (rec && rec.schema === 1 && typeof rec.handle === "string") out.push(rec);
    } catch {
      /* skip unreadable/partial */
    }
  }
  return out;
}

export function selectTarget(records: MirrorRecord[], handle: string): MirrorRecord | null {
  const candidates = records
    .filter((r) => r.mode === "opencode" && r.handle === handle)
    .sort((a, b) => a.idx - b.idx);
  return candidates[0] ?? null;
}

export function knownOpencodeHandles(records: MirrorRecord[]): string[] {
  return [...new Set(records.filter((r) => r.mode === "opencode").map((r) => r.handle))].sort();
}
