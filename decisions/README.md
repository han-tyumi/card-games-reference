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

## Writing one

Copy the shape of any existing record: a `# NNNN. Title` heading, a Status and
Date, then **Context**, **Decision**, **Consequences**. Keep it short. Context is
the situation that forced a choice, not a history lesson; Consequences must
include what the decision costs, or the record is advocacy rather than a record.

`npm test` checks the numbering, the headings and this index, so a record that
is added and not listed fails the build.
