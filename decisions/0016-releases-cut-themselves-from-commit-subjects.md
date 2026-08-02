# 0016. Releases cut themselves, from conventional commit subjects

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

[0015](0015-semantic-versions-cut-by-tag.md) decided how versions work and
rejected conventional commits along the way, on the grounds that a generator
would produce worse notes than a person. That reasoning was sound and it
answered a question nobody had asked. The requirement, stated plainly
afterwards, is *automatic releases* — the maintainer should not have to decide
anything or run anything for work on main to reach a release.

Releasing by hand is five steps and the version has to be chosen. Neither
survives contact with "this should just happen".

## Considered options

- **Changesets** — rejected again, and for the same reason as before: it solves
  independent versioning across many published packages, and there is one. It
  would also take ownership of the changelog's format.
- **release-please** — rejected on a concrete mismatch rather than on taste. It
  opens a release PR carrying the version bump, and that PR would hold a booklet
  whose cover still says the old version, so it would fail this repository's own
  `npm run pdf -- --check`. Fixing that needs a second bot commit pushed onto the
  release PR to rebuild the artifact.
- **Knope** — the closest fit by some distance, and the only tool whose model
  matches the ordering this repository needs: `PrepareRelease` bumps and writes
  the changelog, arbitrary `Command` steps rebuild the booklet and run the gate,
  then `Release` publishes. It takes hand-written prose through change files in
  `.changeset/`, each carrying a summary, optional detail and its own bump level,
  so "a generator would flatten the notes" is **not** a fair objection to it —
  that objection was aimed at conventional commits alone and does not transfer.
  Rejected on cost rather than on fit: a Rust toolchain in CI, a changelog that
  moves to Knope's section format rather than this one's, and asset upload that
  wants the Knope Bot GitHub App by its own recipe. The one thing it does not
  appear to do is let a single hand-written entry stand in for the whole
  generated list, which is how the 0.1.0 notes were written — though that was a
  first release summarising work that predated the changelog, and may never
  recur.
- **Bump a patch on every push** — rejected. It makes the version a count of
  pushes rather than a statement about compatibility, which is the one thing
  0015 established the number is for.
- **Conventional commit subjects, read by the existing release script** —
  chosen.

## Decision

Commit subjects carry a conventional prefix. `feat` earns a minor, `fix` and
`perf` a patch, a `!` marks a breaking change and earns a major, and the
housekeeping types earn nothing. The largest bump in a batch wins.

`npm run release -- --auto` reads the commits since the last tag, decides, and
does the rest. The Release workflow runs it on **Validate succeeding** rather
than on the push, so a release is never built from a commit that failed its own
gate, and pushes the version bump back to main before tagging.

Two rules keep the number honest. A push of nothing but housekeeping releases
nothing at all and exits 0 saying so, because "no release was due" is a correct
outcome. And a subject with no recognisable prefix counts as a patch rather than
being dropped: dropping it would mean a batch of sloppily-labelled work
releasing nothing and explaining nothing, which is the silent failure this
project keeps finding elsewhere.

The changelog is not surrendered. Anything hand-written in `## [Unreleased]`
wins over the generated list, so 0015's argument — that a written entry
summarises many commits where a generator can only list them — still holds
wherever anyone cares enough to write one.

## Consequences

Work on main reaches a release without anyone deciding or running anything, and
the version still means what 0015 said it means, because the prefixes carry the
same distinction the manual rule did.

The costs are real and worth naming. Versions will move much more often, and a
mislabelled commit now mislabels a release — `feat` on a bugfix is a minor
nobody can take back, and the only remedy is the next release. Release notes
will usually be a list of subjects rather than a summary, which is a downgrade
0015 accepted no version of; the hand-written escape hatch exists precisely
because that downgrade is real. And commit subjects are now load-bearing in a
way they were not, so a typo in a prefix is a version decision.

This reverses the conventional-commits rejection in
[0015](0015-semantic-versions-cut-by-tag.md). Everything else in that record —
semver on `packages/data`, one version in one manifest, releases as tags with
the booklet attached — stands unchanged.

Knope is the thing to revisit, and the trigger is specific rather than a
feeling: **a second published package**, or the first need for prerelease or
backport versions. Both are where hand-rolled release tooling turns bad, and
both are Knope's home ground. Until then this is a few hundred lines with tests
against a toolchain and a bot, and the tests already exist.
