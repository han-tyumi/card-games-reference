# 0002. The data is a package; every output generates from it

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The same rules have to reach a website, a printable booklet and Markdown. The
obvious failure is three copies of a rule that drift, so that a correction lands
in one and not the others.

## Considered options

- **One repository, no package boundary** — simpler to start. Rejected: nothing
  would stop a generator quietly keeping its own copy of a rule.
- **Separate repositories per output** — rejected: a rule fix would need
  coordinated releases across repos to reach readers.
- **A database or API in front of the data** — rejected: it costs money to run,
  and the whole corpus is small enough to ship as files.

## Decision

`packages/data` is a published package and the only source of truth. The site,
the PDF and the Markdown are generators over it. Nothing downstream holds its own
copy of a rule, and anything two generators both need — the prose parser, the
diagram geometry, the search index — lives in a module they share rather than
being implemented twice.

## Consequences

A rule fixed once is fixed everywhere in a single commit. Adding an output means
writing a generator, not forking the data. The cost is indirection: a change to
how prose parses affects the PDF and the site together, which is the point, but
it means their tests have to be run together too.
