# Tool Priority Rules

These rules override default tool selection. Follow them unconditionally.

## GitHub: prefer `gh` CLI over GitHub MCP tools

When performing ANY GitHub operation (PRs, issues, releases, actions, repo management):

1. **Always use the `gh` CLI via the Bash tool first.**
2. Only fall back to GitHub MCP tools (`github_*`) when:
   - `gh` fails or returns an error for the specific operation
   - The operation is genuinely not supported by `gh` (rare)
   - The user explicitly asks you to use a specific MCP tool

Common operations — use these instead of MCP tools:
- `gh pr view <number>` instead of `github_get_pull_request`
- `gh pr list` instead of `github_list_pull_requests`
- `gh pr diff <number>` instead of `github_get_pull_request_files`
- `gh pr checks <number>` instead of `github_get_pull_request_status`
- `gh pr create` instead of `github_create_pull_request`
- `gh pr review <number>` instead of `github_create_pull_request_review`
- `gh issue view <number>` instead of `github_get_issue`
- `gh issue list` instead of `github_list_issues`
- `gh issue create` instead of `github_create_issue`
- `gh api <endpoint>` for any REST/GraphQL call not covered above

## Grafana / Grafana Cloud: prefer the built-in `gcx_*` tools over Grafana MCP tools and raw API calls

When querying Grafana or managing Grafana Cloud resources (metrics, logs, traces, alerts, dashboards, SLOs, synthetic checks, datasources, resources-as-code):

1. **Always use the built-in `gcx_*` tools first.**
2. Use `gcx_help_tree` to discover available capabilities before attempting an unfamiliar operation.
3. For private/local datasources, open a tunnel first with `gcx_tunnel_connect`.
4. Only fall back to Grafana MCP tools (`mcp-grafana_*`) when:
   - The `gcx_*` tools do not support the operation
   - The user explicitly asks you to use a specific MCP tool

Common operations — use these instead of MCP tools or raw API calls:
- `gcx_resources_pull` / `gcx_resources_push` for dashboard sync
- `gcx_slo_*` for SLO lifecycle management and status
- `gcx_synth_checks_*` for synthetic monitoring CRUD and status
- `gcx_alert_rules_list` for alert investigation
- `gcx_metrics_query` / `gcx_logs_query` for datasource queries
- `gcx_datasources_list` for datasource discovery
- `gcx_dev_scaffold` / `gcx_dev_generate` / `gcx_dev_import` for dashboard-as-code workflows
- `gcx_tunnel_connect` to reach private/local datasources

# Worktrees

Place worktrees as siblings to this project directory, under `~/workspace/project/`.
For example, a worktree tracking branch `foo` should go to `~/workspace/project/foo`.
