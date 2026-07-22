import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { publishServer, unpublishServer } from "./publisher.js";
import { readServerUrl } from "./server-registry.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pub-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("publisher", () => {
  it("writes serverUrl (stringifying the URL) and removes it on unpublish", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "wt-"));
    await publishServer(dir, worktree, "opencode#0", new URL("http://127.0.0.1:5005"));
    expect(await readServerUrl(dir, worktree, "opencode#0")).toBe("http://127.0.0.1:5005/");
    await unpublishServer(dir, worktree, "opencode#0");
    expect(await readServerUrl(dir, worktree, "opencode#0")).toBeNull();
    await rm(worktree, { recursive: true, force: true });
  });
});
