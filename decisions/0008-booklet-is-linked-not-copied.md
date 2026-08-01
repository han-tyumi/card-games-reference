# 0008. Link the booklet from the site rather than copying it in

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The site should offer the printable PDF. The obvious move is to copy
`rendered/naibi.pdf` into `docs/` so the download stays on the site.

## Decision

Link it at its committed path in the repository instead.

## Consequences

The PDF is close to a megabyte and changes on every build, so copying it would
double that in git history each time and add a quarter of the site's weight to
what every visitor precaches for a file most will never open. The cost is that
the link leaves the site, so a test asserts it still points at the path the PDF
build actually writes — otherwise a rename would 404 with nothing to catch it.
Attaching the booklet to a GitHub release would be better than either and is the
natural next step.
