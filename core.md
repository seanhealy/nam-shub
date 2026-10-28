# Shared guidance

The rules for every repo. This block is generated from `core.md` in
`seanhealy/nam-shub` by the `sync-nam-shub` skill and replaced whole on each
update: change it there, never here. The rest of this file is specific to this
repo.

## Less code, written clean

Mutability comes from less code, written clean the first time. Less code means
fewer places to change when the requirements move, and they will.

- Don't write for a future you guessed: no options, parameters, layers or
  config nobody asked for.
- When a real second use arrives, pull out the shared part in that change
  instead of copying.
- Clean means nothing glossed over: no magic values, no loose strings where a
  type belongs, no "fix it later."
- Before writing anything, ask whether it needs to exist, then whether the
  codebase, the standard library or the platform already does it.

## Think first

Read the code the change touches and trace the real flow before writing. Think
about the whole problem, then the piece to start with, then the whole again in
light of that piece.

If you can't know without trying, experiment in a scratch space outside the
change and carry over only what you learned. You're ready when you can explain
the change, what moves where and why, without "this works because I happen to
know..."

## Guard the edges, trust the types

Validate where data comes in: user input, the network, outside services.
Inside, trust the types and don't re-check what they already rule out. Never
trade away validation, error handling, security or accessibility for size.

## No outliers

Build things that do the same job the same way, even when a special shape would
be shorter. Consistency lets both of us make assumptions about the codebase. If
the pattern doesn't fit, stop and bring it to Echo: changing a pattern
everywhere is never small, and a comment explaining an exception is how
outliers get in quietly.

## Names

Full words, not abbreviations (`context`, not `ctx`). One concept, one name; the
repo's terminology doc says which. Once something has a name, keep it.

## Small pull requests

One pull request does one thing. Small ones get real review, and they force the
rest of this file: there's no room in one for gold plating.

- Tests for changed behavior ship in the same pull request.
- Tiny cleanups in code you're touching can ride along. A real refactor gets its
  own pull request, stacked under the change if needed. Anything else goes
  under "Not in this PR".
- Write the description before the code. It's the plan. Its shape is in the
  `pr-review` skill.

Show Echo the plan before writing when any of these fire:

- the one-sentence summary covers two things ("adds the sale badge and reworks
  price formatting")
- more than two judgment calls under "Where to look"
- the change spreads across many files, or past roughly 400 changed lines (not
  counting generated files, lockfiles or migrations)
- it needs an outlier
- you can't explain it without "this works because I know..."

A warning triggers a question, never a trim. If it's still one thing, say in
the description why it's big; if not, split it by behavior. Readability beats
size, always.

## Speed

Optimize only after it works and a measurement says it matters.

## House conventions

- `function` declarations for named functions; arrows for anonymous callbacks.
- Named exports, except where a framework needs a default.
- `undefined`, not `null`, for absence; absorb outside nulls with `??` at the
  edge.
- Enumerables (`map`, `filter`, `find`, `reduce`, `forEach`) over `for` loops.
- Most important first: exported functions at the top, helpers below; object
  properties by importance, identifying fields first.
- A directory module's `index.ts` only re-exports; the code lives in a named
  file.
- Comments carry only what the code can't. The `pr-review` skill holds the
  rubric.

## Working with Echo

- Answer first, reasons after. Plain words; a technical term only when it
  carries meaning, explained once.
- Name the file, the symbol, the line. Say what you checked and what you're
  recalling.
- Ask when a decision is Echo's: scope, anything hard to undo, an outlier.
- Push back once with a concrete case when something smells off, then let Echo
  decide.
- No em dashes, sentence case headings, straight quotes.
