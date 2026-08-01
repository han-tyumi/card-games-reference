/**
 * Turn a game's `layout` into positioned rectangles.
 *
 * The geometry lives here, in the data package, so every renderer draws the
 * same diagram: SVG for the web and Markdown, PDFKit primitives for the PDF,
 * and whatever the apps use later. A renderer's only job is to put ink where
 * this module says.
 *
 * Coordinates are in abstract units with the origin at the top left. Consumers
 * scale them.
 */

import type { CardGame } from "../schema/game.types.ts";

export type Layout = NonNullable<CardGame["layout"]>;
export type Zone = Layout["rows"][number][number];
export type ZoneKind = Zone["kind"];

/** Card proportions follow a real playing card (2.5 x 3.5 inches). */
export const CARD = { width: 30, height: 42 };

const GAP_X = 10;
const GAP_Y = 26;
/** Room for a caption under a pile, allowing for one wrapped second line. */
const LABEL_HEIGHT = 20;
/** How far each card in a fanned pile is offset from the one beneath it. */
const FAN_STEP = 5;
/** Depth shown for a squared-up pile, so a stock reads as thicker than one card. */
const STACK_STEP = 1.6;
const MAX_FANNED = 7;
/** How much of a card the row beneath it covers, in overlapping layouts. */
const ROW_OVERLAP = 0.45;

export type CardRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  faceUp: boolean;
};

export type Pile = {
  kind: ZoneKind;
  /** Present only on the first pile of a repeated group. */
  label?: string;
  /** How many cards the pile actually holds; undefined when it varies. */
  count?: number;
  /** Drawn bottom first, so later rectangles overlap earlier ones. */
  cards: CardRect[];
  /** Bounding box of the whole pile, including its fan. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** True when the pile starts empty and should be drawn as an outline. */
  empty: boolean;
};

export type Diagram = {
  width: number;
  height: number;
  piles: Pile[];
  labels: { text: string; x: number; y: number; width: number }[];
  caption?: string;
};

function cardsFor(zone: Zone, index: number): number | undefined {
  const { cards } = zone;
  if (cards === undefined) return undefined;
  if (typeof cards === "number") return cards;
  return cards[index] ?? cards[cards.length - 1];
}

/** A pile's drawn height: fanned piles grow downward, stacks barely do. */
function pileHeight(count: number | undefined, fanned: boolean): number {
  if (count === undefined || count <= 1) return CARD.height;
  const shown = Math.min(count, MAX_FANNED);
  const step = fanned ? FAN_STEP : STACK_STEP;
  return CARD.height + (shown - 1) * step;
}

/**
 * Whether a pile is spread so every card shows.
 *
 * A tableau column is spread and most other piles are squared, but that is a
 * default, not a law: a 500 Rummy discard pile is staggered precisely because
 * you may take from part-way down it. Appearance is stated on the zone rather
 * than inferred from its kind, so nobody has to mislabel a pile to draw it.
 */
function isFanned(zone: Zone): boolean {
  return zone.fan ?? zone.kind === "tableau";
}

function buildPile(
  zone: Zone,
  index: number,
  x: number,
  y: number,
): Pile {
  const count = cardsFor(zone, index);
  const fanned = isFanned(zone);
  const face = zone.face ?? "up";
  const cards: CardRect[] = [];

  const shown = count === undefined ? 1 : Math.min(count, MAX_FANNED);
  const step = fanned ? FAN_STEP : STACK_STEP;

  for (let i = 0; i < shown; i += 1) {
    // "last-up" is the Klondike case: buried cards face down, the top one turned.
    const faceUp =
      face === "up" ? true : face === "down" ? false : i === shown - 1;
    cards.push({
      x,
      y: y + i * step,
      width: CARD.width,
      height: CARD.height,
      faceUp,
    });
  }

  return {
    kind: zone.kind,
    label: zone.label,
    count,
    cards,
    x,
    y,
    width: CARD.width,
    height: pileHeight(count, fanned),
    empty: count === 0,
  };
}

type RowLabel = { text: string; x: number; width: number };

/** Lay a layout out into positioned piles, with every row centred. */
export function buildDiagram(layout: Layout): Diagram {
  type Row = {
    piles: Pile[];
    rowLabels: RowLabel[];
    width: number;
    height: number;
  };
  const rows: Row[] = [];

  for (const zones of layout.rows) {
    const piles: Pile[] = [];
    const rowLabels: RowLabel[] = [];
    let cursor = 0;
    let tallest = CARD.height;

    for (const zone of zones) {
      const repeat = zone.repeat ?? 1;
      const start = cursor;

      for (let i = 0; i < repeat; i += 1) {
        if (zone.kind !== "gap") {
          const pile = buildPile(zone, i, cursor, 0);
          piles.push(pile);
          tallest = Math.max(tallest, pile.height);
        }
        cursor += CARD.width + GAP_X;
      }

      // One caption per group, centred across all of its piles rather than
      // hanging off the first one.
      if (zone.label && zone.kind !== "gap") {
        rowLabels.push({
          text: zone.label,
          x: start,
          width: Math.max(CARD.width, cursor - GAP_X - start),
        });
      }
    }

    const width = Math.max(0, cursor - GAP_X);
    rows.push({
      piles,
      rowLabels,
      width,
      height: tallest + (rowLabels.length > 0 ? LABEL_HEIGHT : 0),
    });
  }

  const width = Math.max(...rows.map((r) => r.width), CARD.width);
  const labels: Diagram["labels"] = [];
  const piles: Pile[] = [];
  const overlapping = layout.overlapping_rows ?? 0;
  let y = 0;

  for (const [index, row] of rows.entries()) {
    const offset = (width - row.width) / 2;

    for (const pile of row.piles) {
      pile.x += offset;
      pile.y += y;
      for (const card of pile.cards) {
        card.x += offset;
        card.y += y;
      }
      piles.push(pile);
    }

    // Captions sit below the tallest pile in the row so they line up. The
    // baseline goes at the TOP of the label band, not the bottom, so a caption
    // that wraps to a second line stays inside the row instead of running into
    // whatever is underneath.
    const bandTop = y + row.height - LABEL_HEIGHT;
    for (const label of row.rowLabels) {
      labels.push({
        text: label.text,
        x: label.x + offset,
        y: bandTop + 8,
        width: label.width,
      });
    }

    // Rows inside the overlapping block sit part-way up the row above, so the
    // covering the rules describe is the covering you can see. Rows are pushed
    // in order, and renderers draw in order, so a lower row correctly overlaps
    // the one it covers.
    const nextOverlaps = index + 1 < overlapping;
    y += nextOverlaps ? CARD.height * (1 - ROW_OVERLAP) : row.height + GAP_Y;
  }

  return {
    width,
    height: Math.max(0, y - GAP_Y),
    piles,
    labels,
    caption: layout.caption,
  };
}
