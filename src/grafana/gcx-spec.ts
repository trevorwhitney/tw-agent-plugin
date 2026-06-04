// ---------------------------------------------------------------------------
// gcx command spec — runtime-agnostic source of truth for the gcx_* tools.
//
// Both the opencode adapter (src/grafana/gcx-tools.ts) and the pi adapter
// (src/grafana/gcx-pi.ts) consume these specs to register their tools. The
// spec describes each tool's name, description, parameters, and how to build
// the argv from validated parameters. Neither schema library (zod / TypeBox)
// leaks into this module.
// ---------------------------------------------------------------------------

// ── Neutral parameter descriptors ───────────────────────────────────────────

export type ParamSpec =
  | { kind: "string"; description: string; optional?: boolean }
  | { kind: "boolean"; description: string; optional?: boolean }
  | { kind: "number"; description: string; optional?: boolean }
  | { kind: "enum"; values: string[]; description: string; optional?: boolean };

export type ParamsSpec = Record<string, ParamSpec>;

// Validated argument bag passed to buildArgv. Values are already coerced by the
// host schema library, so we model them loosely here.
export type GcxArgs = Record<string, string | number | boolean | undefined>;

export interface GcxCommandSpec {
  /** Tool name exposed to the model, e.g. "gcx_metrics_query". */
  name: string;
  /** Description for the model. */
  description: string;
  /** Parameter schema in neutral form. */
  params: ParamsSpec;
  /** Build the argv (including the leading "gcx" / binary) from validated args. */
  buildArgv: (args: GcxArgs) => string[];
  /** Human-readable title used in output framing / error messages. */
  title: (args: GcxArgs) => string;
  /** Whether stdout should be parsed + pretty-printed as JSON. */
  json?: boolean | ((args: GcxArgs) => boolean);
  /**
   * Destructive operation requiring confirmation. The string is the action
   * shown to the user; presence of this field tells adapters to prompt.
   */
  destructive?: (args: GcxArgs) => { action: string; metadata: Record<string, unknown> };
}

// ── Shared exec helper ───────────────────────────────────────────────────────

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** A runtime-neutral exec function. opencode binds Bun's `$`; pi binds ctx.exec. */
export type ExecFn = (argv: string[]) => Promise<ExecResult>;

/**
 * Run a gcx command and return its output as a string.
 *
 * Returns formatted text (pretty-printed JSON when `parseJson` is set and the
 * command succeeds) rather than a structured object, so both hosts can wrap
 * the result in their own content shape.
 */
export async function runGcx(
  exec: ExecFn,
  argv: string[],
  title: string,
  parseJson = false,
): Promise<string> {
  const cmdStr = argv.join(" ");
  const { stdout: rawOut, stderr: rawErr, code } = await exec(argv);
  const stdout = rawOut.trim();
  const stderr = rawErr.trim();

  if (code !== 0) {
    const detail = stderr || stdout || `Command failed with exit code ${code}`;
    return `${title} (error)\n$ ${cmdStr}\n\n${detail}`;
  }

  if (parseJson && stdout) {
    try {
      return JSON.stringify(JSON.parse(stdout), null, 2);
    } catch {
      // JSON parse failed — fall through to raw output
    }
  }

  return stdout || "(no output)";
}

/** Resolve a possibly-dynamic json flag against the args. */
export function resolveJson(spec: GcxCommandSpec, args: GcxArgs): boolean {
  return typeof spec.json === "function" ? spec.json(args) : Boolean(spec.json);
}

// ── Helpers for building argv ────────────────────────────────────────────────

const s = (description: string): ParamSpec => ({ kind: "string", description });
const sOpt = (description: string): ParamSpec => ({ kind: "string", description, optional: true });
const bOpt = (description: string): ParamSpec => ({ kind: "boolean", description, optional: true });
const nOpt = (description: string): ParamSpec => ({ kind: "number", description, optional: true });
const enumOpt = (values: string[], description: string): ParamSpec => ({
  kind: "enum",
  values,
  description,
  optional: true,
});

/** Append --from/--to or --since to argv, preferring --since when present. */
function appendTimeRange(parts: string[], args: GcxArgs): void {
  if (args.since) {
    parts.push("--since", String(args.since));
  } else {
    if (args.from) parts.push("--from", String(args.from));
    if (args.to) parts.push("--to", String(args.to));
  }
}

// ── Command specs ─────────────────────────────────────────────────────────────

export const GCX_COMMANDS: GcxCommandSpec[] = [
  // ── Section 1: Config ──────────────────────────────────────────────────────
  {
    name: "gcx_config_check",
    description:
      "Validate the current gcx configuration. Checks that credentials, datasources, and other settings are correct.",
    params: {},
    buildArgv: () => ["gcx", "config", "check"],
    title: () => "gcx config check",
  },
  {
    name: "gcx_config_view",
    description:
      "View the current gcx configuration with secrets redacted. Shows contexts, default datasources, and connection info.",
    params: {},
    buildArgv: () => ["gcx", "config", "view"],
    title: () => "gcx config view",
  },
  {
    name: "gcx_config_use_context",
    description:
      "Switch the active gcx context. A context defines the Grafana instance and credentials to use.",
    params: { context: s("The context name to switch to") },
    buildArgv: (a) => ["gcx", "config", "use-context", String(a.context)],
    title: (a) => `gcx config use-context ${a.context}`,
  },

  // ── Section 2: Datasources ───────────────────────────────────────────────────
  {
    name: "gcx_datasources_list",
    description:
      "List datasources configured in the Grafana instance. Optionally filter by type (prometheus, loki, tempo, pyroscope). Returns JSON.",
    params: {
      type: enumOpt(["prometheus", "loki", "tempo", "pyroscope"], "Filter datasources by type"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "datasources", "list", "-o", "json"];
      if (a.type) parts.push("-t", String(a.type));
      return parts;
    },
    title: () => "gcx datasources list",
    json: true,
  },
  {
    name: "gcx_datasources_get",
    description:
      "Get details for a specific datasource by UID. Returns JSON with connection info, type, and settings.",
    params: { uid: s("The datasource UID") },
    buildArgv: (a) => ["gcx", "datasources", "get", String(a.uid), "-o", "json"],
    title: (a) => `gcx datasources get ${a.uid}`,
    json: true,
  },

  // ── Section 3: Metrics ────────────────────────────────────────────────────────
  {
    name: "gcx_metrics_query",
    description:
      "Execute a PromQL query against a Prometheus datasource. Returns time-series data as JSON or rendered graph.",
    params: {
      datasource_uid: s("The Prometheus datasource UID"),
      query: s("The PromQL query to execute"),
      from: sOpt('Start time (default "now-1h"). Accepts relative (now-1h) or absolute timestamps.'),
      to: sOpt('End time (default "now"). Accepts relative or absolute timestamps.'),
      step: sOpt('Query step/resolution (default "1m"). Examples: 15s, 1m, 5m.'),
      format: enumOpt(["json", "graph"], 'Output format (default "json")'),
    },
    buildArgv: (a) => [
      "gcx", "metrics", "query",
      "-d", String(a.datasource_uid),
      `'${a.query}'`,
      "--from", String(a.from ?? "now-1h"),
      "--to", String(a.to ?? "now"),
      "--step", String(a.step ?? "1m"),
      "-o", String(a.format ?? "json"),
    ],
    title: () => "gcx metrics query",
    json: (a) => (a.format ?? "json") === "json",
  },
  {
    name: "gcx_metrics_labels",
    description:
      "List label names for a Prometheus datasource, or list values for a specific label.",
    params: {
      datasource_uid: s("The Prometheus datasource UID"),
      label: sOpt("A specific label name to get values for. Omit to list all label names."),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "metrics", "labels", "-d", String(a.datasource_uid)];
      if (a.label) parts.push("--label", String(a.label));
      return parts;
    },
    title: () => "gcx metrics labels",
  },
  {
    name: "gcx_metrics_metadata",
    description:
      "Get metric metadata (type, help, unit) from a Prometheus datasource. Optionally filter to a specific metric.",
    params: {
      datasource_uid: s("The Prometheus datasource UID"),
      metric: sOpt("A specific metric name to get metadata for. Omit to list all."),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "metrics", "metadata", "-d", String(a.datasource_uid)];
      if (a.metric) parts.push("--metric", String(a.metric));
      return parts;
    },
    title: () => "gcx metrics metadata",
  },

  // ── Section 4: Logs ───────────────────────────────────────────────────────────
  {
    name: "gcx_logs_query",
    description:
      "Execute a LogQL query against a Loki datasource. Returns log lines or metric results.",
    params: {
      datasource_uid: s("The Loki datasource UID"),
      query: s("The LogQL query to execute"),
      from: sOpt("Start time. Accepts relative (now-1h) or absolute timestamps."),
      to: sOpt("End time. Accepts relative or absolute timestamps."),
      format: enumOpt(["json", "graph"], 'Output format (default "json")'),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "logs", "query", "-d", String(a.datasource_uid), `'${a.query}'`];
      if (a.from) parts.push("--from", String(a.from));
      if (a.to) parts.push("--to", String(a.to));
      parts.push("-o", String(a.format ?? "json"));
      return parts;
    },
    title: () => "gcx logs query",
    json: (a) => (a.format ?? "json") === "json",
  },
  {
    name: "gcx_logs_labels",
    description:
      "List label names for a Loki datasource, or list values for a specific label.",
    params: {
      datasource_uid: s("The Loki datasource UID"),
      label: sOpt("A specific label name to get values for. Omit to list all label names."),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "logs", "labels", "-d", String(a.datasource_uid)];
      if (a.label) parts.push("--label", String(a.label));
      return parts;
    },
    title: () => "gcx logs labels",
  },
  {
    name: "gcx_logs_series",
    description:
      "List log series matching a stream selector from a Loki datasource. Returns unique label combinations.",
    params: {
      datasource_uid: s("The Loki datasource UID"),
      match: s('Log stream selector to match, e.g. {job="myapp"}'),
    },
    buildArgv: (a) => [
      "gcx", "logs", "series",
      "-d", String(a.datasource_uid),
      "-M", `'${a.match}'`,
    ],
    title: () => "gcx logs series",
  },

  // ── Section 5: SLO ────────────────────────────────────────────────────────────
  {
    name: "gcx_slo_list",
    description: "List all SLO definitions in the Grafana Cloud instance. Returns JSON.",
    params: {},
    buildArgv: () => ["gcx", "slo", "definitions", "list", "-o", "json"],
    title: () => "gcx slo definitions list",
    json: true,
  },
  {
    name: "gcx_slo_get",
    description: "Get a specific SLO definition by UUID. Returns full SLO configuration as JSON.",
    params: { uuid: s("The SLO UUID") },
    buildArgv: (a) => ["gcx", "slo", "definitions", "get", String(a.uuid), "-o", "json"],
    title: (a) => `gcx slo definitions get ${a.uuid}`,
    json: true,
  },
  {
    name: "gcx_slo_status",
    description:
      "Check the current status of SLO(s) — remaining error budget, burn rate, and compliance. Omit uuid to see all SLOs.",
    params: {
      uuid: sOpt("SLO UUID. Omit to get status for all SLOs."),
      wide: bOpt("Use wide output format with additional columns"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "slo", "definitions", "status"];
      if (a.uuid) parts.push(String(a.uuid));
      if (a.wide) parts.push("-o", "wide");
      return parts;
    },
    title: () => "gcx slo definitions status",
  },
  {
    name: "gcx_slo_timeline",
    description:
      "Get the historical timeline for an SLO — shows how error budget and compliance changed over time.",
    params: {
      uuid: s("The SLO UUID"),
      from: sOpt("Start time (absolute or relative). Use with to, or use since instead."),
      to: sOpt("End time (absolute or relative). Use with from."),
      since: sOpt('Relative lookback period, e.g. "7d", "24h". Alternative to from/to.'),
      format: enumOpt(["json", "text"], 'Output format (default "text")'),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "slo", "definitions", "timeline", String(a.uuid)];
      appendTimeRange(parts, a);
      if (a.format) parts.push("-o", String(a.format));
      return parts;
    },
    title: (a) => `gcx slo definitions timeline ${a.uuid}`,
    json: (a) => a.format === "json",
  },
  {
    name: "gcx_slo_push",
    description:
      "Push SLO definition(s) from a local file or directory to Grafana Cloud. Supports dry-run to preview changes.",
    params: {
      path: s("Path to an SLO definition file or directory containing definitions"),
      dry_run: bOpt("Preview changes without applying them (default false)"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "slo", "definitions", "push", String(a.path)];
      if (a.dry_run) parts.push("--dry-run");
      return parts;
    },
    title: () => "gcx slo definitions push",
  },
  {
    name: "gcx_slo_pull",
    description: "Pull SLO definitions from Grafana Cloud and save them as local files in a directory.",
    params: { directory: s("Output directory to write SLO definition files to") },
    buildArgv: (a) => ["gcx", "slo", "definitions", "pull", "-d", String(a.directory)],
    title: () => "gcx slo definitions pull",
  },
  {
    name: "gcx_slo_delete",
    description: "Delete an SLO definition from Grafana Cloud by UUID.",
    params: {
      uuid: s("The SLO UUID to delete"),
      force: bOpt("Skip confirmation prompt (default false)"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "slo", "definitions", "delete", String(a.uuid)];
      if (a.force) parts.push("-f");
      return parts;
    },
    title: () => "gcx slo definitions delete",
    destructive: (a) => ({
      action: `gcx slo definitions delete ${a.uuid}`,
      metadata: { resource: "SLO", uuid: a.uuid },
    }),
  },

  // ── Section 6: Alerts ─────────────────────────────────────────────────────────
  {
    name: "gcx_alert_rules_list",
    description:
      "List alert rules from the Grafana instance. Optionally filter by state, group, or folder. Returns JSON.",
    params: {
      state: enumOpt(["firing", "pending", "inactive", "nodata", "error"], "Filter by alert state"),
      group: sOpt("Filter by alert rule group"),
      folder: sOpt("Filter by folder"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "alert", "rules", "list", "-o", "json"];
      if (a.state) parts.push("--state", String(a.state));
      if (a.group) parts.push("--group", String(a.group));
      if (a.folder) parts.push("--folder", String(a.folder));
      return parts;
    },
    title: () => "gcx alert rules list",
    json: true,
  },

  // ── Section 7: Synthetic Monitoring ───────────────────────────────────────────
  {
    name: "gcx_synth_checks_list",
    description: "List all Synthetic Monitoring checks. Returns JSON.",
    params: {},
    buildArgv: () => ["gcx", "synth", "checks", "list", "-o", "json"],
    title: () => "gcx synth checks list",
    json: true,
  },
  {
    name: "gcx_synth_checks_get",
    description: "Get details for a specific Synthetic Monitoring check by ID. Returns JSON.",
    params: { id: s("The check ID") },
    buildArgv: (a) => ["gcx", "synth", "checks", "get", String(a.id), "-o", "json"],
    title: (a) => `gcx synth checks get ${a.id}`,
    json: true,
  },
  {
    name: "gcx_synth_checks_status",
    description: "Check the current status of Synthetic Monitoring check(s). Omit id to see all checks.",
    params: { id: sOpt("Check ID. Omit to get status for all checks.") },
    buildArgv: (a) => {
      const parts = ["gcx", "synth", "checks", "status"];
      if (a.id) parts.push(String(a.id));
      return parts;
    },
    title: () => "gcx synth checks status",
  },
  {
    name: "gcx_synth_checks_timeline",
    description:
      "Get the historical timeline for a Synthetic Monitoring check — shows how check results changed over time.",
    params: {
      id: s("The check ID"),
      from: sOpt("Start time (absolute or relative). Use with to, or use since instead."),
      to: sOpt("End time (absolute or relative). Use with from."),
      since: sOpt('Relative lookback period, e.g. "7d", "24h". Alternative to from/to.'),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "synth", "checks", "timeline", String(a.id)];
      appendTimeRange(parts, a);
      return parts;
    },
    title: (a) => `gcx synth checks timeline ${a.id}`,
  },
  {
    name: "gcx_synth_checks_create",
    description: "Create a new Synthetic Monitoring check from a YAML/JSON definition file.",
    params: { file: s("Path to YAML/JSON check definition file") },
    buildArgv: (a) => ["gcx", "synth", "checks", "create", "-f", String(a.file)],
    title: () => "gcx synth checks create",
  },
  {
    name: "gcx_synth_checks_update",
    description: "Update an existing Synthetic Monitoring check from a YAML/JSON definition file.",
    params: {
      id: s("The check ID to update"),
      file: s("Path to YAML/JSON check definition file"),
    },
    buildArgv: (a) => ["gcx", "synth", "checks", "update", String(a.id), "-f", String(a.file)],
    title: (a) => `gcx synth checks update ${a.id}`,
  },
  {
    name: "gcx_synth_checks_delete",
    description: "Delete a Synthetic Monitoring check by ID.",
    params: {
      id: s("The check ID to delete"),
      force: bOpt("Skip confirmation prompt (default false)"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "synth", "checks", "delete", String(a.id)];
      if (a.force) parts.push("-f");
      return parts;
    },
    title: () => "gcx synth checks delete",
    destructive: (a) => ({
      action: `gcx synth checks delete ${a.id}`,
      metadata: { resource: "Synthetic Check", id: a.id },
    }),
  },
  {
    name: "gcx_synth_probes_list",
    description: "List all available Synthetic Monitoring probes. Returns JSON.",
    params: {},
    buildArgv: () => ["gcx", "synth", "probes", "list", "-o", "json"],
    title: () => "gcx synth probes list",
    json: true,
  },

  // ── Section 8: Resources ──────────────────────────────────────────────────────
  {
    name: "gcx_resources_get",
    description:
      'Get Grafana resources by selector (e.g. "dashboards", "dashboards/uid", "AlertRule"). Returns resource data.',
    params: {
      selector: s('Resource selector, e.g. "dashboards", "dashboards/uid", "AlertRule"'),
      format: enumOpt(["json", "yaml", "text"], "Output format"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "resources", "get", String(a.selector)];
      if (a.format) parts.push("-o", String(a.format));
      return parts;
    },
    title: (a) => `gcx resources get ${a.selector}`,
    json: (a) => a.format === "json",
  },
  {
    name: "gcx_resources_push",
    description:
      "Push local resource files to Grafana. Supports dry-run and cross-environment promotion via context.",
    params: {
      path: s("Path to resource file or directory to push"),
      dry_run: bOpt("Preview changes without applying them (default false)"),
      context: sOpt("Target context for cross-environment promotion"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "resources", "push", String(a.path)];
      if (a.dry_run) parts.push("--dry-run");
      if (a.context) parts.push("--context", String(a.context));
      return parts;
    },
    title: () => "gcx resources push",
  },
  {
    name: "gcx_resources_pull",
    description: "Pull Grafana resources and save them as local files. Optionally filter by selector.",
    params: {
      path: s("Output directory to write resource files to"),
      selector: sOpt("Resource selector to filter what to pull"),
      context: sOpt("Source context to pull from"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "resources", "pull", "-p", String(a.path)];
      if (a.selector) parts.push(String(a.selector));
      if (a.context) parts.push("--context", String(a.context));
      return parts;
    },
    title: () => "gcx resources pull",
  },
  {
    name: "gcx_resources_delete",
    description: "Delete a Grafana resource by selector.",
    params: {
      selector: s("Resource selector to delete"),
      force: bOpt("Skip confirmation prompt (default false)"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "resources", "delete", String(a.selector)];
      if (a.force) parts.push("-f");
      return parts;
    },
    title: (a) => `gcx resources delete ${a.selector}`,
    destructive: (a) => ({
      action: `gcx resources delete ${a.selector}`,
      metadata: { resource: "Grafana Resource", selector: a.selector },
    }),
  },
  {
    name: "gcx_resources_validate",
    description: "Validate resource files against the Grafana API schema.",
    params: { path: s("Path to resource file or directory to validate") },
    buildArgv: (a) => ["gcx", "resources", "validate", String(a.path)],
    title: () => "gcx resources validate",
  },

  // ── Section 9: Dashboards ─────────────────────────────────────────────────────
  {
    name: "gcx_dashboards_list",
    description: "List all dashboards in the Grafana instance. Returns JSON.",
    params: {},
    buildArgv: () => ["gcx", "dashboards", "list", "-o", "json"],
    title: () => "gcx dashboards list",
    json: true,
  },
  {
    name: "gcx_dashboards_get",
    description: "Get a specific dashboard by UID. Returns full dashboard JSON.",
    params: { uid: s("The dashboard UID") },
    buildArgv: (a) => ["gcx", "dashboards", "get", String(a.uid), "-o", "json"],
    title: (a) => `gcx dashboards get ${a.uid}`,
    json: true,
  },
  {
    name: "gcx_dashboards_search",
    description: "Search dashboards by query string. Returns matching dashboards as JSON.",
    params: { query: s("The search query") },
    buildArgv: (a) => ["gcx", "dashboards", "search", `'${a.query}'`, "-o", "json"],
    title: () => "gcx dashboards search",
    json: true,
  },
  {
    name: "gcx_dashboards_snapshot",
    description: "Capture a visual snapshot (PNG image) of a dashboard or individual panel.",
    params: {
      uid: s("The dashboard UID"),
      output_dir: sOpt("Output directory for the snapshot image"),
      from: sOpt("Start time (absolute or relative)"),
      to: sOpt("End time (absolute or relative)"),
      since: sOpt('Relative lookback period, e.g. "7d", "24h". Alternative to from/to.'),
      panel: sOpt("Panel ID to snapshot a specific panel"),
      width: nOpt("Image width in pixels"),
      height: nOpt("Image height in pixels"),
      theme: enumOpt(["light", "dark"], "Dashboard theme"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "dashboards", "snapshot", String(a.uid)];
      if (a.output_dir) parts.push("-o", String(a.output_dir));
      appendTimeRange(parts, a);
      if (a.panel) parts.push("--panel", String(a.panel));
      if (a.width !== undefined) parts.push("--width", String(a.width));
      if (a.height !== undefined) parts.push("--height", String(a.height));
      if (a.theme) parts.push("--theme", String(a.theme));
      return parts;
    },
    title: (a) => `gcx dashboards snapshot ${a.uid}`,
  },

  // ── Section 10: Dev ───────────────────────────────────────────────────────────
  {
    name: "gcx_dev_scaffold",
    description: "Scaffold a new Grafana resources-as-code project with boilerplate structure.",
    params: {
      project: sOpt("Project name"),
      go_module_path: sOpt("Go module path for the project"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "dev", "scaffold"];
      if (a.project) parts.push("--project", String(a.project));
      if (a.go_module_path) parts.push("--go-module-path", String(a.go_module_path));
      return parts;
    },
    title: () => "gcx dev scaffold",
  },
  {
    name: "gcx_dev_generate",
    description: "Generate typed Go stubs for Grafana resources (dashboards, alert rules).",
    params: {
      path: s("Path to generate stubs into"),
      type: enumOpt(["dashboard", "alertrule"], "Resource type to generate"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "dev", "generate", String(a.path)];
      if (a.type) parts.push("--type", String(a.type));
      return parts;
    },
    title: () => "gcx dev generate",
  },
  {
    name: "gcx_dev_import",
    description:
      "Import existing Grafana dashboards as Go builder code. Optionally target a specific dashboard by UID.",
    params: {
      uid: sOpt("Specific dashboard UID to import"),
      path: sOpt("Output directory for the imported code"),
    },
    buildArgv: (a) => {
      const selector = a.uid ? `dashboards/${a.uid}` : "dashboards";
      const parts = ["gcx", "dev", "import", selector];
      if (a.path) parts.push("--path", String(a.path));
      return parts;
    },
    title: () => "gcx dev import dashboards",
  },
  {
    name: "gcx_help_tree",
    description:
      "Show the gcx command tree. Useful for discovering available commands and subcommands.",
    params: {
      group: sOpt("Command group to drill into"),
      depth: nOpt("Depth of the command tree (default 1)"),
    },
    buildArgv: (a) => {
      const parts = ["gcx", "help-tree"];
      if (a.group) parts.push(String(a.group));
      parts.push("--depth", String(a.depth ?? 1), "-o", "text");
      return parts;
    },
    title: () => "gcx help-tree",
  },

  // ── Section 11: Tunnel ────────────────────────────────────────────────────────
  // gcx does not yet provide a tunnel command. This wraps
  // `grafana-assistant tunnel connect` until gcx absorbs the functionality.
  {
    name: "gcx_tunnel_connect",
    description:
      "Open a local tunnel to a Grafana instance so the agent can reach private/local " +
      "datasources and tooling. Currently wraps `grafana-assistant tunnel connect` because " +
      "gcx does not yet provide a native tunnel command.",
    params: {},
    buildArgv: () => ["grafana-assistant", "tunnel", "connect"],
    title: () => "grafana-assistant tunnel connect",
  },
];
