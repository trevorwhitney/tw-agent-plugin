import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  writeServerRecord,
  readServerUrl,
  deleteServerRecord,
  pruneDeadServers,
} from "./server-registry.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "servers-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("server-registry", () => {
  it("writes then reads back a serverUrl (round-trips through realpath)", async () => {
    const wt = await mkdtemp(join(tmpdir(), "wt-"));
    await writeServerRecord(dir, wt, "opencode#0", "http://127.0.0.1:5001/");
    expect(await readServerUrl(dir, wt, "opencode#0")).toBe("http://127.0.0.1:5001/");
    await rm(wt, { recursive: true, force: true });
  });

  it("keeps separate records for different slots in the same worktree", async () => {
    const wt = await mkdtemp(join(tmpdir(), "wt-"));
    await writeServerRecord(dir, wt, "opencode#0", "http://127.0.0.1:6000/");
    await writeServerRecord(dir, wt, "opencode#1", "http://127.0.0.1:6001/");
    expect(await readServerUrl(dir, wt, "opencode#0")).toBe("http://127.0.0.1:6000/");
    expect(await readServerUrl(dir, wt, "opencode#1")).toBe("http://127.0.0.1:6001/");
    await rm(wt, { recursive: true, force: true });
  });

  it("unpublishing one slot leaves the other slot's record intact", async () => {
    const wt = await mkdtemp(join(tmpdir(), "wt-"));
    await writeServerRecord(dir, wt, "opencode#0", "http://127.0.0.1:6000/");
    await writeServerRecord(dir, wt, "opencode#1", "http://127.0.0.1:6001/");
    await deleteServerRecord(dir, wt, "opencode#0");
    expect(await readServerUrl(dir, wt, "opencode#0")).toBeNull();
    expect(await readServerUrl(dir, wt, "opencode#1")).toBe("http://127.0.0.1:6001/");
    await rm(wt, { recursive: true, force: true });
  });

  it("returns null for an unknown worktree", async () => {
    expect(await readServerUrl(dir, "/nonexistent/nope", "opencode#0")).toBeNull();
  });

  it("deletes a record", async () => {
    const wt = await mkdtemp(join(tmpdir(), "wt-"));
    await writeServerRecord(dir, wt, "opencode#0", "http://127.0.0.1:5001/");
    await deleteServerRecord(dir, wt, "opencode#0");
    expect(await readServerUrl(dir, wt, "opencode#0")).toBeNull();
    await rm(wt, { recursive: true, force: true });
  });

  it("prunes records whose worktree path no longer exists", async () => {
    const live = await mkdtemp(join(tmpdir(), "live-"));
    const gone = await mkdtemp(join(tmpdir(), "gone-"));
    await writeServerRecord(dir, live, "opencode#0", "http://127.0.0.1:5002/");
    await writeServerRecord(dir, gone, "opencode#0", "http://127.0.0.1:5003/");
    await rm(gone, { recursive: true, force: true });
    await pruneDeadServers(dir);
    const files = await readdir(dir);
    expect(files.length).toBe(1);
    expect(await readServerUrl(dir, live, "opencode#0")).toBe("http://127.0.0.1:5002/");
    await rm(live, { recursive: true, force: true });
  });
});
