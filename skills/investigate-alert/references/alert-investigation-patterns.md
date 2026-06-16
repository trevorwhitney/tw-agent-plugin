# Alert Investigation Patterns

Reference for investigating Grafana alerts with gcx. Covers the alert
JSON structure, common investigation query patterns, graph interpretation,
and the companion CLIs (`gh`, `slackcli`, `kubectl`) used to pull in
related context.

---

## Alert JSON Structure

`gcx alert rules list -o json` returns an array of alert groups. Each
group contains an array of rules:

```json
[
  {
    "name": "MyAlertGroup",
    "file": "grafana",
    "rules": [
      {
        "state": "firing",
        "name": "HighErrorRate",
        "query": "rate(http_requests_total{status=~\"5..\"}[5m]) / rate(http_requests_total[5m]) > 0.05",
        "duration": 300,
        "labels": {
          "severity": "critical",
          "cluster": "us-east-1"
        },
        "annotations": {
          "summary": "High error rate detected on {{ $labels.job }}",
          "description": "Error rate is {{ $value | humanizePercentage }}",
          "runbook_url": "https://github.com/myorg/runbooks/blob/main/alerts/HighErrorRate.md",
          "dashboard_url": "https://grafana.example.com/d/abc123"
        },
        "alerts": [
          {
            "labels": {
              "alertname": "HighErrorRate",
              "job": "api-server",
              "namespace": "production"
            },
            "annotations": { ... },
            "state": "firing",
            "activeAt": "2024-01-15T10:23:45Z",
            "value": "0.08"
          }
        ],
        "type": "alerting",
        "datasourceUID": "prometheus-uid-abc123"
      }
    ]
  }
]
```

### Key Fields

| Field | Description |
|-------|-------------|
| `state` | `firing`, `pending`, `inactive` |
| `type` | `alerting` (fires alerts) or `recording` (pre-calculates metrics) |
| `query` | The PromQL or LogQL expression that drives the alert |
| `datasourceUID` | UID of the datasource to query for investigation |
| `labels` | Rule-level labels (severity, team, cluster) |
| `annotations.runbook_url` | Link to runbook; fetch with `gh api` for GitHub URLs |
| `annotations.dashboard_url` | Link to related Grafana dashboard |
| `alerts[]` | Currently firing alert instances with their label sets and current values |
| `alerts[].activeAt` | When this instance began firing |
| `alerts[].value` | The numeric value that triggered the alert |

### Extracting the Alert Query

```bash
# Get the query for a specific alert
gcx alert rules list -o json | \
  jq -r '.[] | .rules[] | select(.name == "<AlertName>") | .query'

# Get the datasource UID for a specific alert
gcx alert rules list -o json | \
  jq -r '.[] | .rules[] | select(.name == "<AlertName>") | .datasourceUID'

# Get all currently firing instances with their label sets
gcx alert rules list -o json | \
  jq '.[] | .rules[] | select(.name == "<AlertName>") | .alerts[] | select(.state == "firing")'
```

---

## JSON Response Envelopes

Quick reference for `-o json` output to avoid jq guessing:

| Command | Envelope | jq Access Pattern |
|---------|----------|-------------------|
| `alert rules list` | `[{name, rules: [...]}]` | `.[] \| .rules[]` |
| `datasources list` | `{"datasources": [...]}` | `.datasources[]` |
| `query` (Prometheus) | `{"status", "data": {"resultType", "result": [...]}}` | `.data.result[]` |

---

## Common Investigation Query Patterns

### Latency Alerts

For P99/P95 latency alerts:

```bash
# Current latency percentiles
gcx metrics query <uid> \
  'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))' \
  --from now-1h --to now --step 1m -o graph

# Latency by endpoint
gcx metrics query <uid> \
  'histogram_quantile(0.99, sum by(job, handler) (rate(http_request_duration_seconds_bucket[5m])))' \
  --from now-1h --to now --step 1m -o json
```

### Error Rate Alerts

For alerts on HTTP 5xx or error rates:

```bash
# Overall error rate
gcx metrics query <uid> \
  'rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])' \
  --from now-1h --to now --step 1m -o graph

# Error rate by service
gcx metrics query <uid> \
  'sum by(job) (rate(http_requests_total{status=~"5.."}[5m])) / sum by(job) (rate(http_requests_total[5m]))' \
  --from now-1h --to now --step 1m -o json
```

### Resource Exhaustion Alerts

For CPU, memory, or disk alerts:

```bash
# CPU usage by pod
gcx metrics query <uid> \
  'sum by(pod) (rate(container_cpu_usage_seconds_total[5m]))' \
  --from now-1h --to now --step 1m -o graph

# Memory usage
gcx metrics query <uid> \
  'container_memory_working_set_bytes{container!=""}' \
  --from now-30m --to now --step 1m -o json

# Disk free percentage
gcx metrics query <uid> \
  'node_filesystem_avail_bytes / node_filesystem_size_bytes' \
  --from now-6h --to now --step 5m -o graph
```

### Certificate / TLS Alerts

For cert expiry alerts:

```bash
# Days until certificate expiry
gcx metrics query <uid> \
  '(certmanager_certificate_expiration_timestamp_seconds - time()) / 86400' \
  --from now-1h --to now --step 10m -o json
```

### Availability / SLO Alerts

For availability or SLO breach alerts:

```bash
# Uptime over last hour
gcx metrics query <uid> \
  'avg_over_time(up[1h])' \
  --from now-6h --to now --step 5m -o graph

# Current up/down status
gcx metrics query <uid> \
  'up == 0' \
  --from now-15m --to now --step 1m -o json
```

---

## Loki Log Investigation Patterns

After identifying an issue from metrics, correlate with logs:

```bash
# Find error logs for a service
gcx logs query <loki-uid> '{job="api-server"} |= "error"' \
  --from now-1h --to now -o json

# Find logs around the time the alert started firing (replace timestamp)
gcx logs query <loki-uid> '{namespace="production"} |= "error"' \
  --from 2024-01-15T10:00:00Z --to 2024-01-15T10:30:00Z -o json

# Rate of error log lines (for trend analysis)
gcx logs query <loki-uid> 'rate({job="api-server"} |= "error" [5m])' \
  --from now-2h --to now --step 1m -o graph
```

### Querying at Scale

Loki metric queries (`rate()`, `count_over_time()`, etc.) produce one series per unique label combination. At scale this hits series limits (default 20K). Always aggregate:

```bash
# BAD — one series per pod/namespace/level/... combination
gcx logs query <loki-uid> 'count_over_time({job="app"} [5m])'

# GOOD — aggregate down to what you need
gcx logs query <loki-uid> 'sum(count_over_time({job="app"} [5m]))'
gcx logs query <loki-uid> 'sum by(level) (count_over_time({job="app"} | json [5m]))'
gcx logs query <loki-uid> 'topk(10, sum by(pod) (rate({job="app"} [5m])))'
```

Rule of thumb: if your query uses `rate()`, `count_over_time()`, or `bytes_over_time()`, wrap it with `sum()`, `sum by(label)`, or `topk()`.

### Stream Labels vs Extracted Labels

Loki has two kinds of labels — confusing them causes silent failures:

| | Stream labels | Extracted labels |
|---|---|---|
| Set by | Log ingestion config | Parser stages (`| json`, `| logfmt`) |
| Used in | Stream selector `{job="app"}` | Filter expressions after `|` |
| Indexed | Yes (fast) | No (line-by-line scan) |
| Available | Always | Only after parser stage |

Common mistakes:
- Filtering extracted labels in `{}` — fails silently: `{namespace="prod", pod="app-123"}` won't work if `pod` is extracted, not a stream label
- Using `label_format` to rename extracted fields before they're parsed — add the parser stage first
- Assuming a field visible in Grafana Explore is a stream label — check with `gcx logs labels -d <uid>` (only shows stream labels)

---

## Interpreting Graph Output

`-o graph` renders an ASCII time-series chart in the terminal. Key patterns:

| Visual Pattern | Likely Cause |
|----------------|--------------|
| Sudden vertical spike | Deployment, config change, or external event |
| Gradual rising trend | Resource accumulation (memory leak, disk fill) |
| Flat high value | Persistent overload or misconfiguration |
| Periodic spikes | Cron job, scheduled task, or traffic surge |
| Drop to zero then spike | Process restart or deployment rollout |
| Sawtooth pattern | Crash-loop or auto-scaling oscillation |

Use `-o json` after `-o graph` to extract exact values:
```bash
# Get the peak value during the alert window
gcx metrics query <uid> '<query>' --from now-2h --to now --step 1m -o json | \
  jq '[.data[].values[] | .value] | max'
```

---

## GitHub Investigation (`gh`)

Use `gh` for any GitHub URL or when correlating an alert with code changes.

### Runbook Fetching

If the alert annotation contains a GitHub runbook URL, fetch it with:

```bash
gh api /repos/<owner>/<repo>/contents/<path> --jq '.content' | base64 -d
```

For non-GitHub URLs, use `curl`:

```bash
curl -s "<runbook_url>"
```

### Correlating With Deployments

A new spike often lines up with a recent merge. Check what shipped:

```bash
# Recently merged PRs
gh pr list --repo <owner>/<repo> --state merged --limit 10 \
  --json number,title,mergedAt,author \
  --jq '.[] | "\(.mergedAt)  #\(.number)  \(.title)  (@\(.author.login))"'

# Recent commits on the default branch
gh api /repos/<owner>/<repo>/commits \
  --jq '.[0:10] | .[] | "\(.commit.committer.date)  \(.sha[0:7])  \(.commit.message | split("\n")[0])"'

# A specific PR's diff (to see exactly what changed)
gh pr diff <number> --repo <owner>/<repo>

# Open issues mentioning the alert or symptom
gh issue list --repo <owner>/<repo> --search "<symptom>" --state open \
  --json number,title --jq '.[] | "#\(.number)  \(.title)"'
```

Always confirm the repo `<owner>/<repo>` with the user if it isn't in the
annotations; don't guess.

---

## Slack Investigation (`slackcli`)

`slackcli` is read-only. Use it whenever the alert, its annotations, or the
user reference a Slack thread or channel — it translates a Slack permalink
into the right API call and returns the discussion context.

### Resolving a Permalink

`slackcli resolve` parses a Slack URL (no API call) and prints the
equivalent command. Add `--run` to execute it, and `--json` for structured
output:

```bash
# See what command a link maps to (no API call)
slackcli resolve 'https://grafana.slack.com/archives/C0123ABCDEF/p1699876543210456'

# Resolve and run in one step, JSON output for parsing
slackcli resolve --run --json \
  'https://grafana.slack.com/archives/C0123ABCDEF/p1699876543210456?thread_ts=1699876000.000000'
```

URL → command mapping:

| URL shape | Resolves to |
|-----------|-------------|
| `/archives/C123` | `slackcli get channel C123` |
| `/archives/C123/p<ts>` | `slackcli list threads C123 <ts>` |
| `/archives/C123/p<ts>?thread_ts=<root>` | `slackcli list threads C123 <root>` |

### Direct Lookups

```bash
# Recent messages in a channel
slackcli list messages <channel-id> --json

# Replies in a thread (root ts in 1699876000.000000 form)
slackcli list threads <channel-id> <thread-ts> --json

# Channel or user details
slackcli get channel <channel-id> --json
slackcli get user <user-id> --json

# Search messages (Real-time Search API)
slackcli search messages "<query>" --json
```

Note the `p1699876543210456` permalink form is the ts without the dot;
`resolve` converts it to `1699876543.210456` for you, so prefer `resolve`
over hand-converting timestamps.

---

## Kubernetes Investigation (`kubectl`)

When infrastructure or a specific workload is a suspected cause and you have
cluster access, inspect live state. Pull the `namespace`, `pod`, or
`deployment`/`job` from the alert's labels. These commands are read-only.

```bash
# Pod state and restart counts for the affected workload
kubectl get pods -n <namespace> -o wide
kubectl get pods -n <namespace> -l app=<app> -o wide

# Recent events (deploys, OOMKills, scheduling failures, probe failures)
kubectl get events -n <namespace> --sort-by=.lastTimestamp | tail -20

# Deployment rollout status and history (did something just ship?)
kubectl rollout status deployment/<name> -n <namespace>
kubectl rollout history deployment/<name> -n <namespace>
kubectl describe deployment <name> -n <namespace>

# Why a pod is unhealthy — describe shows restart reason, last state, events
kubectl describe pod <pod> -n <namespace>

# Logs from a crashing/previous container instance
kubectl logs <pod> -n <namespace> --previous --tail=100
kubectl logs <pod> -n <namespace> -c <container> --tail=100

# Resource pressure (requires metrics-server)
kubectl top pods -n <namespace>
kubectl top nodes
kubectl describe node <node>   # Allocatable vs requests, pressure conditions
```

Map alert classes to the most useful checks:

| Alert class | First kubectl checks |
|-------------|----------------------|
| Connection / endpoint down | `get pods` (Ready/restarts), `get events`, `describe pod` |
| Crash-loop / restarts | `describe pod`, `logs --previous` |
| Resource exhaustion (CPU/mem) | `top pods`, `top nodes`, `describe node` |
| Latency / rollout regression | `rollout history`, `rollout status`, `describe deployment` |

Prefer the gcx/Prometheus metrics for trend and history; use `kubectl` for
the current live state and the human-readable reason (events, last
termination state) behind it. Confirm which cluster/context `kubectl` points
at (`kubectl config current-context`) if there's any ambiguity.

---

## See Also

- [Grafana Alert Rules documentation](https://grafana.com/docs/grafana/latest/alerting/)
- The `setup-gcx` skill for configuring gcx if not yet set up
