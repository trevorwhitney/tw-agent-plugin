---
name: babysit-ci
description: >
  Babysit CI for the current branch PR until all checks pass. Use when submitting a new PR to make sure it passes all the test etc.
disable-model-invocation: true
---

# Babysit CI for the current branch PR until all checks pass

Use `gh` for all GitHub interactions.

Workflow:

1. Discover available quality gates by inspecting the project's Makefile (or equivalent build file):
   - Run `cat Makefile` (or `make help` if available) to identify relevant targets such as `format`, `lint`, `test`, `check`, `vet`, `build`, etc.
   - Prefer make targets in this priority order: format → lint → test/check → build.
   - Only run targets that exist in the Makefile.
2. Run local-first quality gates before touching CI (target the changed files where possible):
   - Execute the discovered targets (e.g. `make format`, `make lint`, `make test`).
3. If any local command fails:
   - Fix what is reasonably fixable in this babysit pass.
   - Re-run the failing command(s) until green.
   - If the problem is broad, risky, or needs product/domain decisions, stop and ask for user interaction.
4. B - if you made any changes, commit them one at a time with brief commit message
5. Determine the current branch: `git branch --show-current`.
6. If local fixes were made:
   - Commit with a Conventional Commit message prefixed with `babysit:` (example: `babysit: fix lint failures in plugin query parser`).
   - Push explicitly: `git push origin "$(git branch --show-current)"`.
7. Find the PR for this branch:
   - First try: `gh pr view --json number,url,headRefName,baseRefName,state`.
   - If that fails, use: `gh pr list --head "$(git branch --show-current)" --state open --json number,url,headRefName,baseRefName,state` and select the matching open PR.
8. Announce the PR number and URL.
9. Check cursorbot issues, and see if any are simple enough to fix quickly. Then fix, and commit, and push.
10. Watch CI in a loop with sleeps between checks until everything completes:
    - Poll check status with `gh pr checks <PR_NUMBER>`.
    - Sleep between polls (`sleep 10` or `sleep 15`) and re-check.
    - Continue until checks are all successful, or until any check fails and requires action.
11. If checks fail:

- Identify failing jobs and fetch details/logs using `gh` (for example `gh run list`, `gh run view <run-id> --log-failed`, and related commands).
- Reproduce/fix the issue in the repo.
- Run local verification using the same Makefile targets discovered in step 1.
- Resolve issues before pushing.
- Commit with a clear Conventional Commit message prefixed with `babysit:` and explain what changed and why.
- Push explicitly: `git push origin "$(git branch --show-current)"`.

1. Resume watching checks with sleeps after each push.
2. While waiting, look for cursorbot issues, and see if any are worth quick fixing. Anything very complicated, leave for user interaction.
3. Repeat until CI is fully green.
4. Once all checks pass, mark the PR as ready for review: `gh pr ready <PR_NUMBER>`.

Rules:

- Do not use force push.
- Do not amend commits unless explicitly requested.
- Keep commits focused and readable.
- Use `babysit:` as a prefix in every babysitting commit message.
- Prefer small, low-risk fixes; escalate big/risky items for user interaction.
- Report each cycle briefly: current check status, detected failure, fix applied, commit hash, and push result.
