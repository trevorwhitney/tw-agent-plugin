---
name: coordinator
description: Orchestrate multiple Superset workspace agents through spawn, monitoring, communication, integration, and cleanup.
allowed-tools: Bash, Read
disable-model-invocation: true
---

# Superset Agent Coordinator

Coordinate terminal agents in isolated Superset workspaces. Do not implement
their tasks yourself. Own task boundaries, dependencies, monitoring, review,
integration order, and cleanup.

## Establish the Control Surface

1. Run `superset auth whoami --json`.
2. Run `superset terminals --help` and require `list`, `read`, `send`, and
   `close`. If they are missing, run `superset update` and check again.
3. Resolve available hosts, terminal-capable agents, projects, and workspaces:

```bash
superset hosts list --json
superset agents list --local --json
superset projects list --local --json
superset workspaces list --local --json
```

Never use `--agent superset`; it creates a chat session that terminal read/send
commands cannot control. Pass `--host <host-id>` consistently when coordinating
on a remote host. When targeting the current workspace, pass
`--workspace "$SUPERSET_WORKSPACE_ID"` explicitly to agent and terminal
commands.

## Track the Work

Maintain a compact table in the working context:

| Task | Dependencies | Workspace | Host | Terminal | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |

Use `pending`, `ready`, `running`, `completed`, `blocked`, or `failed`. Superset
organization tasks are issue-tracker records, not orchestration state; do not
create or update them unless the user asks.

Prefer independent tasks with shallow dependencies. Editing workers need
separate workspaces and branches. Sharing a workspace is appropriate only for
read-only work or explicitly non-overlapping changes.

## Define the Worker Contract

Every worker prompt must include:

- a stable task ID and bounded objective;
- the files or subsystem it owns;
- acceptance criteria and verification commands;
- dependency results it needs;
- instructions not to broaden scope or overwrite unrelated changes;
- one completion envelope.

```text
SUPERSET_WORKER_DONE
task: <task-id>
summary: <one-line outcome>
files: <comma-separated paths or none>
checks: <commands and outcomes>
handoff: <next-step context or none>
```

```text
SUPERSET_WORKER_BLOCKED
task: <task-id>
reason: <specific blocker>
needs: <decision, access, or dependency required>
```

These markers are prompt conventions visible in terminal output, not durable
Superset status events.

## Spawn Isolated Workers

Create a workspace from the intended base branch, then launch one terminal
agent in it:

```bash
superset workspaces create \
  --local \
  --project <project-id> \
  --name <workspace-name> \
  --branch <branch-name> \
  --base-branch <base-branch> \
  --json

superset agents create \
  --workspace <workspace-id> \
  --agent <terminal-agent-id> \
  --prompt "<worker-prompt>" \
  --json
```

For remote work, replace `--local` with `--host <host-id>` and pass that host to
agent and terminal commands. Require the agent result's `kind` to be `terminal`
and record its `sessionId` as the terminal ID. Launch all ready, independent
workers before monitoring them.

## Monitor Workers

Reacquire terminal IDs after losing context with:

```bash
superset terminals list \
  --workspace <workspace-id> \
  --host <host-id> \
  --json
```

Read a worker's recent output with:

```bash
superset terminals read \
  --workspace <workspace-id> \
  --host <host-id> \
  --terminal <terminal-id> \
  --max-lines 240 \
  --json
```

For local workspaces, omit `--host`. Poll at a measured cadence and read every
running worker during each pass. `terminals list` reports live sessions, not
agent state. Do not infer completion from terminal presence, title, or
other terminal metadata. Mark a task complete only after reading its completion
envelope and checking the supporting output.

## Communicate

Send clarification, dependency results, review feedback, or commands into the
existing terminal session:

```bash
superset terminals send \
  --workspace <workspace-id> \
  --host <host-id> \
  --terminal <terminal-id> \
  --text "<follow-up>" \
  --json
```

For local workspaces, omit `--host`. Preserve the task-to-terminal mapping;
terminal discovery alone cannot identify semantic recipients.

To run a shell command independently of the agent, create a terminal in the
workspace and record the returned terminal ID:

```bash
superset terminals create \
  --workspace <workspace-id> \
  --host <host-id> \
  --command "<command>" \
  --json
```

For local workspaces, omit `--host`. Read that terminal for its output and close
it when it is no longer needed.

## Advance Dependencies

1. Promote a pending task to `ready` only when all dependencies are completed.
2. Include dependency results in a new worker prompt or send them to the
   dependent worker's existing terminal.
3. Mark a task `blocked` when it emits `SUPERSET_WORKER_BLOCKED`; resolve the
   stated need or ask the user.
4. Redispatch a failed task only after changing the prompt, inputs, or worker
   choice. Stop after repeated failures.
5. Independently verify risky or overlapping results before integration.

## Merge and Cleanup

Review a worker's completed result before asking it to merge. Merge successful
workers one at a time to avoid base-branch conflicts:

```bash
superset terminals send \
  --workspace <workspace-id> \
  --host <host-id> \
  --terminal <terminal-id> \
  --text "/merge" \
  --json
```

For local workspaces, omit `--host`.

The `/merge` skill commits, rebases, creates a non-fast-forward merge commit in
the base worktree, and deletes its Superset workspace. Because deletion ends the
terminal, send `/merge` only after capturing the worker's final evidence and do
not expect another completion envelope. Poll the terminal and workspace after
sending. Treat workspace deletion as success because `/merge` deletes only after
the merge completes. If the workspace remains, read the terminal for a signing,
rebase, conflict, or dirty-base failure and resolve it before continuing.

Delete an abandoned workspace without merging only when cleanup is explicitly
requested:

```bash
superset workspaces delete <workspace-id> --local
```

For a remote workspace, use `--host <host-id>` instead of `--local`. Close a
terminal without deleting its workspace with:

```bash
superset terminals close \
  --workspace <workspace-id> \
  --terminal <terminal-id> \
  --json
```

Close only auxiliary terminals or agent sessions that are explicitly disposable;
closing an agent's primary terminal ends that session.

## Finish

Report each task's workspace, branch, result, changed files, checks, blockers,
and integration state. Distinguish worker claims from checks independently run
by the coordinator. Keep completed terminals available unless cleanup is part
of the requested workflow.
