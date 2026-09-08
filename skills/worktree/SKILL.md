---
name: worktree
description: Launch one or more tasks in isolated Superset workspaces with terminal agents.
disable-model-invocation: true
allowed-tools: Bash, Read
---

# Superset Workspace Dispatcher

Tasks: `$ARGUMENTS`

## Role

You are a dispatcher, not an implementer. Do not explore or modify the codebase,
and do not delegate through an in-process subagent. Create isolated Superset
workspaces and launch terminal agents that own the tasks end to end.

If the request contains enough context, dispatch immediately. Ask one focused
question only when a missing project, host, task boundary, or agent choice would
materially change the dispatch.

## Resolve the Target

Before dispatching:

1. Run `superset auth whoami --json`.
2. Run `superset workspaces --help` and `superset agents --help`. Require
   workspace `create` and agent `create`.
3. Resolve the host, project ID, base branch, and terminal-capable agent with
   `superset hosts list --json`, `superset projects list --local --json`,
   `superset workspaces list --local --json`, and
   `superset agents list --local --json` as needed.
4. When dispatching from a Superset workspace, use
   `superset workspaces get "$SUPERSET_WORKSPACE_ID" --json` to resolve its
   project. For the same project, use the current Git branch as the base branch.
5. Never use `--agent superset`; it creates a chat session that terminal
   read/send commands cannot control.

Pass `--host <host-id>` consistently for a remote host. For the local host, use
`--local` where supported and otherwise rely on the documented local default.

## Build Worker Prompts

Give each worker a self-contained prompt with:

- the task objective and relevant conversation context;
- repository-relative paths only;
- explicit acceptance criteria and verification commands;
- instructions not to broaden scope or overwrite unrelated changes;
- any referenced skill invocation and its flags;
- a concise final summary of changed files and checks.

If the user references a plan or specification, read that file only to include
its latest content or path in the worker prompt. Do not investigate source code.

When the user passes `--merge`, add this final instruction:

```text
After completing and verifying the task, use the /merge skill to commit, rebase,
merge into the base branch, and remove this Superset workspace.
```

Do not add that instruction unless `--merge` was explicitly requested.

## Create Each Workspace

Generate a short workspace name and branch name of two to four kebab-case words.
Create the workspace first, then launch its agent so both IDs are retained:

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

For a remote host, replace `--local` with `--host <host-id>` on workspace
creation and pass the same `--host` value to agent creation. Record the
workspace ID and the agent result's `sessionId`, which is the terminal ID.

Launch all independent tasks before monitoring any of them. Each editing task
must have its own workspace and branch.

## Fork Conversation Context

When the user passes `--fork`, resolve the current terminal ID and add
`--from-terminal <source-terminal-id>` to `superset agents create`. This seeds
the new provider session with recent terminal context. Add this to the prompt:

```text
You are running in an isolated Superset workspace created by the /worktree
skill. Earlier dispatch instructions are context only. Do not invoke /worktree
or create more workspaces. Implement the task below directly in this workspace.
```

Use the invoking terminal ID when it is available. Otherwise run
`superset terminals list --workspace "$SUPERSET_WORKSPACE_ID" --json` and use a
result only when the invoking terminal is unambiguous. Ask the user instead of
guessing when multiple terminals could be the source.

## Cross-Project Dispatch

Resolve another repository through `superset projects list` on its host. If it
is not registered as a Superset project, ask the user whether to set it up; do
not create or adopt projects implicitly.

For work spanning repositories, create one workspace per project. Each worker
may change only its assigned repository unless the user explicitly requests a
different arrangement.

## Finish

This skill is fire-and-forget. After successful launches, report each workspace
name, workspace ID, branch, host, and terminal ID. Do not implement, monitor,
merge, or delete the workspaces unless the user explicitly asks for ongoing
coordination.
