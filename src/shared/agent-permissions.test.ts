import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";

const READ_ONLY_AGENTS = [
  "brainstormer.md",
  "challenger.md",
  "code-reviewer.md",
  "performance-reviewer.md",
  "planner.md",
  "security-reviewer.md",
  "ship-it.md",
  "spec-reviewer.md",
  "writing-quality-reviewer.md",
];

async function loadAgent(name: string): Promise<string> {
  return readFile(join(process.cwd(), "agents", name), "utf-8");
}

function extractBashPermissions(agent: string): string {
  const match = agent.match(/  bash:\n([\s\S]*?)(?:  external_directory:|---)/);
  if (!match) throw new Error("agent is missing bash permissions");
  return match[1];
}

describe("read-only agent permissions", () => {
  it("keeps the shared bash policy in sync", async () => {
    const agents = await Promise.all(READ_ONLY_AGENTS.map(loadAgent));
    const permissions = agents.map(extractBashPermissions);

    expect(new Set(permissions).size).toBe(1);
    expect(permissions[0]).toContain('"*": deny');
    expect(permissions[0]).toContain('"git status*": allow');
    expect(permissions[0]).toContain('"git merge-base*": allow');
    expect(permissions[0]).toContain('"git worktree list*": allow');
    expect(permissions[0]).toContain('"git stash show*--output*": deny');
    expect(permissions[0]).toContain('"*$(*": deny');
    expect(permissions[0]).toContain('"*>*": deny');
    expect(permissions[0]).not.toContain('"git *": allow');
    expect(permissions[0]).not.toContain('"git -C');
    expect(permissions[0]).not.toContain('"cd *": allow');
    expect(permissions[0]).not.toContain('"rg *": allow');
  });

  it("places external execution denials after broader git inspection rules", async () => {
    const permissions = extractBashPermissions(await loadAgent("code-reviewer.md"));

    expect(permissions.indexOf('"git difftool*": deny')).toBeGreaterThan(
      permissions.indexOf('"git diff*": allow'),
    );
    expect(permissions.indexOf('"git show*--ext-diff*": deny')).toBeGreaterThan(
      permissions.indexOf('"git show*": allow'),
    );
  });

  it("directs agents away from unsafe cross-worktree command forms", async () => {
    const agents = await Promise.all(READ_ONLY_AGENTS.map(loadAgent));

    for (const agent of agents) {
      expect(agent).toContain("never `git -C`");
      expect(agent).toContain("do not use command substitutions or output redirection");
    }
  });

  it("aligns external access with the Safehouse workspace boundary", async () => {
    const agents = await Promise.all(READ_ONLY_AGENTS.map(loadAgent));

    for (const agent of agents) {
      expect(agent).toContain('external_directory:\n    "~/workspace/**": allow');
    }
  });
});
