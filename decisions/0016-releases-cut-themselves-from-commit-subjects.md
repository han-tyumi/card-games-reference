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

- **cocogitto** — the closest structural match found, and closer than Knope. Its
  `cog bump --auto` is documented as: calculate the version from the commits,
  run `pre_bump_hooks`, append to `CHANGELOG.md`, **create a version commit
  containing the changes made in those steps**, tag it, then run
  `post_bump_hooks`. That middle step is exactly the awkward requirement above —
  a hook rebuilds the booklet and the rebuilt booklet is in the release commit.
  One Rust binary, libgit2 its only system dependency.
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

**cocogitto is the thing to revisit**, and the honest position is that this was
decided on a narrow survey and then widened afterwards, which is the wrong
order. What kept the script was not that it beat cocogitto on the merits — it
loses on volume, a hundred lines of TOML-shaped configuration against a few
hundred of TypeScript — but that it was already written, already tested, and
already had released a version correctly. That is a real reason and a weak one,
and it should be stated as both.

The trigger for switching is specific rather than a feeling: **a second
published package**, or the first need for prerelease or backport versions.
Both are where hand-rolled release tooling turns bad and both are cocogitto's
and Knope's home ground. The thing to weigh at that point is the changelog:
every one of these tools owns the file's format, and this one has a curated
preamble and lets a hand-written entry stand in for the generated list.
