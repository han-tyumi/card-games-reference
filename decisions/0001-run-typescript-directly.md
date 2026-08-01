# 0001. Run TypeScript directly, with no build step

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The project is a data set plus several generators over it. Contributors are
likely to arrive to fix a rule, not to work on the tooling, and a build step is
a thing that can be out of date, be skipped, or produce output that disagrees
with its input.

## Considered options

- **A build step producing `dist/`** — the conventional setup. Rejected: it adds
  a thing that can be skipped or go stale, for a project whose likely contributor
  is fixing a rule rather than working on tooling.
- **Plain JavaScript throughout** — no compiler question at all. Rejected: the
  schema generates types, and giving those up would let the data and the code
  that reads it drift.
- **A bundler for the browser assets** — rejected with the same reasoning; see
  0005.

## Decision

Require Node 22.18 or newer and run the `.ts` files as they are, relying on
native type stripping. `erasableSyntaxOnly` keeps the code inside the subset
Node can strip; `tsc --noEmit` is a check and never a compiler.

## Consequences

There is no `dist/`, nothing to rebuild before running a script, and the file
you read is the file that runs. In exchange the project cannot use enums,
parameter properties, namespaces or anything else that needs emitting, and it
carries a hard floor on the Node version. Browser assets stay plain JavaScript
for the same reason — see 0005.
