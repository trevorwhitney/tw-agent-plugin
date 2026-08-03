import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadOpencodePluginConfig } from "./config.js";

let opencodeConfigDir: string;

beforeAll(async () => {
  opencodeConfigDir = await mkdtemp(join(tmpdir(), "opencode-config-"));
});

afterAll(async () => {
  await rm(opencodeConfigDir, { recursive: true, force: true });
});

const opencodePath = () => join(opencodeConfigDir, "tw-plugin.json");

beforeEach(async () => {
  await rm(opencodePath(), { force: true });
});

describe("loadOpencodePluginConfig", () => {
  it("returns persona-name defaults when file is missing", async () => {
    const c = await loadOpencodePluginConfig({ configPath: opencodePath() });
    expect(c.review["code-review"].agents).toEqual(["code-reviewer", "challenger", "performance-reviewer"]);
    expect(c.review["plan-review"].agents).toEqual(["challenger", "brainstormer"]);
    expect(c.review["spec-review"].agents).toEqual(["challenger", "brainstormer"]);
  });

  it("reads per-type keys when present", async () => {
    await writeFile(opencodePath(), JSON.stringify({
      review: {
        "code-review": { agents: ["a", "b"] },
        "plan-review": { agents: ["c"] },
        "spec-review": { agents: ["d", "e"] },
      },
    }));
    const c = await loadOpencodePluginConfig({ configPath: opencodePath() });
    expect(c.review["code-review"].agents).toEqual(["a", "b"]);
    expect(c.review["plan-review"].agents).toEqual(["c"]);
    expect(c.review["spec-review"].agents).toEqual(["d", "e"]);
  });

  it("fans flat agents array out to all three types", async () => {
    await writeFile(opencodePath(), JSON.stringify({
      review: { agents: ["x", "y"] },
    }));
    const c = await loadOpencodePluginConfig({ configPath: opencodePath() });
    expect(c.review["code-review"].agents).toEqual(["x", "y"]);
    expect(c.review["plan-review"].agents).toEqual(["x", "y"]);
    expect(c.review["spec-review"].agents).toEqual(["x", "y"]);
  });

  it("fills missing per-type keys from flat fallback", async () => {
    await writeFile(opencodePath(), JSON.stringify({
      review: {
        "code-review": { agents: ["specific"] },
        agents: ["generic"],
      },
    }));
    const c = await loadOpencodePluginConfig({ configPath: opencodePath() });
    expect(c.review["code-review"].agents).toEqual(["specific"]);
    expect(c.review["plan-review"].agents).toEqual(["generic"]);
    expect(c.review["spec-review"].agents).toEqual(["generic"]);
  });

  it("supports legacy agentA/agentB", async () => {
    await writeFile(opencodePath(), JSON.stringify({
      review: { agentA: "alpha", agentB: "beta" },
    }));
    const c = await loadOpencodePluginConfig({ configPath: opencodePath() });
    expect(c.review["code-review"].agents).toEqual(["alpha", "beta"]);
    expect(c.review["plan-review"].agents).toEqual(["alpha", "beta"]);
  });
});
