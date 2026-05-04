import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createAgentLoader } from "./agent-loader.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-loader-test-"));
  await writeFile(join(dir, "valid.md"),
    `---
name: valid
description: A valid agent
model: openai/gpt-5.3-codex
tools: read,grep
---

You are a test agent.
`);
  await writeFile(join(dir, "no-tools.md"),
    `---
name: no-tools
description: No tools
model: anthropic/claude-haiku-4-5
---

Body.
`);
  await writeFile(join(dir, "missing-model.md"),
    `---
name: missing-model
description: No model
---

Body.
`);
  await writeFile(join(dir, "no-frontmatter.md"), `Body without frontmatter.\n`);
  await writeFile(join(dir, "empty-tools.md"),
    `---
name: empty-tools
model: anthropic/claude-haiku-4-5
tools:
---

Body.
`);
});

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe("loadAgent", () => {
  it("loads a valid agent file", async () => {
    const { loadAgent } = createAgentLoader(dir);
    const agent = await loadAgent("valid");
    expect(agent.model).toBe("openai/gpt-5.3-codex");
    expect(agent.tools).toBe("read,grep");
    expect(agent.systemPrompt.trim()).toBe("You are a test agent.");
  });

  it("returns undefined tools when frontmatter omits the field", async () => {
    const { loadAgent } = createAgentLoader(dir);
    expect((await loadAgent("no-tools")).tools).toBeUndefined();
  });

  it("normalises empty/whitespace tools to undefined", async () => {
    const { loadAgent } = createAgentLoader(dir);
    expect((await loadAgent("empty-tools")).tools).toBeUndefined();
  });

  it("throws when the file is missing", async () => {
    const { loadAgent } = createAgentLoader(dir);
    await expect(loadAgent("nope")).rejects.toThrow(/agent not found.*nope\.md/);
  });

  it("throws when frontmatter is missing", async () => {
    const { loadAgent } = createAgentLoader(dir);
    await expect(loadAgent("no-frontmatter")).rejects.toThrow(/frontmatter/i);
  });

  it("throws when model field is missing", async () => {
    const { loadAgent } = createAgentLoader(dir);
    await expect(loadAgent("missing-model")).rejects.toThrow(/model/i);
  });

  it("caches by name within a single loader instance", async () => {
    const { loadAgent } = createAgentLoader(dir);
    const a = await loadAgent("valid");
    const b = await loadAgent("valid");
    expect(b).toBe(a);
  });
});
