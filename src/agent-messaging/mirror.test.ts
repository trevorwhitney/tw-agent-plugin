import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readMirror, selectTarget, knownOpencodeHandles } from "./mirror.js";

let dir: string;
async function seed(name: string, rec: object) {
  await writeFile(join(dir, name), JSON.stringify(rec));
}
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agents-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const base = {
  project: "loki",
  worktree: "compaction",
  path: "/w/loki/compaction",
  handle: "compaction",
  mode: "opencode",
  idx: 0,
  status: "waiting",
  session_id: "ses_a",
  description: "",
  updated_ts: 1,
  schema: 1,
};

describe("mirror", () => {
  it("selects the matching opencode record", async () => {
    await seed("a.json", { ...base, handle: "compaction" });
    const t = selectTarget(await readMirror(dir), "compaction");
    expect(t?.session_id).toBe("ses_a");
    expect(t?.path).toBe("/w/loki/compaction");
  });

  it("ignores non-opencode records", async () => {
    await seed("c.json", { ...base, handle: "compaction", mode: "claude" });
    expect(selectTarget(await readMirror(dir), "compaction")).toBeNull();
  });

  it("returns the lowest-idx record even when session_id is absent (not ready)", async () => {
    // session_id key intentionally omitted, mirroring vim.json.encode of nil.
    const noSession: any = { ...base, handle: "h", idx: 0 };
    delete noSession.session_id;
    await seed("a.json", noSession);
    await seed("b.json", { ...base, handle: "h", idx: 1, session_id: "ses_1" });
    const t = selectTarget(await readMirror(dir), "h");
    expect(t?.idx).toBe(0);
    expect(t?.session_id).toBeUndefined();
  });

  it("lists known opencode handles", async () => {
    await seed("a.json", { ...base, handle: "one" });
    await seed("b.json", { ...base, handle: "two", mode: "codex" });
    expect(knownOpencodeHandles(await readMirror(dir))).toEqual(["one"]);
  });

  it("drops records with a foreign schema or a missing handle", async () => {
    await seed("good.json", { ...base, handle: "keep" });
    await seed("newschema.json", { ...base, handle: "future", schema: 2 });
    const handleless: any = { ...base };
    delete handleless.handle;
    await seed("nohandle.json", handleless);
    const recs = await readMirror(dir);
    expect(recs.map((r) => r.handle)).toEqual(["keep"]);
  });
});
