# Decisions

Why this project is the way it is. One record per decision that would otherwise
have to be reconstructed from the code, kept here rather than in the README so
that "how do I use this" and "why is it like this" stop competing for the same
page.

Each record is written once and not restated elsewhere. If the README needs to
mention a decision it links here, because the failure this project keeps fighting
is two copies of something drifting apart.

A record is **Accepted** until it is **Superseded by** a later one, which it
links to. Records are not edited to reflect a change of mind — a new one is
written and the old one says so. What was believed at the time is the useful
part.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-run-typescript-directly.md) | Run TypeScript directly, with no build step | Accepted |
| [0002](0002-data-is-the-source-everything-generates.md) | The data is a package; every output generates from it | Accepted |
| [0003](0003-licensing.md) | CC BY-SA 4.0 for the text, MIT for the code | Accepted |
| [0004](0004-generated-output-is-committed-and-gated.md) | Commit generated output, and gate it against going stale | Accepted |
| [0005](0005-hand-rolled-site.md) | A hand-rolled static site rather than a framework | Accepted |
| [0006](0006-cache-first-with-an-update-notice.md) | Cache first, and tell the reader when a new version lands | Accepted |
| [0007](0007-originality-is-checked-against-sources.md) | Check originality against source text, never by searching phrases | Accepted |
| [0008](0008-booklet-is-linked-not-copied.md) | Link the booklet from the site rather than copying it in | Accepted |
| [0009](0009-documentation-structure.md) | Split documentation by how it ages, and deviate from MADR's directory | Accepted |
| [0010](0010-figures-wrap-in-the-geometry.md) | Wrap figures in the geometry, not in the stylesheet | Accepted |

## The format

A trimmed [MADR](https://adr.github.io/madr/): a `# NNNN. Title` heading, a
Status and Date, then **Context**, **Considered options**, **Decision**,
**Consequences**.

Status is one of `Proposed`, `Accepted`, `Rejected`, `Deprecated` or
`Superseded`. A rejected decision is worth a record — the next person to have the
idea deserves to find out it was already weighed.

MADR's YAML front matter (decision-makers, consulted, informed) is left out: it
serves organisations with stakeholders to track, and here it would be empty
ceremony. The directory is `decisions/` and not MADR's `docs/decisions/` because
`docs/` is the generated site and gets deleted on every build — see
[0009](0009-documentation-structure.md).

Two rules that matter more than the shape. **Considered options** must name what
was rejected and why, because "did you think about X?" is the question a record
exists to answer. **Consequences** must state what the decision costs; a record
with only upsides is advocacy, and the test rejects a stub there.

`npm test` checks numbering, headings, statuses, sections and this index, so a
record added and not listed fails the build.
