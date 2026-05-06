// ---------------------------------------------------------------------------
// Obsidian docs rules — injected into the system prompt so the model always
// writes specs and plans to Obsidian and symlinks them back into the repo.
// ---------------------------------------------------------------------------
export const OBSIDIAN_DOCS_RULES = `<obsidian-docs-rules>
## Spec & Plan Storage Rules

These rules govern where specs and plans are written. Follow them unconditionally.

### Write specs and plans to Obsidian

When creating specs or plans (via brainstorming, writing-plans skills, or any workflow that produces \`.md\` spec/plan files):

1. **Write the file to the Obsidian vault first:**
   - Specs: \`/Users/twhitney/Library/CloudStorage/GoogleDrive-trevorjwhitney@gmail.com/My Drive/Obsidian/grafana/planning/specs/<filename>\`
   - Plans: \`/Users/twhitney/Library/CloudStorage/GoogleDrive-trevorjwhitney@gmail.com/My Drive/Obsidian/grafana/planning/plans/<filename>\`

2. **Then symlink the file back into the repo:**
   \`\`\`bash
   mkdir -p docs/superpowers/specs docs/superpowers/plans
   # For specs:
   ln -sf "/Users/twhitney/Library/CloudStorage/GoogleDrive-trevorjwhitney@gmail.com/My Drive/Obsidian/grafana/planning/specs/<filename>" "docs/superpowers/specs/<filename>"
   # For plans:
   ln -sf "/Users/twhitney/Library/CloudStorage/GoogleDrive-trevorjwhitney@gmail.com/My Drive/Obsidian/grafana/planning/plans/<filename>" "docs/superpowers/plans/<filename>"
   \`\`\`

3. **Never write specs or plans directly into \`docs/superpowers/\`** — always write to Obsidian and symlink.

</obsidian-docs-rules>`;
