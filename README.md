# nam-shub

The shared rules and skills for Echo's repos. `core.md` is synced into each
repo's `AGENTS.md`, and the skills in `skills/` into its `.claude/skills/`. Edit
them here, never in the synced copies.

To set up a repo, ask the agent working in it:

> Set up nam-shub: read `skills/sync-nam-shub/SKILL.md` in
> `seanhealy/nam-shub` and follow it.

After that, ask for the `sync-nam-shub` skill in the repo to update it.

`node --test` runs the tests.

## Extending a Shared Skill

A repo adds to a shared skill's file in `.claude/extensions/`, at the same path
the file has here: additions to `skills/<name>/SKILL.md` go in
`.claude/extensions/skills/<name>/SKILL.md`. The sync never touches
`.claude/extensions/`, and an extension loads only with the skill it extends.

The skill's `SKILL.md` ends with an `@` line for each of its files that takes
an extension. Only `SKILL.md` follows them: in a file the skill links to, an
`@` line is plain text.

```markdown
@.claude/extensions/skills/<name>/SKILL.md
@.claude/extensions/skills/<name>/BRIEFS.md
```

When the repo has no extension, the line is skipped without an error. Add the
line to a shared file when a repo needs it, not before.
