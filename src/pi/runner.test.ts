import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createPiRunner } from "./runner.js";

let cwd: string;

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), "runner-cwd-"));
});

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("createPiRunner", () => {
  it("returns degraded PhaseResult (not throw) when an agent is unknown", async () => {
    const { runSubagent, cleanup } = createPiRunner(cwd);
    try {
      const result = await runSubagent("definitely-does-not-exist", "test", "prompt", 5_000);
      expect(result.text).toBe("");
      expect(result.error).toMatch(/agent not found/);
    } finally {
      cleanup();
    }
  });

  it("cleanup() can be called multiple times safely", async () => {
    const { cleanup } = createPiRunner(cwd);
    cleanup();
    expect(() => cleanup()).not.toThrow();
  });
});
