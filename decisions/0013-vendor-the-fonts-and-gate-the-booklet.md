# 0013. Vendor the fonts, and gate the booklet after all

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

[0012](0012-the-booklet-cannot-be-byte-gated.md) fixed `CreationDate` so the
booklet stopped writing a fresh megabyte into git on every build, tried to gate
it like `rendered/` and `docs/`, and had to drop the gate when CI went red. The
cause was named precisely at the time: the PDF embeds a **subset of the system
font**, the runner's DejaVu build is not the developer's, and so an identical
corpus compiled to different bytes on different machines. That record closed by
saying vendoring the fonts was the right fix, that it was one commit, and that
it was not being done in the same breath as a red `main`.

`main` is green, a batch of twelve entries has landed, and the cost of not
having the gate has been paid twelve times over: every one of those commits
depended on a human remembering `npm run build`, with nothing in the project
able to catch a stale booklet.

Two facts settled the question. Copying the system font into the repository and
building against it produced a **byte-identical PDF**, so vendoring changes no
output and can be judged on its merits alone. And the remaining uncontrolled
input turned out not to be the font at all: CI pins Node 22.18 while a developer
machine here runs 22.22, and PDFKit deflates its streams with Node's bundled
zlib. That is a second input nobody had named, and it cannot be tested from the
machine that raised it.

## Considered options

- **Vendor the fonts and restore the gate** — chosen. It pins the input that
  demonstrably broke the gate before, costs about 1.4 MB of binary committed
  once, and needs the font licence carried alongside. Whether Node's zlib is a
  second variable is answered by pushing it to a branch and reading CI, which is
  the only place the question can be answered at all.
- **Vendor the fonts and still not gate.** Rejected. It banks the reproducibility
  and none of the benefit, and leaves the one output where "I forgot to rebuild"
  reaches a reader still ungated. If the fonts are worth committing, they are
  worth committing for a reason.
- **Pin CI's Node to an exact patch version to remove the zlib question.**
  Rejected for now: it narrows the guarantee to one Node build rather than
  establishing reproducibility, and it would be pinning against a problem not
  yet observed. Revisit only if the gate proves flaky.
- **Compare something weaker than bytes** — page count, bookmark placement, a
  hash of the geometry. Rejected again, for the reason 0012 gave: it would pass
  on a booklet whose text was stale, which is the failure the gate exists for.

## Decision

`packages/build/fonts/` holds `DejaVuSans.ttf` and `DejaVuSans-Bold.ttf` from
Debian's `fonts-dejavu-core` 2.37-8, with the Bitstream Vera licence beside
them. The build prefers them over any system copy. The system paths stay as a
fallback for a checkout that has lost them, and a test asserts the vendored copy
is the one that actually won — a silent fall-through to a system font is exactly
what would quietly undo this.

`npm run pdf -- --check` returns to both `npm run check` and CI, so the booklet
is gated on the same terms as `rendered/` and `docs/`.

## Consequences

Committing a stale booklet stops being the one mistake nothing here catches.
That sentence has been in the contributor steps since 0012 and can now come out.

The repository carries 1.4 MB more binary. That is a real cost against the git
growth 0012 was trying to stop, but it is paid once rather than per build, and
the fixed `CreationDate` means a rebuild with no data change still writes
nothing new.

The guarantee is stronger than before and still not absolute, and it is worth
saying which is which. The font is pinned, `pdfkit` is pinned by the lockfile,
and the test in `pdf.test.ts` proves determinism within one process. Node's
bundled zlib is not pinned, and CI runs a different minor version from this
machine. If that turns out to matter, the gate will fail on the first push
rather than silently — which is the correct failure, and the reason this was
proved on a branch before going anywhere near `main`.

The lesson from 0012 stands and is worth restating in its stronger form: it was
right that the font was an unpinned input, and incomplete about how many
unpinned inputs there were. Anything that compares build output should enumerate
what it does not control before it is trusted, and then check the list on a
machine that is not the author's.
