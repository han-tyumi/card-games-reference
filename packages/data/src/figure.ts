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
/** Room under a card for a note, allowing one wrapped second line. */
const NOTE_HEIGHT = 20;
/** Room to the left of each row for its label, when any row has one. */
const LABEL_WIDTH = 74;

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

export function buildFigure(figure: Figure): FigureLayout {
  const needsLabels = figure.rows.some((row) => row.label);
  const left = needsLabels ? LABEL_WIDTH : 0;
  const anyNotes = figure.rows.some((row) => row.cards.some((c) => c.note));
  const rowHeight = CARD.height + (anyNotes ? NOTE_HEIGHT : 0);

  const cards: FigureCard[] = [];
  const rowLabels: FigureLayout["rowLabels"] = [];
  let widest = 0;
  let y = 0;

  for (const row of figure.rows) {
    const struck = row.valid === false;
    let x = left;

    for (const card of row.cards) {
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
    if (row.label) {
      rowLabels.push({
        text: row.label,
        x: 0,
        // Sits against the middle of the card row rather than its top.
        y: y + CARD.height / 2 + 3,
        width: LABEL_WIDTH - 8,
        struck,
      });
    }
    y += rowHeight + ROW_GAP;
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
