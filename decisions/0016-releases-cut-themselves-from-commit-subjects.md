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
The field is large — the Conventional Commits site alone lists forty-odd tools —
but one requirement thins it out fast. This repository **commits its generated
output and gates it**, and the booklet's cover carries the version, so a release
must go: bump, rebuild the booklet, run the gate, commit all of it, tag,
publish. A tool is only a candidate if arbitrary commands can run *between* the
bump and the commit, and their output lands in the release commit.

Most of the field fails that on the first clause. Linters (commitlint, gitlint,
conform), parsers (`go-conventionalcommits`, `parse-commit-message`) and
version calculators (git-semver, git-mkver, Conventional Commits Next Version)
do one piece and leave the rest. Changelog generators (git-cliff, chglog,
conventional-changelog) write prose and stop. Those were never alternatives to
this.

Of the tools that do the whole job:

- **cocogitto** — the closest structural match, and the only option here that
  was **actually run** rather than read about: 7.0.0, against a clone of this
  repository, with the same commits fed to both. Findings, since a comparison
  nobody can check is just an opinion:
  - It picked the same bump this script did, v0.2.0 to v0.3.0 off one `feat`.
    The version logic agrees exactly, which is worth knowing in both directions.
  - A hand-written preamble **is** preserved. It requires a `- - -` marker in
    the file and errors without one, keeping everything above it. That answers
    a question its documentation does not.
  - Its release notes list the `docs` and `chore` commits it had just announced
    it was skipping — "skipped" means "does not move the version", not "kept out
    of the changelog". So a reader gets `#### Miscellaneous Chores — add the
    changelog separator - (08b55fd)`, with hash and author, where this script
    prints nothing at all. For a changelog that is a published document in a
    repository about curated prose, that is the wrong default.
  - Headings are conventional-commit type names, versions are `## v0.3.0 -
    2026-08-02`, and there are no compare-link definitions.

  Reaching what exists today needs a custom Tera template for the headings, the
  omissions and the links. That is the part that decided it: the bespoke thing
  would still exist, just written in a template language with no way to unit-test
  it, in place of TypeScript with twenty tests around the same decisions. The
  template route was **not** built, so this is a judgement about cost, not a
  measurement of it.
- **Knope** — also a good fit, by composing `PrepareRelease`, arbitrary
  `Command` steps and `Release`. It takes hand-written prose through change
  files in `.changeset/`, each with a summary, optional detail and its own bump
  level, so "a generator would flatten the notes" is **not** a fair objection to
  it; that objection was aimed at conventional commits alone and does not
  transfer. Asset upload wants the Knope Bot GitHub App by its own recipe.
- **release-it** — an `after:bump` hook runs after the version changes and
  before the git operations, which is the same window. Rejected sooner than the
  other two only because it is an npm dependency with a plugin chain, where they
  are single binaries.
- **Uplift** — a Go binary in the same space. Not evaluated in depth; its own
  README does not answer the hook question and the two above already do.
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

**cocogitto is the thing to revisit**, and what to weigh is the changelog and
nothing else. The version logic was measured to agree; the notes were measured
to differ. Every tool in this space owns the file's format, and this file has a
curated preamble, compare links, Keep a Changelog headings, housekeeping kept
out, and a hand-written entry that can stand in for the generated list.

Two triggers, both specific rather than a feeling: **a second published
package**, or the first need for prerelease or backport versions. Both are where
hand-rolled release tooling turns bad and both are cocogitto's and Knope's home
ground. At that point the right move is probably to take the tool and give up
the changelog format, rather than to grow this script — it was written to do one
job for one package and it should not learn a second.
