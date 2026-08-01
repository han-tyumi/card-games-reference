# 0010. Wrap figures in the geometry, not in the stylesheet

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

President's rank order is thirteen cards. Drawn as one row it is 536 units
wide, which every renderer then scales to fit whatever it has. On a 390px phone
that left the card faces at 7.7px against 17px body text — the picture was
there, and unreadable.

The obvious reach is for CSS: flexbox, a breakpoint, wrap the row on a narrow
screen. It does not work. A figure is an SVG, and an SVG's internal layout is
fixed at the moment the file is written; the browser can scale the finished
drawing but cannot move a card from the end of one row to the start of the
next. A breakpoint can only make it smaller, which is the complaint.

The same figures go to three places with different measures: a Markdown page, a
612pt booklet, and a phone.

Two other things were wrong in the same area. The site read pre-rendered SVGs
out of `rendered/diagrams/`, so `npm run web` silently depended on `npm run
render` having gone first. And because those files carry a caption drawn inside
the image — Markdown has nowhere else to put one — every page showed its
caption twice: once shrunk inside the picture, once at body size underneath.

## Considered options

- **Flex and breakpoints in the stylesheet** — rejected on the mechanism, not
  the taste: CSS cannot reflow the inside of an SVG. What it can decide is how
  much the finished drawing is scaled, and that is the part that was failing.
- **Scroll every wide drawing horizontally** — rejected as the primary answer.
  It preserves legibility but costs the overview, and a ranking strip is one
  thing whose whole shape is the point. Kept as the fallback for the drawings
  that genuinely cannot wrap.
- **Raise the font sizes inside wide drawings so they survive the shrink** —
  rejected: it makes a figure's type size depend on its width, so two figures on
  one page are set differently for no reason a reader can see.
- **A fixed maximum cards per row** — rejected. A labelled row spends 74 units
  on its gutter, so the same card count is a different width, and every labelled
  figure would come out the wider one.
- **Wrap in the geometry, to a maximum width, with the width a parameter** —
  chosen.

## Decision

`buildFigure` wraps a row that will not fit, and takes the width it has to fit
into. The default, `MAX_FIGURE_WIDTH`, is derived from the narrowest thing that
has to show one: a 390px phone leaves about 355px of column, renderers draw at
1.6x, and card faces stop being comfortable below about 14px.

Because the wrap is in the geometry, all three renderers inherit it. A renderer
with more room says so — the booklet passes its own content width — because
wrapping narrower than necessary is not free: it trades width for height, and a
page has a bottom.

Lines are balanced rather than filled greedily, so eight cards at six per line
are four and four rather than six and a stranded pair.

`svg.ts` moves from `packages/build/` to `packages/data/`, so the site draws its
own figures instead of reading another build's output, and can ask for one
without a caption because it has `<figcaption>`.

What is left for CSS is the part that really is the page's decision: how far to
scale the finished drawing. It shrinks to fit down to `MIN_LEGIBLE_SCALE` — the
point where the smallest labels reach 9px — and scrolls past that.

## Consequences

Every figure is now at most 288 units wide, and nothing anywhere renders text
below 9px; President's rank order went from 7.7px to 14.2px on a phone. The
booklet improved too: no figure is drawn below card size any more, where the
widest used to be squeezed to 79%.

The cost is that a thirteen-card strip is three lines instead of one, which
reads less like a single order. Where that matters more than the width, the
answer is a wider `maxWidth` from that renderer, not a change to the default.

Figure geometry is now medium-dependent, which is a real loss: `buildFigure` no
longer returns one canonical answer, and a test comparing two renderers has to
say which width it means. The alternative was worse — a single wrap point can
only be right for one of a phone and a page.

A ten-column tableau still cannot wrap, because it really is ten columns. Those
scroll, and the scroll containers carry the usual pair of gradients so a cut-off
column does not just look like the last one.

`packages/data` now ships an SVG renderer, which stretches "data package" a
little. The precedent is `prose.ts`, which moved there after the same problem:
two copies of one renderer had already drifted apart.
