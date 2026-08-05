# The checked envelope, and the five copies of "which fields are prose"

- **Status:** Proposed — split in two; the first half is being built, the second
  waits on a reader
- **Date:** 2026-08-05

Item 3 of [the before-more-games handoff](2026-08-04-before-more-games-handoff.md),
after measuring it. The handoff called it "half-filled optional fields" and
framed the risk as backfill debt. Measured, the risk is the other way round.

## Context

`background` is prose. The schema allows it 80 to 1500 characters; the four that
exist run 283 to 683. It is origin-and-history writing, it renders into the
site, the booklet and the published package — and nothing checks it against a
source.

`proseFingerprint()` hashes `setup`, `play` and `goal_and_scoring`.
`originality.ts` compares the same three. Neither includes `background`. So the
originality tool has never shown a reader a `background` finding, because it has
never compared that prose at all — and editing `background` does not disturb the
`checked` stamp, because the fingerprint does not cover it.

All four entries that carry `background` are stamped as checked:

| entry | background | checked | sources recorded |
| --- | --- | --- | --- |
| conquian | 452 chars | 2026-08-01 | Pagat, Wikipedia |
| dou-dizhu | 283 chars | 2026-08-03 | Pagat, Wikipedia |
| mau-mau | 507 chars | 2026-08-03 | Game Rules, Palace of Cards, Wikipedia |
| piquet | 683 chars | 2026-08-03 | Pagat, Wikipedia |

Wikipedia is on every one of them, and Wikipedia is exactly where a game's
origin story comes from. Whether that prose was read against it at stamping time
is unknown: the tool did not compare it, so a diligent reader following the
report was never shown a pair to judge. The stamps' cover of `background` is
incidental at best.

The underlying defect is that **"which fields are prose" is written in five
places**, kept in step by hand:

| where | what it decides |
| --- | --- |
| `originality.ts` `FIELDS` | what is compared against sources |
| `originality.ts` `main()` | what the null distribution is measured over |
| `packages/data` `proseFingerprint()` | what invalidates a `checked` stamp |
| `originality.test.ts` | what the corpus tests sweep |
| `CONTRIBUTING.md` | what contributors are told the fingerprint covers |

They agree today. They drifted from the schema, silently, in the one direction
where drift means prose ships unexamined.

## What is not wrong

`deal` at 8/72 and `figure_refs` at 3/72 are **conditional by design**, and the
schema says so: `deal` is for "where this actually varies … omit it where one
number covers every case", `figure_refs` for "where a figure is genuinely
identical across several games". Low counts are those rules working. There is no
backfill debt here, and a coverage report must not imply one.

## Decision

1. **One `PROSE_FIELDS` constant**, exported from `packages/data`. The four code
   sites derive from it, so a prose field added to the schema cannot leave one
   behind. `CONTRIBUTING.md` is prose and cannot derive from a constant, so it
   gets the treatment this repo already uses for that problem: a test that fails
   when the document and the constant disagree.
2. **`background` joins it** — compared, fingerprinted, swept.
3. **The baseline null includes `background` passages.** The counter-argument,
   recorded because it is real: `background` is history and the other three are
   procedure, and procedure's formulaic sameness is the thing the null exists to
   calibrate. At 4 passages against 216 the shift is noise. It is included
   because the bar should be measured over the same kind of text it is applied
   to, and because this sets the precedent for when `background` is on fifty
   entries rather than four.
4. **The four entries are re-read against real sources and re-stamped inside
   this change** — not dropped. Dropping the records was the considered
   alternative and is what [CLAUDE.md](../CLAUDE.md) permits; re-reading was
   chosen so the change ships with its corpus verified rather than with four
   fresh holes.
5. **`npm run validate` reports optional-field coverage**, worded so a low
   conditional count reads as a rule working rather than as a gap.

## Split into two changes

The decision above is unchanged. How it lands is not: the two halves need
different kinds of scrutiny, and fusing them makes both harder to check.

**First — the list.** `PROSE_FIELDS` is introduced and the four code sites
derive from it, with the field list *exactly as it stands today*. No entry
changes, no fingerprint changes, no stamp goes stale, the gate stays green. It
is a pure consolidation whose correctness is mechanical: either the consumers
derive from the constant or a test says they do not. The coverage report ships
here too.

**Second — the field.** `background` joins the constant, which is a one-line
change once the first half exists. That one line reds the gate on four entries
and pulls in the whole re-reading pass: judging pairs by eye, rewriting prose
that ships to readers, and stamping a date that asserts someone read them.

They are separated because the second half cannot be verified the way the first
can. A rewrite is a judgement about whether two sentences are too alike, and a
stamp is a person's claim to have looked — neither is settled by a green gate.
Shipping them together would mean the mechanical half waits on the judgement
half, and the judgement half arrives buried inside a refactor.

## Consequences

A stale fingerprint is a hard failure, not a report: it becomes a `problem`,
which increments `failures`, which returns 1. So the moment the fingerprint
changes, all four entries fail `npm run validate` and the gate is red until each
is re-read. **That is the work, not a side effect of it.**

`CONTRIBUTING.md` currently tells contributors the fingerprint covers three
named fields, and explains that moving a paragraph from `setup` into
`background` trips the check without a word having changed. The first half
becomes wrong and the second half's rationale changes. Both get rewritten.

Whether the four `background` passages survive the comparison unchanged is
unknown until it runs. Any that follow a source too closely get rewritten, and
those are prose changes to shipped entries — each read individually rather than
waved through.

Stamping stays a person's act. This change does not stamp on anyone's behalf,
for the reason `originality.ts` already gives: a tool that stamps whatever it
failed to flag is certifying its own blind spot.

This is a **minor** release, not a patch. `PROSE_FIELDS` is a new export from
`packages/data`, and the changelog's own rule is that anything additive to what
the package exports is a minor. The commit subject needs a `feat:` prefix to say
so; left unprefixed it would cut a patch and mislabel the release.

## Out of scope

Handoff §2 (payload thresholds) and §4 (alias collisions — measured at exactly
one, `slam` on `speed` and `spit`, and it looks legitimate rather than a defect).
Semantic paraphrase remains the documented blind spot; nothing here narrows it.

## What would falsify this

If the comparison comes back clean on all four backgrounds, the mechanism gap
was still real and the change still stands — but its urgency was overstated, and
the report should say exactly that rather than implying it caught something. A
clean result is a result, and it gets reported as one.
