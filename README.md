# nam-shub

Shared guidance for Echo's repos. `core.md` is synced into each repo's
`AGENTS.md`, and the skills in `skills/` into its `.claude/skills/`. Edit them
here, never in the synced copies.

To set up a repo, ask the agent working in it:

> Set up shared guidance: read `skills/guidance/SKILL.md` in
> `seanhealy/nam-shub` and follow it.

After that, the `guidance` skill in the repo keeps it up to date, and
`pr-review` says when it's behind.

`node --test` runs the tests.
