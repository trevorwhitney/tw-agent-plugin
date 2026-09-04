// ---------------------------------------------------------------------------
// Obsidian docs rules — injected into the system prompt so the model always
// writes specs and plans to Obsidian and symlinks them back into the repo.
// ---------------------------------------------------------------------------
export const OBSIDIAN_DOCS_RULES = `<obsidian-docs-rules>
## Spec & Plan Storage

When creating a persistent spec or plan:

1. Write to Obsidian vault first:
   - Specs: \`/Users/twhitney/Library/CloudStorage/GoogleDrive-trevorjwhitney@gmail.com/My Drive/Obsidian/grafana/planning/specs/<filename>\`
   - Plans: \`/Users/twhitney/Library/CloudStorage/GoogleDrive-trevorjwhitney@gmail.com/My Drive/Obsidian/grafana/planning/plans/<filename>\`
2. Ensure the corresponding \`docs/specs/\` or \`docs/plans/\` directory exists.
3. Symlink the Obsidian file into the corresponding repository directory.
4. Never write the repository copy directly — always use Obsidian + symlink.

</obsidian-docs-rules>`;
