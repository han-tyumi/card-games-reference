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
/** Room to the left of each row for its label, when any row has one. */
const LABEL_WIDTH = 74;

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
 * The default is the narrow end of what has to read: a 390px phone leaves
 * about 355px of column, renderers draw these units at 1.6x, and card faces
 * stop being comfortable below about 14px. That works back to roughly 290
 * units, and the padding a renderer adds around the figure eats the rest.
 *
 * A renderer with more room should say so, because wrapping narrower than
 * necessary is not free: it trades width for height, and a page has a bottom.
 */
export const MAX_FIGURE_WIDTH = 288;

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
  rowLabels: { text: string; x: number; y: number; width: number; struck: boolean }[];
  /** True when at least one row is marked invalid, so renderers can add a key. */
  hasCounterExample: boolean;
};

export function buildFigure(
  figure: Figure,
  maxWidth: number = MAX_FIGURE_WIDTH,
): FigureLayout {
  const needsLabels = figure.rows.some((row) => row.label);
  const left = needsLabels ? LABEL_WIDTH : 0;
  const anyNotes = figure.rows.some((row) => row.cards.some((c) => c.note));
  const rowHeight = CARD.height + (anyNotes ? NOTE_HEIGHT : 0);

  // How many cards fit beside the label column. A labelled figure therefore
  // wraps sooner than an unlabelled one and both finish the same width, which
  // is the point: the constraint is the space, not the card count.
  const perLine = Math.max(
    1,
    Math.floor((maxWidth - left + GAP_X) / (CARD.width + GAP_X)),
  );

  const cards: FigureCard[] = [];
  const rowLabels: FigureLayout["rowLabels"] = [];
  let widest = 0;
  let y = 0;

  for (const row of figure.rows) {
    const struck = row.valid === false;
    const lines = wrapCards(row.cards, perLine);

    lines.forEach((line, index) => {
      let x = left;
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

      // The label belongs to the row, not to each of its lines, so it sits
      // against the first one and the rest continue underneath it.
      if (row.label && index === 0) {
        rowLabels.push({
          text: row.label,
          x: 0,
          // Sits against the middle of the card row rather than its top.
          y: y + CARD.height / 2 + 3,
          width: LABEL_WIDTH - 8,
          struck,
        });
      }

      y += rowHeight + (index === lines.length - 1 ? ROW_GAP : WRAP_GAP);
    });
  }

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
