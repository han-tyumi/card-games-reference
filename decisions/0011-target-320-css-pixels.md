# 0011. Target 320 CSS pixels, and wrap orders but never combinations

- **Status:** Accepted
- **Date:** 2026-08-01

Supersedes [0010](0010-figures-wrap-in-the-geometry.md), whose central decision —
that the wrap belongs in the geometry rather than the stylesheet — still holds.
What changes is the width it wraps to, and the discovery that width was the
wrong thing to decide it on alone.

## Context

[0010](0010-figures-wrap-in-the-geometry.md) set `MAX_FIGURE_WIDTH` to 288 units
from an unexamined premise: "a 390px phone". That is a guess at an audience, not
a standard, and two things were wrong with it.

**320, not 390, is the number with standing.** WCAG 2.2 SC 1.4.10 Reflow (Level
AA) is normative: content must work "at a width equivalent to 320 CSS pixels"
without scrolling in two directions. The 320 is not a phone measurement — it is
what a 1280px window becomes at 400% zoom, which is how a low-vision reader
reads anything. Verified in Chromium: a 1280px window at 400% zoom reports
`innerWidth` 320, and a zoom run over all 62 pages was field-for-field identical
to a 320px viewport. Only 3 of 107 devices in Playwright's registry are 320
wide, all legacy; the modal modern phone is 360 and every iPhone SE since 2016
is 375. So "support small phones" argues for 375. Four-hundred-percent zoom
argues for 320, and that is the population the target exists for.

Measured against the live site at 288: **33 of 61 figures scrolled sideways at
320px, across 18 pages**, worst overflow 53px.

**Width alone is the wrong test.** Lowering the cap to 240 with labels still in
their gutter was measured to split **15 combination rows** instead of 5 — a
five-card poker hand became three cards and a pair, a canasta four and three.
Wrapping a rank order is lossless the way wrapping a sentence is. Wrapping a
hand is not: "Four of a kind" split across two lines is a different hand. The
schema had drawn this distinction all along — `"ranking"` for cards in order of
power, `"meld"` for a combination — and the geometry had never acted on it.

Worse, the 288 already in production split five combination rows, including
Hand and Foot's three canastas and Contract Rummy's eight-card run. That was a
defect the day 0010 shipped and nobody had looked for it.

## Considered options

- **Keep 288, or adopt 375 and change nothing** — rejected. 375 has no normative
  basis and does not cover the zoom case. Measured, it also clears by only 1.8px,
  on a browser reporting 0px overlay scrollbars, so it is not robust either.
- **Lower the cap and leave everything else alone** — rejected on measurement:
  it triples the number of combinations broken apart. Reflow conformance bought
  by making thirteen figures say something false about the game is not a trade
  worth making.
- **Claim the two-dimensional exception for every drawing** — rejected. The
  exception is for content that *requires* two-dimensional layout. A rank strip
  does not; it wraps and still reads as one order. Putting a component that
  could reflow inside a scroll container does not confer conformance on it.
- **Wrap on a maximum cards-per-row instead of a width** — rejected again, for
  the reason 0010 gave: a labelled row and an unlabelled one would finish at
  different widths.
- **Keep labels in a gutter and accept narrower rows** — rejected. The gutter
  costs 74 units, a quarter of the budget at 320px, and every row paid it
  whether it had a label or not.
- **Labels above the row, wrapping decided by what the row means** — chosen.

## Decision

Three changes, which only work together:

- `MAX_FIGURE_WIDTH` becomes **240**, derived rather than guessed: 320px viewport
  − 36px of page padding = 284px of column; renderers draw at 1.6x and stop
  shrinking at 0.703; so a figure clears the column at 285 / 0.703 / 1.6 − 16 =
  237 units, and widths quantise to whole cards.
- **Row labels sit above their row**, not in a gutter beside it. The label costs
  height, which is cheap, instead of width, which is what ran out.
- **`mayWrap()` decides by kind.** A `ranking` wraps. A `meld` never splits a row,
  even when that leaves the figure wider than asked for — those keep their width
  and the page scrolls them, which is a narrow and specific claim on the
  two-dimensional exception rather than a blanket one.

The page's horizontal padding moves from `rem` to `px`. In `rem` it grew with
the reader's default font size, so enlarging type *narrowed* the column the
drawings are sized against — backwards, and worst for exactly the readers the
320px target is for. Measured: 285px down to 250px between a 16px and a 32px
root.

## Consequences

At 320px, **no ranking strip scrolls** — down from 33 figures — and no page
scrolls sideways at 100% or 200% text. Three melds still scroll: Contract
Rummy's eight-card run, Hand and Foot's canastas, Seven-Card Stud's seven. That
is the intended exception, and it is three figures rather than a blanket claim.

Two page-level reflow failures surfaced while measuring and are fixed here. A
`<h1>` set at 200% text ("Concentration") was wider than the column on its own
and pushed the whole page sideways; and both `.facts` and `.games` are grids
whose tracks floor at their content's min-content width, which `overflow-wrap`
does not lower. Neither had anything to do with figures. Both were found only
because the 320px sweep went looking.

The costs are real. A thirteen-card strip is now three lines, which reads less
like a single order than two lines did — the most likely reason to revisit this.
Figures are taller, and the poker pages carry that worst because their hands
stay whole. Labels above changes the look of every figure in all three outputs,
and geometry now depends on the *meaning* of a row, so a figure mis-tagged
`ranking` will be silently broken apart where before it merely looked wrong.

Known gaps, stated rather than implied. Every measurement here is Chromium; no
Firefox or WebKit was tested, which matters most for keyboard access to the
scroll regions. Accordion and Concentration are one-dimensional sequences
hand-banded into rows of thirteen in their data; they are covered by the
diagram exception here, but a reviewer was right that they could be re-banded
instead, and that has not been done. The face-down card fill fails SC 1.4.11 and
the pile-depth count on it fails SC 1.4.3 — both known, neither fixed here, and
they need two separate changes rather than the one that looks sufficient.
SC 2.5.8 Target Size and 1.4.10's 256px height clause remain unexamined.
