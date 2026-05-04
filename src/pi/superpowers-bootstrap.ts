import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

/**
 * Pi equivalent of `${SUPERPOWERS_DIR}/.opencode/plugins/superpowers.js`.
 *
 * On every turn we want the using-superpowers skill body to land in the
 * actual system prompt — not as AGENTS.md context — so the model cannot
 * rationalize past it. This mirrors what the opencode plugin does via
 * `experimental.chat.system.transform`, using pi's `before_agent_start`
 * event instead.
 *
 * The skill file is populated by `scripts/deploy.sh` at:
 *   ~/.pi/agent/skills/superpowers/using-superpowers/SKILL.md
 */

const PI_SKILLS_DIR = join(homedir(), ".pi", "agent", "skills");
const USING_SUPERPOWERS_SKILL = join(
  PI_SKILLS_DIR,
  "superpowers",
  "using-superpowers",
  "SKILL.md",
);

/** Pi-specific tool mapping appended to the bootstrap block. */
const TOOL_MAPPING = `**Tool Mapping for Pi:**
When skills reference tools that don't exist in pi, substitute these:
- \`TodoWrite\` → use beads (\`bd\` CLI via \`bash\`); see beads guidance in your context for commands.
- \`Task\` tool / subagent dispatch → use the \`subagent\` tool (single / parallel / chain modes).
- \`Skill\` tool → there is no native skill tool in pi. To load a skill body, \`read\` the file directly (e.g. \`~/.pi/agent/skills/superpowers/<name>/SKILL.md\`).
- \`Read\`, \`Write\`, \`Edit\`, \`Bash\`, \`Glob\`, \`Grep\` → pi has \`read\`, \`write\`, \`edit\`, \`bash\` natively (use \`bash\` with \`rg\`/\`find\` for glob/grep).

**Skills location for pi:**
Superpowers skills live at \`${join(PI_SKILLS_DIR, "superpowers")}\`. Other skills under \`~/.pi/agent/skills/\` and \`~/.agents/skills/\`.`;

/** Strip YAML frontmatter from a markdown file body. */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1] : content;
}

/**
 * Build the bootstrap block to append to the system prompt.
 *
 * Returns `null` if the using-superpowers skill is not installed — in
 * that case the extension is a no-op and pi behaves as before.
 */
export async function getSuperpowersBootstrap(): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(USING_SUPERPOWERS_SKILL, "utf-8");
  } catch {
    return null;
  }

  const body = stripFrontmatter(raw);

  return `<EXTREMELY_IMPORTANT>
You have superpowers.

**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED — you are currently following it. Do NOT \`read\` the using-superpowers SKILL.md again; that would be redundant.**

${body}

${TOOL_MAPPING}
</EXTREMELY_IMPORTANT>`;
}
