import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadPiPluginConfig, loadOpencodePluginConfig } from "./config.js";

let piConfigDir: string;
let opencodeConfigDir: string;

beforeAll(async () => {
  piConfigDir = await mkdtemp(join(tmpdir(), "pi-config-"));
  opencodeConfigDir = await mkdtemp(join(tmpdir(), "opencode-config-"));
});

afterAll(async () => {
  await rm(piConfigDir, { recursive: true, force: true });
  await rm(opencodeConfigDir, { recursive: true, force: true });
});

const piPath = () => join(piConfigDir, "tw-plugin.json");
const opencodePath = () => join(opencodeConfigDir, "tw-plugin.json");

beforeEach(async () => {
  for (const p of [piPath(), opencodePath()]) {
    await rm(p, { force: true });
  }
});

describe("loadPiPluginConfig", () => {
  it("returns persona-name defaults when file is missing", async () => {
    const c = await loadPiPluginConfig({ configPath: piPath() });
    expect(c.review["code-review"].agents).toEqual(["code-reviewer", "spec-reviewer", "challenger"]);
    expect(c.review["plan-review"].agents).toEqual(["challenger", "brainstormer"]);
    expect(c.review["spec-review"].agents).toEqual(["challenger", "brainstormer"]);
  });

  it("reads per-type keys when present", async () => {
    await writeFile(piPath(), JSON.stringify({
      review: {
        "code-review": { agents: ["a", "b"] },
        "plan-review": { agents: ["c"] },
        "spec-review": { agents: ["d", "e"] },
      },
    }));
    const c = await loadPiPluginConfig({ configPath: piPath() });
    expect(c.review["code-review"].agents).toEqual(["a", "b"]);
    expect(c.review["plan-review"].agents).toEqual(["c"]);
    expect(c.review["spec-review"].agents).toEqual(["d", "e"]);
  });

  it("fans flat agents array out to all three types", async () => {
    await writeFile(piPath(), JSON.stringify({ review: { agents: ["x", "y"] } }));
    const c = await loadPiPluginConfig({ configPath: piPath() });
    expect(c.review["code-review"].agents).toEqual(["x", "y"]);
    expect(c.review["plan-review"].agents).toEqual(["x", "y"]);
    expect(c.review["spec-review"].agents).toEqual(["x", "y"]);
  });

  it("fills missing per-type keys from flat fallback", async () => {
    await writeFile(piPath(), JSON.stringify({
      review: {
        "code-review": { agents: ["specific"] },
        agents: ["generic"],
      },
    }));
    const c = await loadPiPluginConfig({ configPath: piPath() });
    expect(c.review["code-review"].agents).toEqual(["specific"]);
    expect(c.review["plan-review"].agents).toEqual(["generic"]);
    expect(c.review["spec-review"].agents).toEqual(["generic"]);
  });

  it("falls through to agentA/agentB when no per-type or flat", async () => {
    await writeFile(piPath(), JSON.stringify({
      review: { agentA: "alpha", agentB: "beta" },
    }));
    const c = await loadPiPluginConfig({ configPath: piPath() });
    expect(c.review["code-review"].agents).toEqual(["alpha", "beta"]);
  });
});

describe("loadOpencodePluginConfig", () => {
  it("returns existing default order when file is missing", async () => {
    const c = await loadOpencodePluginConfig({ configPath: opencodePath() });
    // CRITICAL: preserve current array order; do not silently rearrange.
    expect(c.review.agents).toEqual(["critic-codex", "critic-opus", "critic-sonnet"]);
  });

  it("reads flat agents array", async () => {
    await writeFile(opencodePath(), JSON.stringify({
      review: { agents: ["critic-sonnet", "critic-opus"] },
    }));
    const c = await loadOpencodePluginConfig({ configPath: opencodePath() });
    expect(c.review.agents).toEqual(["critic-sonnet", "critic-opus"]);
  });

  it("supports legacy agentA/agentB", async () => {
    await writeFile(opencodePath(), JSON.stringify({
      review: { agentA: "critic-codex", agentB: "critic-opus" },
    }));
    const c = await loadOpencodePluginConfig({ configPath: opencodePath() });
    expect(c.review.agents).toEqual(["critic-codex", "critic-opus"]);
  });
});
