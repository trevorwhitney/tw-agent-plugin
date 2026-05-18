// ---------------------------------------------------------------------------
// Git commit signing rules — injected into the system prompt so the model
// always signs commits and never works around signing failures.
// ---------------------------------------------------------------------------
export const GIT_COMMIT_RULES = `<git-commit-rules>
## Git Commit Signing

Always sign git commits. Use \`git commit -S\` or ensure \`commit.gpgsign=true\` is configured.

If commit signing fails for any reason:
- **Stop immediately** — do not retry without signing, do not find workarounds, do not commit unsigned.
- Raise the issue to the user and wait for their instructions before proceeding.

</git-commit-rules>`;
