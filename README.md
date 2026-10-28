# nam-shub

The shared rules and skills for Echo's repos. `core.md` is synced into each
repo's `AGENTS.md`, and the skills in `skills/` into its `.claude/skills/`. Edit
them here, never in the synced copies.

To set up a repo, ask the agent working in it:

> Set up nam-shub: read `skills/sync-nam-shub/SKILL.md` in
> `seanhealy/nam-shub` and follow it.

After that, ask for the `sync-nam-shub` skill in the repo to update it.

`node --test` runs the tests.
