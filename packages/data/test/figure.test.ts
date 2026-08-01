/**
 * Figure geometry: ranking strips and worked examples of a combination.
 *
 * The failures here were all collisions — a row label written over the cards, a
 * two-line note printed on one line so "Right bower" came out as "Righlt Left
 * bower". Nothing throws when that happens; the picture just becomes unreadable.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { CARD, buildFigure, isRedSuit } from "naibi";
import type { Figure } from "naibi";

const LABEL_WIDTH = 74;
const NOTE_HEIGHT = 20;
const ROW_GAP = 10;
const GAP_X = 6;

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

test("a labelled row moves every card right, including unlabelled ones", () => {
  // The gutter is a property of the figure, not of the row: indenting only the
  // labelled rows would stagger cards that are meant to line up for comparison.
  const built = buildFigure(
    figure([
      { label: "Valid run", cards: [{ face: "9♦" }] },
      { cards: [{ face: "9♣" }] },
    ]),
  );

  assert.deepEqual(built.cards.map((c) => c.x), [LABEL_WIDTH, LABEL_WIDTH]);
  assert.equal(built.rowLabels.length, 1);
  assert.equal(built.rowLabels[0]?.x, 0);
  // The label ends short of the cards rather than running under them.
  assert.ok(built.rowLabels[0]!.width < LABEL_WIDTH);
});

test("a row label sits against the middle of its cards", () => {
  const built = buildFigure(figure([{ label: "Trump", cards: [{ face: "J♥" }] }]));
  const [label] = built.rowLabels;

  assert.ok(label);
  assert.ok(label.y > 0 && label.y < CARD.height, "beside the card, not above it");
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

test("hearts and diamonds are red; spades, clubs and jokers are not", () => {
  assert.equal(isRedSuit("A♥"), true);
  assert.equal(isRedSuit("10♦"), true);
  assert.equal(isRedSuit("A♠"), false);
  assert.equal(isRedSuit("A♣"), false);
  assert.equal(isRedSuit("Jkr"), false);
  assert.equal(isRedSuit("?"), false);
});
