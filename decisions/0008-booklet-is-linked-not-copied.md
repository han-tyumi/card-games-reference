# 0008. Link the booklet from the site rather than copying it in

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The site should offer the printable PDF. The obvious move is to copy
`rendered/naibi.pdf` into `docs/` so the download stays on the site.

## Considered options

- **Copy the PDF into `docs/`** — the obvious approach, and what keeps the
  download on the site. Rejected on weight: roughly a megabyte, rebuilt every
  time, doubling in git and in what every visitor precaches.
- **Attach it to a GitHub release** — better than either option here, and the
  natural next step. Not done yet because it needs a release process the project
  does not have.
- **Link the committed file** — chosen as the version that works today.

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
