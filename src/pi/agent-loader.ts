import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

export type LoadedAgent = {
  name: string;
  model: string;
  tools?: string;
  systemPrompt: string;
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const KEY_VALUE_RE = /^([\w-]+)\s*:\s*(.*)$/;

function parseAgentFile(path: string, raw: string): LoadedAgent {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) throw new Error(`frontmatter missing or malformed in ${path}`);

  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const kv = line.match(KEY_VALUE_RE);
    if (!kv) continue;
    fields[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }

  if (!fields.model) throw new Error(`model field missing in frontmatter: ${path}`);

  const tools = fields.tools && fields.tools.trim().length > 0 ? fields.tools : undefined;

  return {
    name: fields.name ?? "",
    model: fields.model,
    tools,
    systemPrompt: m[2],
  };
}

export function createAgentLoader(agentsDir?: string): {
  loadAgent: (name: string) => Promise<LoadedAgent>;
} {
  const dir = agentsDir ?? join(homedir(), ".pi", "agent", "agents");
  const cache = new Map<string, LoadedAgent>();

  async function loadAgent(name: string): Promise<LoadedAgent> {
    const cached = cache.get(name);
    if (cached) return cached;

    const path = join(dir, `${name}.md`);
    let raw: string;
    try {
      raw = await readFile(path, "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`agent not found: ${name}; expected ${path}`);
      }
      throw err;
    }

    const agent = parseAgentFile(path, raw);
    cache.set(name, agent);
    return agent;
  }

  return { loadAgent };
}
