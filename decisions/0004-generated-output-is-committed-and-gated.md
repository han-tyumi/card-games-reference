# 0004. Commit generated output, and gate it against going stale

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

`rendered/` makes the rules readable straight from GitHub, and `docs/` is what
GitHub Pages serves. Both are generated. Committing generated output invites the
classic failure: the source changes, the artefact does not, and the published
copy quietly disagrees with the data it came from.

## Considered options

- **Commit the output and gate it** — chosen.
- **Gitignore it and build on demand** — rejected: readers could not browse the
  Markdown on GitHub, and Pages would need a build workflow rather than serving
  a directory.
- **Commit without a gate** — rejected outright. This is the failure mode the
  gate exists for: the published copy silently disagreeing with its source.
- **Build in CI and commit from the workflow** — rejected as more machinery than
  a `--check` that fails loudly.

## Decision

Commit both, and give both a `--check` mode that rebuilds into memory and
compares against what is on disk, reporting stale, missing and orphaned files.
Both run in CI.

## Consequences

Readers get browsable Markdown and a served site with no build required, and a
forgotten `npm run web` fails the build instead of shipping stale rules. The
cost is diff noise on every content change, and roughly a megabyte of PDF
rewritten whenever the booklet is rebuilt. That last point is the weakest part
of this decision and would be worth revisiting via releases.
