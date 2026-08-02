# Changelog

Notable changes to the corpus, the schema and the tools that build from them.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semantic versioning](https://semver.org/), with the contract
being **`packages/data`: its schema and its exports**.

- **major** — a breaking change to the schema or to what the package exports:
  a field removed, a category renamed, a type narrowed.
- **minor** — anything additive: new entries, new optional schema fields, new
  exports.
- **patch** — corrections that break nothing: prose fixes, figure fixes,
  tooling, generated output.

While the version is `0.x`, a **minor** bump may carry a breaking schema change.
That is what `0.x` means, and it is the honest label for a schema that gained a
field the week this was written. Version `1.0.0` is for when the schema stops
moving, not for when the corpus looks big enough.

The version is written in exactly one place — `packages/data/package.json` — and
read from there by everything that needs it, including the booklet's cover. The
release procedure is in
[CONTRIBUTING.md](CONTRIBUTING.md#cutting-a-release).

## [Unreleased]

### Added

- **`npm run release -- <major|minor|patch>`**, which does everything a release
  needs except decide what kind it is: bumps the manifest, moves these notes
  under a dated heading, repoints the compare links, rebuilds the booklet whose
  cover carries the version, and runs the gate. It refuses to release an empty
  set of notes.

## [0.1.0] — 2026-08-02

First tagged release, and the first booklet published as a release asset rather
than served out of the default branch.

### Added

- **72 game entries** across nine families, each validated against the schema,
  each rendered to Markdown, to the website, and to the printable booklet.
- **`background`**, an optional schema field for where a game comes from,
  rendered after the rules rather than before them — a reader with a deck in
  hand wants the deal, not the eighteenth century.
- **Browsing by family** on the website, with every filter carried in the URL so
  a filtered view can be linked to and printed.
- **Print styles** for the website, so a page or a filtered index prints
  legibly. A filtered sheet says how many of the corpus it is showing.
- **Type checking for the browser assets**, which nothing had ever looked at.

### Fixed

- The booklet's cover carried the date the build ran, which put the wall clock
  inside bytes that `npm run pdf -- --check` gates: the same corpus produced a
  different file the next day, and the check would have gone red on a
  repository nobody had touched. The cover now carries the version.
- The offline search fallback built an index object missing two fields the
  scorer reads.
- A difficulty the filter could not rank passed every difficulty filter, because
  `undefined > undefined` is false whichever way round it is written.

[Unreleased]: https://github.com/han-tyumi/naibi/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/han-tyumi/naibi/releases/tag/v0.1.0
