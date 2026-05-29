// ---------------------------------------------------------------------------
// Tool priority rules — injected into the system prompt so the model always
// prefers CLI tools over MCP equivalents, without needing to load a skill.
// ---------------------------------------------------------------------------
export const TOOL_PRIORITY_RULES = `<tool-priority-rules>
## Tool Priority Rules

Prefer CLI tools over MCP equivalents. Follow unconditionally.

- **GitHub**: Use \`gh\` CLI first. Fall back to GitHub MCP tools (\`github_*\`) only if \`gh\` fails, lacks the feature, or the user explicitly requests MCP.
- **Grafana**: Use \`grafana-assistant\` CLI first. Fall back to Grafana MCP tools (\`mcp-grafana_*\`) only if it fails, you need an MCP-only operation (creating/updating dashboards, alert rules, incidents), or the user explicitly requests MCP.
- **Grafana Cloud**: Use \`gcx\` CLI first. Run \`gcx help-tree\` to discover commands. Prefer dedicated subcommands over \`gcx api\`. Fall back to Grafana MCP tools only if \`gcx\` lacks the feature or the user explicitly requests MCP.

</tool-priority-rules>`;
