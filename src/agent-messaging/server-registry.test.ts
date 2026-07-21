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
    await writeServerRecord(dir, wt, "http://127.0.0.1:5001/");
    expect(await readServerUrl(dir, wt)).toBe("http://127.0.0.1:5001/");
    await rm(wt, { recursive: true, force: true });
  });

  it("returns null for an unknown worktree", async () => {
    expect(await readServerUrl(dir, "/nonexistent/nope")).toBeNull();
  });

  it("deletes a record", async () => {
    const wt = await mkdtemp(join(tmpdir(), "wt-"));
    await writeServerRecord(dir, wt, "http://127.0.0.1:5001/");
    await deleteServerRecord(dir, wt);
    expect(await readServerUrl(dir, wt)).toBeNull();
    await rm(wt, { recursive: true, force: true });
  });

  it("prunes records whose worktree path no longer exists", async () => {
    const live = await mkdtemp(join(tmpdir(), "live-"));
    const gone = await mkdtemp(join(tmpdir(), "gone-"));
    await writeServerRecord(dir, live, "http://127.0.0.1:5002/");
    await writeServerRecord(dir, gone, "http://127.0.0.1:5003/");
    await rm(gone, { recursive: true, force: true });
    await pruneDeadServers(dir);
    const files = await readdir(dir);
    expect(files.length).toBe(1);
    expect(await readServerUrl(dir, live)).toBe("http://127.0.0.1:5002/");
    await rm(live, { recursive: true, force: true });
  });
});
