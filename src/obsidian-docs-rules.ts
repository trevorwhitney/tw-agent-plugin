// ---------------------------------------------------------------------------
// Obsidian docs rules — injected into the system prompt so the model always
// writes specs and plans to Obsidian and symlinks them back into the repo.
// ---------------------------------------------------------------------------
export const OBSIDIAN_DOCS_RULES = `<obsidian-docs-rules>
## Spec & Plan Storage

When creating specs or plans (\`.md\` files from brainstorming, writing-plans, etc.):

1. Write to Obsidian vault first:
   - Specs: \`/Users/twhitney/Library/CloudStorage/GoogleDrive-trevorjwhitney@gmail.com/My Drive/Obsidian/grafana/planning/specs/<filename>\`
   - Plans: \`/Users/twhitney/Library/CloudStorage/GoogleDrive-trevorjwhitney@gmail.com/My Drive/Obsidian/grafana/planning/plans/<filename>\`
2. Symlink back: \`ln -sf "<obsidian-path>" "docs/superpowers/{specs,plans}/<filename>"\`
3. Never write directly to \`docs/superpowers/\` — always Obsidian + symlink.

</obsidian-docs-rules>`;
