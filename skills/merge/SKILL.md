---
name: merge
description: Commit, rebase, and merge a Superset workspace branch into its base branch, then remove the workspace.
disable-model-invocation: true
allowed-tools: Read, Bash, Glob, Grep
---

**Arguments:** `$ARGUMENTS`

Check the arguments for flags:

- `--keep`, `-k` -> keep the Superset workspace after merging
- `--no-verify`, `-n` -> pass `--no-verify` to `git merge`

Strip all flags from arguments.

Commit, rebase, and merge the current Superset workspace branch.

This command finishes work on the current branch by:

1. Committing any staged changes
2. Rebasing onto the base branch
3. Creating a signed, non-fast-forward merge commit in the base worktree
4. Removing the Superset workspace and worktree unless `--keep` was passed

## Step 1: Capture Workspace State

Before changing branches or directories, capture the current branch and workspace ID:

```bash
branch=$(git branch --show-current)
workspace_id=${SUPERSET_WORKSPACE_ID:-}
if [[ -z "$workspace_id" ]]; then
  workspace_id=$(superset ws get --field id)
fi
```

Stop if the branch or workspace ID is empty. This skill must run from a Superset workspace.

Get the base branch from git config:

```bash
base_branch=$(git config --local --get "branch.$branch.base")
base_branch=${base_branch:-main}
```

Stop if the current branch is the base branch.

## Step 2: Commit

Inspect `git status`, `git diff --cached`, and `git log --oneline -10`. If there are staged changes, commit them with `git commit -S`. Use lowercase, imperative mood and no conventional commit prefix. Skip the commit if nothing is staged.

Every commit must be signed. If signing fails, stop immediately and ask the user how to proceed. Never retry without signing.

## Step 3: Rebase

Rebase onto the local base branch and sign rewritten commits:

```bash
git rebase --gpg-sign "$base_branch"
```

IMPORTANT: Do NOT run `git fetch`. Do NOT rebase onto `origin/<branch>`. Only rebase onto the local branch name (e.g., `git rebase main`, not `git rebase origin/main`).

If conflicts occur:

- BEFORE resolving any conflict, understand what changes were made to each
  conflicting file in the base branch
- For each conflicting file, run `git log -p -n 3 <base-branch> -- <file>` to
  see recent changes to that file in the base branch
- The goal is to preserve BOTH the changes from the base branch AND our branch's
  changes
- After resolving each conflict, stage the file and continue with
  `git rebase --continue`
- If a conflict is too complex or unclear, ask for guidance before proceeding

If signing fails at any point, stop immediately. Never continue with unsigned commits.

## Step 4: Locate the Base Worktree

Use `git worktree list --porcelain` to find the worktree whose branch is `refs/heads/$base_branch`:

```bash
base_worktree=
candidate=
while IFS= read -r line; do
  case "$line" in
    "worktree "*) candidate=${line#worktree } ;;
    "branch refs/heads/$base_branch") base_worktree=$candidate; break ;;
  esac
done < <(git worktree list --porcelain)
```

Stop if `base_worktree` is empty. The base branch must already be checked out in a worktree.

Ensure the base worktree is clean with `git -C "$base_worktree" status --porcelain`. Stop before merging if it has any changes.

## Step 5: Merge

Merge the workspace branch from the base worktree:

```bash
git -C "$base_worktree" merge --no-ff --no-edit -S "$branch"
```

Include `--no-verify` only if the flag was passed in arguments. If merge signing fails or the merge otherwise fails, stop immediately and do not remove the workspace.

## Step 6: Remove the Workspace

Unless `--keep` was passed, run this only after the merge succeeds:

```bash
superset ws delete "$workspace_id" --local
```

This must be the final command because it removes the current workspace, worktree, and terminal. If `--keep` was passed, leave the workspace intact after the successful merge.
