/**
 * Figure geometry: ranking strips and worked examples of a combination.
 *
 * The failures here were all collisions — a row label written over the cards, a
 * two-line note printed on one line so "Right bower" came out as "Righlt Left
 * bower". Nothing throws when that happens; the picture just becomes unreadable.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CARD,
  MAX_FIGURE_WIDTH,
  buildFigure,
  isRedSuit,
  loadGames,
  mayWrap,
  wrapCards,
} from "naibi";
import type { Figure } from "naibi";

const NOTE_HEIGHT = 20;
const ROW_GAP = 10;
const GAP_X = 6;

/** A ranking strip of `n` cards, which is where wrapping actually bites. */
function strip(n: number, label?: string): Figure["rows"] {
  const cards = Array.from({ length: n }, (_, i) => ({ face: `${i}♠` }));
  // The schema types a row's cards as a non-empty tuple, which a generated
  // array cannot prove it is.
  return [{ label, cards: cards as Figure["rows"][number]["cards"] }];
}

function figure(rows: Figure["rows"], kind: Figure["kind"] = "meld"): Figure {
  return { kind, caption: "A figure for testing", rows };
}

test("cards run left to right with a fixed gap", () => {
  const built = buildFigure(
    figure([{ cards: [{ face: "A♠" }, { face: "K♠" }, { face: "Q♠" }] }]),
  );

  assert.deepEqual(
    built.cards.map((c) => c.x),
    [0, CARD.width + GAP_X, 2 * (CARD.width + GAP_X)],
  );
  assert.deepEqual(built.cards.map((c) => c.face), ["A♠", "K♠", "Q♠"]);
  assert.equal(built.width, 3 * CARD.width + 2 * GAP_X);
  assert.equal(built.height, CARD.height);
});

test("a label costs no width, so every row starts at the left edge", () => {
  // Labels used to sit in a 74-unit gutter, which every row paid for whether it
  // was labelled or not -- a quarter of the budget on the narrowest screen that
  // has to show one. Above the row it costs height instead, which is the
  // cheaper of the two when the constraint is a 320px column.
  const built = buildFigure(
    figure([
      { label: "Valid run", cards: [{ face: "9♦" }] },
      { cards: [{ face: "9♣" }] },
    ]),
  );

  assert.deepEqual(built.cards.map((c) => c.x), [0, 0], "cards are still flush left");
  assert.equal(built.width, CARD.width, "a label adds nothing to the width");
  assert.equal(built.rowLabels.length, 1);
  assert.equal(built.rowLabels[0]?.x, 0, "the label starts where the cards start");
});

test("a row label sits above its row, not beside it", () => {
  const built = buildFigure(figure([{ label: "Trump", cards: [{ face: "J♥" }] }]));
  const [label] = built.rowLabels;
  const [card] = built.cards;

  assert.ok(label && card);
  assert.ok(label.y <= card.y, "the label is above the card it names");
  // Wide enough that a long label gets its own line instead of wrapping into
  // the cards underneath it.
  assert.ok(label.width >= built.width);
});

test("one note anywhere gives every row room for a note", () => {
  const withNote = buildFigure(
    figure([
      { cards: [{ face: "J♥", note: "Right bower" }] },
      { cards: [{ face: "J♦" }] },
    ]),
  );
  const without = buildFigure(
    figure([{ cards: [{ face: "J♥" }] }, { cards: [{ face: "J♦" }] }]),
  );

  const pitch = (f: typeof withNote) => f.cards[1]!.y - f.cards[0]!.y;
  assert.equal(pitch(withNote) - pitch(without), NOTE_HEIGHT);
  assert.equal(pitch(without), CARD.height + ROW_GAP);
});

test("an invalid row is struck through, cards and label alike", () => {
  const built = buildFigure(
    figure([
      { label: "Valid", cards: [{ face: "5♠" }] },
      { label: "Not a run", valid: false, cards: [{ face: "K♠" }, { face: "A♠" }] },
    ]),
  );

  assert.deepEqual(built.cards.map((c) => c.struck), [false, true, true]);
  assert.deepEqual(built.rowLabels.map((l) => l.struck), [false, true]);
  assert.equal(built.hasCounterExample, true);
});

test("a figure with no counter-example says so, and gets no key", () => {
  const built = buildFigure(figure([{ cards: [{ face: "5♠" }] }]));
  assert.equal(built.hasCounterExample, false);
});

test("width is the widest row and height has no trailing gap", () => {
  const built = buildFigure(
    figure([
      { cards: [{ face: "A♠" }, { face: "K♠" }, { face: "Q♠" }] },
      { cards: [{ face: "2♥" }] },
    ]),
  );

  assert.equal(built.width, 3 * CARD.width + 2 * GAP_X);
  assert.equal(built.height, 2 * CARD.height + ROW_GAP);
});

test("notes travel with their card", () => {
  const built = buildFigure(
    figure([{ cards: [{ face: "J♥", note: "Right bower" }, { face: "J♦" }] }]),
  );

  assert.deepEqual(built.cards.map((c) => c.note), ["Right bower", undefined]);
});

// --- wrapping -------------------------------------------------------------
//
// A thirteen-card ranking strip drew as one long row, and every renderer then
// scaled the whole thing down to fit — which on a phone put the card faces at
// under 8px. Nothing can reflow a drawing after it is written, so the wrap has
// to happen here, before any of them see it.

test("cards are shared out evenly rather than filling each line", () => {
  // Eight at six per line is four and four, not six and a stranded pair.
  assert.deepEqual(wrapCards([1, 2, 3, 4, 5, 6, 7, 8], 6), [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
  ]);
  // Where it does not divide, the remainder goes to the earliest lines, so no
  // two lines differ by more than one card.
  assert.deepEqual(wrapCards([1, 2, 3, 4, 5, 6, 7], 3), [[1, 2, 3], [4, 5], [6, 7]]);
  assert.deepEqual(wrapCards([1, 2, 3], 3), [[1, 2, 3]], "a line that fits is left alone");
});

test("no figure is built wider than the narrowest thing that has to show it", () => {
  for (const n of [1, 5, 9, 13, 14, 30]) {
    for (const label of [undefined, "High to low"]) {
      const built = buildFigure({ kind: "ranking", caption: "c", rows: strip(n, label) });
      assert.ok(
        built.width <= MAX_FIGURE_WIDTH,
        `${n} cards${label ? " labelled" : ""}: ${built.width} units`,
      );
    }
  }
});

test("labelling a row changes nothing about how it wraps", () => {
  // It used to: the label's gutter came out of the row's width, so a labelled
  // strip broke two cards earlier than the same strip without one. The label is
  // above the cards now, so the two lay out identically.
  const plain = buildFigure({ kind: "ranking", caption: "c", rows: strip(13) });
  const labelled = buildFigure({ kind: "ranking", caption: "c", rows: strip(13, "High to low") });

  assert.equal(labelled.width, plain.width);
  assert.deepEqual(labelled.cards.map((c) => c.x), plain.cards.map((c) => c.x));
  assert.ok(labelled.height > plain.height, "it costs height instead");
});

test("a wrapped row keeps its reading order", () => {
  // Left to right, then down. A rank order that jumped columns would say
  // something false about the game.
  const built = buildFigure({ kind: "ranking", caption: "c", rows: strip(13) });
  const order = [...built.cards].sort((a, b) => a.y - b.y || a.x - b.x);
  assert.deepEqual(order.map((c) => c.face), built.cards.map((c) => c.face));
});

test("a wrapped row is labelled once, above its first line", () => {
  const built = buildFigure({
    kind: "ranking",
    caption: "c",
    rows: strip(13, "High to low"),
  });

  assert.equal(built.rowLabels.length, 1, "the label belongs to the row, not to each line");
  assert.ok(built.rowLabels[0]!.y < built.cards[0]!.y + CARD.height, "above the first line");
});

// --- what may be broken, and what may not ---------------------------------

test("a combination is never split, even when that makes the figure too wide", () => {
  // A rank order survives wrapping the way a sentence does. A meld does not: a
  // straight flush over two lines stops looking like a straight flush. Lowering
  // the cap without this rule turned "Four of a kind" into three cards and a
  // pair, which is a different hand.
  const hand = { kind: "meld", caption: "Four of a kind", rows: strip(8, "Four of a kind") } as const;
  const built = buildFigure(hand as never, 120);

  assert.equal(new Set(built.cards.map((c) => c.y)).size, 1, "the hand was split");
  assert.ok(built.width > 120, "it is allowed to overflow rather than break");
  assert.equal(mayWrap(hand as never), false);
});

test("an order is wrapped, because wrapping preserves it", () => {
  const order = { kind: "ranking", caption: "High to low", rows: strip(8) } as const;
  const built = buildFigure(order as never, 120);

  assert.ok(new Set(built.cards.map((c) => c.y)).size > 1, "the strip did not wrap");
  assert.ok(built.width <= 120);
  assert.equal(mayWrap(order as never), true);
});

test("every ranking in the corpus fits the target column; every meld stays whole", () => {
  // The two halves of the same decision. A ranking that overflows is a bug; a
  // meld that overflows is the deliberate exception, and the page scrolls it.
  const oversize: string[] = [];
  const broken: string[] = [];
  const wide: string[] = [];

  for (const game of loadGames()) {
    for (const [index, spec] of (game.figures ?? []).entries()) {
      const built = buildFigure(spec);
      const id = `${game.id}-fig${index + 1}`;

      if (mayWrap(spec)) {
        if (built.width > MAX_FIGURE_WIDTH) oversize.push(`${id} (${built.width}u)`);
      } else {
        const lines = new Set(built.cards.map((c) => c.y)).size;
        if (lines !== spec.rows.length) broken.push(id);
        // A meld may overflow — it must not be split — but "may" is not "should"
        // and nothing else in the gate would notice a new one. Until this was
        // written, a meld row of any length passed every check in the project.
        if (built.width > MAX_FIGURE_WIDTH) wide.push(id);
      }

      assert.equal(
        built.cards.length,
        spec.rows.reduce((n, row) => n + row.cards.length, 0),
        `${id}: cards went missing in the wrap`,
      );
    }
  }

  assert.deepEqual(oversize, [], "these rankings are too wide for a 320px column");
  assert.deepEqual(broken, [], "these combinations were split across lines");

  // Frozen rather than bounded: these three are worth their sideways scroll and
  // the next one should be argued for in a diff, not discovered by a reader.
  assert.deepEqual(
    wide.sort(),
    ["contract-rummy-fig1", "hand-and-foot-fig1", "seven-card-stud-fig1"],
    "a meld now overflows a 320px column — justify it, or is the row an order " +
      "that should be tagged `ranking` and allowed to wrap?",
  );
});

test("the lines of one row sit closer together than two rows do", () => {
  // Otherwise a wrapped row reads as several rows that happen to share a label.
  const wrapped = buildFigure({ kind: "ranking", caption: "c", rows: strip(13) });
  const separate = buildFigure({
    kind: "meld",
    caption: "c",
    rows: [{ cards: [{ face: "A♠" }] }, { cards: [{ face: "K♠" }] }],
  });

  const lines = [...new Set(wrapped.cards.map((c) => c.y))].sort((a, b) => a - b);
  assert.ok(lines.length > 1, "thirteen cards should not be on one line");
  assert.ok(lines[1]! - lines[0]! < separate.cards[1]!.y - separate.cards[0]!.y);
});

test("a renderer with more room gets a wider figure and a shorter one", () => {
  // The booklet's column is wider than a phone's. Wrapping to the phone anyway
  // traded width for height and then the page magnified the result: Hand and
  // Foot's melds grew from a third of a page to nearly all of one.
  const rows = strip(13, "High to low");
  const narrow = buildFigure({ kind: "ranking", caption: "c", rows });
  const wide = buildFigure({ kind: "ranking", caption: "c", rows }, 422);

  assert.ok(wide.width > narrow.width);
  assert.ok(wide.height < narrow.height);
  assert.equal(wide.cards.length, narrow.cards.length, "no card is lost either way");
});

test("hearts and diamonds are red; spades, clubs and jokers are not", () => {
  assert.equal(isRedSuit("A♥"), true);
  assert.equal(isRedSuit("10♦"), true);
  assert.equal(isRedSuit("A♠"), false);
  assert.equal(isRedSuit("A♣"), false);
  assert.equal(isRedSuit("Jkr"), false);
  assert.equal(isRedSuit("?"), false);
});
