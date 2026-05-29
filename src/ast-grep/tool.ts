// ---------------------------------------------------------------------------
// AST-grep tools — structural code search and replace using ast-grep (sg).
// Requires `sg` CLI to be installed: brew install ast-grep
// ---------------------------------------------------------------------------
import type { PluginInput } from "@opencode-ai/plugin";

type BunShell = PluginInput["$"];

export async function astGrepSearch(
  $: BunShell,
  pattern: string,
  options: { lang?: string; path?: string },
): Promise<string> {
  try {
    const target = options.path ?? ".";
    let result;

    if (options.lang) {
      result = await $`sg run --pattern ${pattern} --lang ${options.lang} ${target}`.nothrow().text();
    } else {
      result = await $`sg run --pattern ${pattern} ${target}`.nothrow().text();
    }

    return result || "No matches found.";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found") || msg.includes("No such file")) {
      return "ast-grep (sg) is not installed. Install with: brew install ast-grep";
    }
    // sg returns non-zero when no matches found — that's not an error
    if (msg.includes("exit code")) {
      return "No matches found.";
    }
    return `ast-grep search failed: ${msg}`;
  }
}

export async function astGrepReplace(
  $: BunShell,
  pattern: string,
  replacement: string,
  options: { lang?: string; path?: string },
): Promise<string> {
  try {
    const target = options.path ?? ".";
    let result;

    if (options.lang) {
      result = await $`sg run --pattern ${pattern} --rewrite ${replacement} --update-all --lang ${options.lang} ${target}`.text();
    } else {
      result = await $`sg run --pattern ${pattern} --rewrite ${replacement} --update-all ${target}`.text();
    }

    return result || "Replacement applied.";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found") || msg.includes("No such file")) {
      return "ast-grep (sg) is not installed. Install with: brew install ast-grep";
    }
    return `ast-grep replace failed: ${msg}`;
  }
}
