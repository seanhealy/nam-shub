# Briefs

The agent knows only the brief and the repo. What it can't find there:

- **Echo's decisions,** in Echo's words where the wording matters.
- **Where to work.** A new branch: worktree isolation, base on `origin/<base>`,
  `git push origin HEAD:<branch>`. An existing branch: no isolation, the
  worktree path, `git pull --ff-only` first.
- **Which calls to report rather than make.**
- **The method,** when the obvious one is slow: start from data already in hand,
  script mechanical edits, name the concurrency for bulk fetches.
- **Echo's standing rules:** one-line commit subjects; never push to main,
  stash, `--no-verify` or force-push; labels belong to the manager; open the
  draft PR as soon as the change exists and self check while it sits at
  `self review`.
- **The report wanted:** short, with PR number, shas, what was checked and the
  judgement calls.

A reviewer also gets the PR's intent and decisions, fixes only mechanical
defects, and drafts description changes to the scratchpad. A browser agent
works in background tabs of Echo's one window (`Target.createTarget` with
`background: true`) and touches only its own tabs. Long research runs report
at checkpoints.

## Rules to paste

Paste this at the end of every brief, word for word, filling in the angle
brackets. It restates the rules above and in the repo's instructions file so
the agent can't miss them.

```
## Rules
- New branch: work in worktree isolation, based on `origin/<base>`; push with
  `git push origin HEAD:<branch>`. Existing branch: no isolation, work in
  <worktree path>, `git pull --ff-only` first.
- Open the draft PR as soon as the change exists; self check while it sits at
  `self review`.
- Before pushing, run only the tests for what changed, plus the repo's lint,
  typecheck and formatter on the changed files. Never the full suite; CI runs
  it.
- One-line commit subjects. Never push to main, stash, `--no-verify` or
  force-push.
- Labels and draft state are the manager's. Don't post on GitHub unless this
  brief says to.
- Report short: PR number, shas, what was checked, the judgement calls.
- Reviewers: fix only mechanical defects; draft description changes to the
  scratchpad.
```
