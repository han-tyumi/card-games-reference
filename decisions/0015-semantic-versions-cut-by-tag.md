# 0015. Semantic versions on the data package, cut by pushing a tag

- **Status:** Accepted — except the conventional-commits rejection below, which
  [0016](0016-releases-cut-themselves-from-commit-subjects.md) reverses
- **Date:** 2026-08-02

## Context

The booklet was served from `https://github.com/han-tyumi/naibi/raw/main/…` — a
megabyte fetched out of the default branch, changing without notice, with no way
to say which one you had. [0008](0008-booklet-is-linked-not-copied.md) named
moving it to a release as the natural next step. Nothing was versioned: the
repository had no tags, and all four manifests said `1.0.0`, a number nobody had
chosen and nothing checked.

Two different questions want two different answers here, which is what made this
worth a record. `packages/data` is published as `naibi` and its consumers need to
know whether an upgrade breaks them. A printed booklet's reader needs to know how
old the thing in their hands is. Those are not the same question.

## Considered options

- **CalVer, e.g. `2026.08.0`** — genuinely tempting for a corpus that grows by
  content rather than by API, and it answers the booklet's question directly.
  Rejected because it cannot express the package's: `naibi@2026.9.0` may or may
  not have removed a schema field, and there is no way to tell from the number.
  The recency it offers is available for free from the release date.
- **Semver from `1.0.0`** — rejected as a claim the project cannot support. The
  schema gained a field the week this was written.
- **Semver on `0.x`** — chosen. `0.x` is the accurate statement that the schema
  is still moving, and `1.0.0` is reserved for when it stops rather than for when
  the corpus looks big enough.
- **Versioning every workspace package** — rejected. Three of the four are
  private and never published, so their versions would be numbers with no
  referent that drift apart. They sit at `0.0.0`, and a test says so.

For the changelog specifically:

- **Changesets** — rejected. It solves independent versioning across many
  published packages; there is one.
- **Conventional commits** — rejected, and this is the one worth explaining. The
  commit subjects in this repository carry the reasoning: "Type-check the browser
  assets, which nothing had ever looked at". Flattening those into `feat:` and
  `fix:` to let a tool generate prose that is worse would trade the best
  documentation the project has for automation it does not need at this size.
- **Hand-written and tested** — chosen, matching how the README's counts are
  already handled: written by a person, verified by a test.

## Decision

The version lives in exactly one place, `packages/data/package.json`, and
everything that needs it reads it from there — including the booklet's cover.
Semver, meaning the schema and the exports of that package, on `0.x` for now.
A release is cutting a tag; `.github/workflows/release.yml` checks that the tag,
the manifest and the changelog agree, runs the full gate, takes the notes from
that changelog entry, and attaches the booklet as `naibi-booklet.pdf`. The asset
name is stable, so that once the README and the site are pointed at
`releases/latest/download/…` they never need editing again.

The cover carries the version and no build date. It carried
`new Date().toISOString()`, which put the wall clock inside bytes that
`npm run pdf -- --check` gates: same corpus, next day, different file, and the
check would have gone red on a repository nobody had touched.
[0013](0013-vendor-the-fonts-and-gate-the-booklet.md) fixed the PDF's internal
`CreationDate` for precisely this reason, and this line had been quietly undoing
it since before that record was written.

## Consequences

A booklet now says which release it is, the download is a tagged artifact rather
than whatever the branch held that minute, and the default branch stops serving a
megabyte on every badge render. The version is checked in three places against
each other, so a mislabelled release fails before it is published rather than
after.

The costs are real. Bumping the version makes `rendered/naibi.pdf` stale, because
the number is printed on it — so a release is a commit *then* a tag, in that
order, and forgetting the rebuild fails the job. The changelog is written by hand
and will be forgotten at some point; the test catches a version that disagrees
with the manifest, but nothing can catch an entry that is merely thin.

The links are the loose end. `releases/latest/download/…` 404s until a release
exists, so the README and the site were pointed at it, the site deployed, and
the published "Print the booklet" link broke — which is how this consequence
came to be written from observation rather than foresight. They are back on
`raw/main` until the first tag lands, and moving them is the last step of the
release procedure. A link that works beats a link that is architecturally
correct.

This says nothing about publishing `naibi` to npm, which has not happened and is
a separate decision. The version being correct is a precondition for it, not a
commitment to it.
