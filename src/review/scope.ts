import type { PluginInput } from "@opencode-ai/plugin";

type BunShell = PluginInput["$"];

const HOT_ZONE_COMMITS = 5;

async function run($: BunShell, cmd: string): Promise<string> {
  const result = await $`sh -c ${cmd}`.quiet().nothrow();
  if (result.exitCode !== 0) return "";
  return result.stdout.toString().trim();
}

/**
 * Build a shared context block for Round 1 reviewers: the changed files in the
 * diff and the "hot zones" (files touched in recent commits) that deserve the
 * most scrutiny. Returns an empty string when git yields nothing useful, so the
 * caller can inject unconditionally without a guard.
 */
export async function gatherScope($: BunShell): Promise<string> {
  const base = await run($, "git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null");
  const changed = base
    ? await run($, `git diff --name-only ${base}..HEAD`)
    : await run($, "git diff --name-only HEAD");
  const recentLog = await run($, `git log --oneline -${HOT_ZONE_COMMITS}`);
  const hotZones = await run(
    $,
    `git log --name-only --pretty=format: -${HOT_ZONE_COMMITS} | sort -u | grep -v '^$'`,
  );

  if (!changed && !recentLog && !hotZones) return "";

  const sections: string[] = ["## Scope"];
  if (changed) {
    sections.push(`Changed files in this review:\n${changed}`);
  }
  if (hotZones) {
    sections.push(
      `Hot zones — files touched in the last ${HOT_ZONE_COMMITS} commits. ` +
        `Scrutinize these most; recent churn is where defects concentrate:\n${hotZones}`,
    );
  }
  if (recentLog) {
    sections.push(`Recent commits for context:\n${recentLog}`);
  }
  return sections.join("\n\n");
}
