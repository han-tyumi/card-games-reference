/**
 * Geometry for card figures: ranking strips and combination examples.
 *
 * Same arrangement as layout.ts -- compute positions here, let each renderer
 * put ink where this says -- but the cards carry a face and sit in labelled
 * rows rather than piles on a table.
 */

import type { CardGame } from "../schema/game.types.ts";
import { CARD } from "./layout.ts";

export type Figure = NonNullable<CardGame["figures"]>[number];
export type FigureRow = Figure["rows"][number];

const GAP_X = 6;
const ROW_GAP = 10;
/** Between the lines of one wrapped row: tighter, so they read as one row. */
const WRAP_GAP = 4;
/** Room under a card for a note, allowing one wrapped second line. */
const NOTE_HEIGHT = 20;
/**
 * Room above a row for its label.
 *
 * Labels used to sit in a gutter to the left, which cost 74 units -- a quarter
 * of the whole budget on the narrowest screen that has to show one, spent on
 * every row whether it needed it or not. Above the row the label is free of the
 * card grid, so the cards get the full width. All 98 labels in the corpus fit
 * one line at this size across the narrowest figure.
 */
const LABEL_HEIGHT = 13;

/**
 * Widest a figure is drawn unless a renderer asks for more, in the abstract
 * units everything here uses.
 *
 * A rendered figure's internal layout is fixed at the moment it is written, so
 * no amount of CSS can reflow a fourteen-card ranking strip into something a
 * phone can read: a breakpoint can only scale the whole thing down, which is
 * the problem rather than the cure. So the wrap happens here, in the geometry,
 * and every renderer inherits it.
 *
 * The default is derived from WCAG 2.2 SC 1.4.10 Reflow (AA), which requires
 * content to work at 320 CSS px without scrolling in two directions. That is
 * not a phone measurement -- it is what a 1280px window becomes at 400% zoom,
 * which is the ordinary way a low-vision reader reads anything. At 320px this
 * site leaves a 285px column; renderers draw these units at 1.6x and stop
 * shrinking at 0.703 of that, so a figure clears the column at
 * 285 / 0.703 / 1.6 - 16 = 237 units. Widths quantise to whole cards, and 240
 * is the round number whose largest row still lands at 210.
 *
 * A renderer with more room should say so, because wrapping narrower than
 * necessary is not free: it trades width for height, and a page has a bottom.
 */
export const MAX_FIGURE_WIDTH = 240;

/**
 * Split a row into lines that fit, as evenly as they divide.
 *
 * Balanced rather than greedy: eight cards at six per line reads better as
 * four and four than as six and a stranded pair.
 */
export function wrapCards<T>(cards: T[], perLine: number): T[][] {
  if (cards.length <= perLine) return [cards];

  const lines = Math.ceil(cards.length / perLine);
  const base = Math.floor(cards.length / lines);
  // The remainder is spread one card at a time over the earliest lines, so no
  // line is ever more than one card longer than any other.
  const extra = cards.length % lines;

  const out: T[][] = [];
  let taken = 0;
  for (let i = 0; i < lines; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push(cards.slice(taken, taken + size));
    taken += size;
  }
  return out;
}

export type FigureCard = {
  face: string;
  note?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** True when the row is a counter-example and should read as crossed out. */
  struck: boolean;
};

export type FigureLayout = {
  width: number;
  height: number;
  cards: FigureCard[];
  /** Sits above its row, left-aligned, spanning the width of the figure. */
  rowLabels: { text: string; x: number; y: number; width: number; struck: boolean }[];
  /** True when at least one row is marked invalid, so renderers can add a key. */
  hasCounterExample: boolean;
};

/**
 * Whether a row's cards may be split across lines.
 *
 * A ranking is an order, and an order survives wrapping the way a sentence
 * does -- read left to right, then down, and it still says the same thing. A
 * meld is one combination, and a combination does not: a straight flush broken
 * over two lines stops looking like a straight flush, and a canasta split four
 * and three stops being seven of a rank. Those rows stay whole even when that
 * makes the figure wider than asked for, and the page scrolls them instead.
 *
 * This is the one place the distinction the schema already draws -- "ranking"
 * for cards in order of power, "meld" for a valid or invalid combination --
 * has to be acted on rather than just recorded.
 */
export function mayWrap(figure: Figure): boolean {
  return figure.kind === "ranking";
}

export function buildFigure(
  figure: Figure,
  maxWidth: number = MAX_FIGURE_WIDTH,
): FigureLayout {
  const anyNotes = figure.rows.some((row) => row.cards.some((c) => c.note));
  const rowHeight = CARD.height + (anyNotes ? NOTE_HEIGHT : 0);

  // Labels sit above their row, so the cards get the full width rather than
  // what is left after a gutter. The constraint is the space, not the count.
  const perLine = mayWrap(figure)
    ? Math.max(1, Math.floor((maxWidth + GAP_X) / (CARD.width + GAP_X)))
    : Infinity;

  const cards: FigureCard[] = [];
  const rowLabels: FigureLayout["rowLabels"] = [];
  let widest = 0;
  let y = 0;

  for (const row of figure.rows) {
    const struck = row.valid === false;
    const lines = wrapCards(row.cards, perLine);

    if (row.label) {
      rowLabels.push({
        text: row.label,
        x: 0,
        // Baseline sits just clear of the cards below it.
        y: y + LABEL_HEIGHT - 4,
        // Widened to the whole figure once that is known, below.
        width: 0,
        struck,
      });
      y += LABEL_HEIGHT;
    }

    lines.forEach((line, index) => {
      let x = 0;
      for (const card of line) {
        cards.push({
          face: card.face,
          note: card.note,
          x,
          y,
          width: CARD.width,
          height: CARD.height,
          struck,
        });
        x += CARD.width + GAP_X;
      }
      widest = Math.max(widest, x - GAP_X);

      y += rowHeight + (index === lines.length - 1 ? ROW_GAP : WRAP_GAP);
    });
  }

  // A label spans the figure rather than its own row, so a long one over a
  // short row still gets a line to itself instead of wrapping into the cards.
  for (const label of rowLabels) label.width = widest;

  return {
    width: widest,
    height: Math.max(0, y - ROW_GAP),
    cards,
    rowLabels,
    hasCounterExample: figure.rows.some((row) => row.valid === false),
  };
}

/** Red suits are red; everything else takes the default ink. */
export function isRedSuit(face: string): boolean {
  return face.includes("♥") || face.includes("♦");
}
