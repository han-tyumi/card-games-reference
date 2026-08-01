/**
 * Diagram geometry.
 *
 * Every bug this has had was found by looking at a picture: a pyramid drawn with
 * its rows apart, a discard pile squared up when the rules say you take from
 * part-way down it, two captions colliding. A diagram is wrong silently — it
 * renders fine, it just contradicts the prose beside it — so the cases below are
 * the ones a reader caught, written down so they cannot come back.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { CARD, buildDiagram } from "naibi";
import type { Layout } from "naibi";

const GAP_Y = 26;
const ROW_OVERLAP = 0.45;

/** Pitch between rows that overlap: what is left of a card once it is covered. */
const OVERLAP_STEP = CARD.height * (1 - ROW_OVERLAP);

/** Positions accumulate by addition, so compare them the way pixels compare. */
function closeTo(actual: number, expected: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

function layout(rows: Layout["rows"], extra: Partial<Layout> = {}): Layout {
  return { rows, ...extra };
}

test("a single pile is one card at the origin", () => {
  const diagram = buildDiagram(layout([[{ kind: "stock" }]]));

  assert.equal(diagram.width, CARD.width);
  assert.equal(diagram.height, CARD.height);
  assert.equal(diagram.piles.length, 1);
  assert.deepEqual(diagram.piles[0]?.cards, [
    { x: 0, y: 0, width: CARD.width, height: CARD.height, faceUp: true },
  ]);
});

test("a narrow row is centred against the widest one", () => {
  const diagram = buildDiagram(
    layout([[{ kind: "stock" }], [{ kind: "tableau", repeat: 3 }]]),
  );

  const wide = diagram.piles.filter((p) => p.kind === "tableau");
  assert.equal(wide.length, 3);
  const rowWidth = 3 * CARD.width + 2 * 10;
  assert.equal(diagram.width, rowWidth);

  // The lone pile sits in the middle of the three, not against the left edge.
  assert.equal(diagram.piles[0]?.x, (rowWidth - CARD.width) / 2);
});

test("repeat with a cards array deals a different count to each pile", () => {
  const diagram = buildDiagram(
    layout([[{ kind: "tableau", repeat: 4, cards: [1, 2, 3, 4] }]]),
  );

  assert.deepEqual(
    diagram.piles.map((p) => p.count),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    diagram.piles.map((p) => p.cards.length),
    [1, 2, 3, 4],
  );
});

test("a gap takes up space but draws nothing", () => {
  const diagram = buildDiagram(
    layout([[{ kind: "stock" }, { kind: "gap" }, { kind: "waste" }]]),
  );

  assert.deepEqual(
    diagram.piles.map((p) => p.kind),
    ["stock", "waste"],
  );
  // Two card widths of separation, not one: the gap is between them.
  assert.equal(diagram.piles[1]!.x - diagram.piles[0]!.x, 2 * (CARD.width + 10));
});

test("one caption spans a whole repeated group", () => {
  const diagram = buildDiagram(
    layout([[{ kind: "foundation", repeat: 4, label: "Foundations" }]]),
  );

  assert.equal(diagram.labels.length, 1);
  const [label] = diagram.labels;
  assert.equal(label?.text, "Foundations");
  assert.equal(label?.x, 0);
  // Spans all four piles and the gaps between them, so centring the text
  // centres it on the group rather than on the first pile.
  assert.equal(label?.width, 4 * CARD.width + 3 * 10);
});

test("a caption sits at the top of its band, leaving room to wrap", () => {
  const diagram = buildDiagram(layout([[{ kind: "stock", label: "Stock" }]]));
  const [label] = diagram.labels;

  assert.ok(label);
  // Inside the diagram with the whole label band below it. A baseline at the
  // BOTTOM of the band put a wrapped second line into the caption underneath.
  assert.ok(label.y < diagram.height, "baseline is inside the diagram");
  assert.ok(label.y > CARD.height, "baseline is below the cards");
});

test("a tableau fans and a stock stacks, by default", () => {
  const diagram = buildDiagram(
    layout([[{ kind: "tableau", cards: 3 }, { kind: "stock", cards: 3 }]]),
  );

  const [tableau, stock] = diagram.piles;
  assert.ok(tableau && stock);
  // Both draw three cards; the fanned one spreads far enough to read them.
  assert.equal(tableau.cards.length, 3);
  assert.equal(stock.cards.length, 3);
  assert.ok(tableau.height > stock.height);
  assert.ok(stock.height > CARD.height, "a stack still shows some depth");
});

test("fan is stated on the zone, not inferred from its kind", () => {
  // 500 Rummy's discard pile is staggered because you may take from part-way
  // down it. Before `fan` existed the only way to draw that was to mislabel the
  // pile a tableau, which made the data lie to say the right thing.
  const spread = buildDiagram(layout([[{ kind: "discard", cards: 4, fan: true }]]));
  const squared = buildDiagram(layout([[{ kind: "discard", cards: 4 }]]));
  const flat = buildDiagram(layout([[{ kind: "tableau", cards: 4, fan: false }]]));

  assert.ok(spread.piles[0]!.height > squared.piles[0]!.height);
  assert.equal(flat.piles[0]!.height, squared.piles[0]!.height);
  assert.equal(spread.piles[0]!.kind, "discard");
});

test('"last-up" turns only the top card, as Klondike deals', () => {
  const diagram = buildDiagram(
    layout([[{ kind: "tableau", cards: 4, face: "last-up" }]]),
  );

  assert.deepEqual(
    diagram.piles[0]?.cards.map((c) => c.faceUp),
    [false, false, false, true],
  );
});

test("face down means every card, face up means every card", () => {
  const down = buildDiagram(layout([[{ kind: "stock", cards: 3, face: "down" }]]));
  const up = buildDiagram(layout([[{ kind: "stock", cards: 3, face: "up" }]]));

  assert.deepEqual(down.piles[0]?.cards.map((c) => c.faceUp), [false, false, false]);
  assert.deepEqual(up.piles[0]?.cards.map((c) => c.faceUp), [true, true, true]);
});

test("an empty pile is marked empty and draws no cards", () => {
  const diagram = buildDiagram(layout([[{ kind: "foundation", cards: 0 }]]));

  assert.equal(diagram.piles[0]?.empty, true);
  assert.deepEqual(diagram.piles[0]?.cards, []);
  // It still occupies a card's worth of space, so the row stays aligned.
  assert.equal(diagram.piles[0]?.height, CARD.height);
});

test("a deep pile is drawn shallow rather than off the page", () => {
  const diagram = buildDiagram(layout([[{ kind: "stock", cards: 40 }]]));

  assert.equal(diagram.piles[0]?.count, 40, "the count is still the truth");
  assert.equal(diagram.piles[0]?.cards.length, 7, "but only seven are drawn");
});

test("an unspecified count draws one card and claims nothing", () => {
  const diagram = buildDiagram(layout([[{ kind: "hand" }]]));

  assert.equal(diagram.piles[0]?.count, undefined);
  assert.equal(diagram.piles[0]?.cards.length, 1);
  assert.equal(diagram.piles[0]?.empty, false);
});

test("rows are drawn clear of each other unless told otherwise", () => {
  const diagram = buildDiagram(layout([[{ kind: "stock" }], [{ kind: "waste" }]]));

  const [first, second] = diagram.piles;
  assert.equal(second!.y - first!.y, CARD.height + GAP_Y);
});

test("overlapping rows overlap", () => {
  // A pyramid: seven rows, every one of them covered by the row below. The
  // diagram used to draw them apart, which contradicted the caption telling the
  // reader that a card is blocked until the two beneath it are gone.
  const row = (repeat: number): Layout["rows"][number] => [
    { kind: "tableau", repeat, fan: false },
  ];
  const diagram = buildDiagram(
    layout([row(1), row(2), row(3), row(4), row(5), row(6), row(7)], {
      overlapping_rows: 7,
    }),
  );

  const tops = [...new Set(diagram.piles.map((p) => p.y))].sort((a, b) => a - b);
  assert.equal(tops.length, 7);

  for (let i = 1; i < tops.length; i += 1) {
    const step = tops[i]! - tops[i - 1]!;
    closeTo(step, OVERLAP_STEP, `row ${i} pitch`);
    assert.ok(step < CARD.height, "each row covers part of the row above");
  }

  // Rows are emitted top-first and renderers draw in order, so a lower row
  // paints over the one it covers rather than under it.
  const firstOfLastRow = diagram.piles.findIndex((p) => p.y === tops[6]);
  const lastOfFirstRow = diagram.piles.map((p) => p.y).lastIndexOf(tops[0]!);
  assert.ok(firstOfLastRow > lastOfFirstRow);

  closeTo(diagram.height, 6 * OVERLAP_STEP + CARD.height, "diagram height");
});

test("rows past the overlapping block go back to normal spacing", () => {
  // TriPeaks: three overlapping rows of peaks, then a separate waste row.
  const diagram = buildDiagram(
    layout(
      [
        [{ kind: "tableau", repeat: 3, fan: false }],
        [{ kind: "tableau", repeat: 6, fan: false }],
        [{ kind: "stock" }, { kind: "waste" }],
      ],
      { overlapping_rows: 2 },
    ),
  );

  const tops = [...new Set(diagram.piles.map((p) => p.y))].sort((a, b) => a - b);
  closeTo(tops[1]! - tops[0]!, OVERLAP_STEP, "overlapping pitch");
  closeTo(tops[2]! - tops[1]!, CARD.height + GAP_Y, "clear pitch");
});

test("the caption is carried through untouched", () => {
  const diagram = buildDiagram(
    layout([[{ kind: "stock" }]], { caption: "Deal the stock face down." }),
  );

  assert.equal(diagram.caption, "Deal the stock face down.");
});
