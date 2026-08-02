# 0012. Make the booklet reproducible on one machine, but do not gate it

- **Status:** Superseded by [0013](0013-vendor-the-fonts-and-gate-the-booklet.md)
- **Date:** 2026-08-02

## Context

`rendered/` and `docs/` are committed generated output, gated by a `--check`
that rebuilds in memory and diffs — [0004](0004-generated-output-is-committed-and-gated.md).
The booklet is committed the same way and had no such gate, and the reason was
not neglect: PDFKit stamps the moment of the build into `CreationDate`, so two
compiles of an identical corpus produced different bytes and "differs from the
committed copy" was true on every run.

That had a second cost, which is what prompted looking at it before adding
another batch of games. Every build wrote a fresh 0.9 MB object into git whether
or not a card had moved: **140 revisions, most of a 29 MB history**, for a file
whose content has changed a handful of times. The cost compounds with each
batch.

Fixing `CreationDate` made two consecutive builds byte-identical, and it looked
as though the booklet could finally join the same gate as everything else. A
`--check` was added, verified locally — exits 1 against a stale booklet, 0
against a current one — and pushed.

**CI went red on the next commit.** The booklet built on the runner did not
match the one committed from a developer machine. The cause: the PDF embeds a
*subset of the system font*. Locally that is Debian's `fonts-dejavu-core 2.37-8`;
the runner ships its own build. Different font file, different embedded subset,
different bytes — with no difference in the corpus at all.

The determinism that was achieved is real but narrower than it looked: it is
determinism **on one machine**. The test that guards it compiles twice in the
same process and could never have caught this.

## Considered options

- **Keep the gate and vendor the fonts.** Copy DejaVu Sans and DejaVu Sans Bold
  into the repository and prefer them over the system copies, pinning the last
  unpinned input. This is the only option that makes the booklet genuinely
  reproducible and therefore genuinely gateable. Rejected *for now*, not on
  principle: it adds about 1.5 MB of binary to a repository whose history size
  was the reason for touching any of this, it needs the font licence carried
  alongside, and it was proposed while `main` was red. It is the right fix and
  should be revisited deliberately.
- **Keep the gate and compare something weaker than bytes** — page count,
  bookmark placements, a hash of the layout geometry. Rejected: it would pass on
  a booklet whose text was stale, which is the failure the gate exists to catch.
  A check that cannot fail for the reason you wrote it is worse than none.
- **Revert the determinism too.** Rejected. It is independently worth having:
  it stops the git growth, which was the motivating problem, and it makes a
  diff of `rendered/naibi.pdf` mean something.
- **Keep determinism, drop the gate, record why** — chosen.

## Decision

`CreationDate` stays fixed, so the same corpus compiles to the same bytes on the
same machine and git stores nothing new when nothing has changed.

The booklet keeps **no `--check`**, in `npm run check` or in CI. A test asserts
within-machine determinism and says in its own comment what it does not
establish, so the next person to reach for a byte gate finds the reason waiting
for them rather than finding it in a red build.

## Consequences

The git growth stops. A rebuild with no data change now produces an identical
file, where before it produced a new megabyte.

The cost is stated plainly rather than papered over: **committing a stale
booklet is the one mistake nothing in this project catches.** `rendered/` and
`docs/` are gated; the PDF is not, and a contributor who edits an entry and
forgets `npm run build` ships a booklet that disagrees with the site. That is
now written into the "Adding a game" steps, which is a weaker guarantee than a
test and is honestly the point of this record.

The lesson is one this project already had written down and got caught by
anyway: *verify in the environment CI has*. The gate was tested locally, passed,
and was wrong — because the thing that varied was not in the repository at all.
Anything that hashes or compares build output needs to ask what inputs it does
not control before it is trusted.

Vendoring the fonts remains the way to close this. It is one commit, it makes
the booklet reproducible everywhere, and it would let the gate come back. It was
not done in the same breath as a red `main`.
