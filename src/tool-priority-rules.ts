// ---------------------------------------------------------------------------
// Tool priority rules — injected into the system prompt so the model always
// prefers CLI tools over MCP equivalents, without needing to load a skill.
// ---------------------------------------------------------------------------
export const TOOL_PRIORITY_RULES = `<tool-priority-rules>
## Tool Priority Rules

Prefer CLI tools over MCP equivalents. Follow unconditionally.

- **GitHub**: Use \`gh\` CLI first. Fall back to GitHub MCP tools (\`github_*\`) only if \`gh\` fails, lacks the feature, or the user explicitly requests MCP.
- **Grafana / Grafana Cloud**: Use the built-in \`gcx_*\` tools first (e.g. \`gcx_metrics_query\`, \`gcx_logs_query\`, \`gcx_alert_rules_list\`, \`gcx_slo_status\`, \`gcx_dashboards_list\`, \`gcx_resources_pull\`). Use \`gcx_help_tree\` to discover capabilities. For private/local datasources, open a tunnel first with \`gcx_tunnel_connect\`. Fall back to Grafana MCP tools (\`mcp-grafana_*\`) only if the \`gcx_*\` tools lack the operation or the user explicitly requests MCP.
- **Slack**: For **reading**, use the \`slackcli\` CLI first — it is read-only, works across harnesses, and supports multiple workspaces via \`--context\`. Route a pasted Slack permalink through \`slackcli resolve <url> --run --json\`; otherwise use \`slackcli list messages|threads\`, \`slackcli get channel|user\`, \`slackcli search messages|channels|users\`. Use the **Slack MCP** (\`slack_*\` tools, opencode only) for two things: (1) **writing** — send/schedule messages, DMs, reactions, canvases; and (2) reads \`slackcli\` cannot do — \`list_channel_members\`, message \`get_reactions\`, file/canvas contents (\`read_file\`, \`read_canvas\`), \`search_emojis\`, and finding users by email/profile attributes. Do not use the Slack MCP for reads \`slackcli\` already covers.

</tool-priority-rules>`;
