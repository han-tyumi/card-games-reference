# 0009. Split documentation by how it ages, and deviate from MADR's directory

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The README had grown to 700 lines carrying four unrelated jobs: what the project
is, how to run it, how to contribute, and why it is built the way it is. "How do
I add a game" sat 460 lines down, below the licensing essay.

The established conventions were checked rather than assumed:

- **MADR**, the actively maintained ADR standard, puts records in
  `docs/decisions/` and its template carries Context and Problem Statement,
  Decision Drivers, **Considered Options**, Decision Outcome and Consequences,
  with statuses `proposed | rejected | accepted | deprecated | superseded by`.
- **adr-tools**, the other common convention, uses `doc/adr/`.
- **Diátaxis** separates documentation into tutorials, how-to guides, reference
  and explanation, arguing that mixing them serves nobody because each is
  consulted in a different state of mind.

## Considered options

- **Adopt MADR wholesale, including `docs/decisions/`** — rejected on one hard
  point: `docs/` is this project's generated GitHub Pages output and is deleted
  and rewritten by `npm run web`. Records placed there would be destroyed by the
  next build.
- **`doc/adr/`, the adr-tools convention** — viable, and avoids the collision.
  Rejected as more obscure than a directory that says what it holds, for a
  project whose contributors are not necessarily architects.
- **Full Diátaxis: four documentation trees** — rejected as heavier than a
  sixty-entry data project can carry. Four trees for what is currently one
  how-to, one reference and a handful of explanations would be structure for its
  own sake.
- **MADR's YAML front matter (decision-makers, consulted, informed)** — rejected.
  Those fields serve organisations with stakeholders to track; here they would be
  empty ceremony.
- **Split by how a document ages** — chosen.

## Decision

Two kinds of document, separated by how they behave over time rather than by
subject:

- **Live** — `README.md`, `CONTRIBUTING.md`. Describe how things are now. Edited
  whenever they stop being true.
- **Historical** — `decisions/`. Written once and superseded, never edited,
  because what was believed at the time is the point.

Records live in `decisions/` rather than `docs/decisions/`, and the format takes
MADR's **Considered options** and its wider status set while leaving the front
matter alone.

Where Diátaxis says `CONTRIBUTING.md` mixes modes, it does — how-to ("Adding a
game") sits beside reference (the data format, tag conventions). That is
deliberate: here they are consulted together, in one sitting, by someone adding
an entry. Splitting them would mean two documents open at once to do one task.

## Consequences

The README is an entry point again, and a contributor lands on `CONTRIBUTING.md`
from GitHub's own issue and pull request UI rather than scrolling.

The cost is a deliberate deviation from the dominant ADR convention, which will
look like an oversight to anyone who knows MADR — hence this record. Anyone
"correcting" `decisions/` to `docs/decisions/` will have their work deleted by
the next site build.

Recording considered options makes each record longer to write, and the
alternatives in records 0001–0008 were reconstructed after the fact rather than
captured at the time, which makes them honest about what was weighed but not
evidence that all of it was weighed then.

Diátaxis remains a useful lens even though it was not adopted: if
`CONTRIBUTING.md` grows to where the reference material dominates, splitting it
out is the first thing to try.
