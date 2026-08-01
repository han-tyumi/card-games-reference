/**
 * SVG output.
 *
 * SVG text does not wrap, does not clip and does not warn — it just runs off the
 * side of the canvas, or over the caption underneath. Every failure here was a
 * picture that looked wrong: a caption cut in half, a label written across a
 * pile, "Right bower" and "Left bower" printed on top of one another.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { loadGames } from "naibi";
import type { Figure, Layout } from "naibi";
import { renderDiagramSvg, renderFigureSvg, wrapText } from "../svg.ts";

// --- wrapping -------------------------------------------------------------

test("text short enough to fit stays on one line", () => {
  assert.deepEqual(wrapText("Stock", 200, 9), ["Stock"]);
});

test("text too long for the box is broken between words", () => {
  const lines = wrapText("Dealer turned trump card here", 40, 8);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(" "), "Dealer turned trump card here");
});

test("no line is broken mid-word", () => {
  // "Opponen/t" happened when the box was exactly one card wide.
  for (const line of wrapText("Opponent's discard pile", 30, 8)) {
    assert.ok(!line.startsWith(" ") && !line.endsWith(" "));
  }
  const words = wrapText("Opponent's discard pile", 30, 8).join(" ").split(" ");
  assert.deepEqual(words, ["Opponent's", "discard", "pile"]);
});

test("a line limit is honoured, with the overflow left long rather than cut", () => {
  const lines = wrapText("one two three four five six seven eight", 40, 8, 2);
  assert.equal(lines.length, 2);
  assert.equal(lines.join(" "), "one two three four five six seven eight");
});

test("a single word longer than the box is not broken", () => {
  assert.deepEqual(wrapText("Antidisestablishmentarianism", 20, 8), [
    "Antidisestablishmentarianism",
  ]);
});

// --- diagrams -------------------------------------------------------------

const layout: Layout = {
  caption: "Deal seven piles, turning the last card of each.",
  rows: [
    [{ kind: "stock", label: "Stock" }, { kind: "gap" }, { kind: "waste", label: "Waste" }],
    [{ kind: "tableau", repeat: 7, cards: [1, 2, 3, 4, 5, 6, 7], face: "last-up" }],
  ],
};

test("a diagram is a complete SVG document with a viewBox", () => {
  const svg = renderDiagramSvg(layout, "Klondike");

  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>\s*$/);
  assert.match(svg, /viewBox="0 0 [\d.]+ [\d.]+"/);
  assert.match(svg, /role="img"/);
});

test("a diagram names the game it belongs to, for a screen reader", () => {
  const svg = renderDiagramSvg(layout, "Klondike");
  assert.match(svg, /<title>[^<]*Klondike/);
});

test("the caption and every label appear in the output", () => {
  const svg = renderDiagramSvg(layout, "Klondike");

  assert.ok(svg.includes("Stock"));
  assert.ok(svg.includes("Waste"));
  assert.ok(svg.includes("turning the last card"));
});

test("markup in the data is escaped, not emitted", () => {
  const svg = renderDiagramSvg(
    { rows: [[{ kind: "stock", label: "A & B" }]], caption: '<script>"x"' },
    "Test & Game",
  );

  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&amp;"));
  assert.ok(svg.includes("&lt;script&gt;"));
});

test("nothing is drawn outside the canvas", () => {
  // The canvas is widened for the caption; a coordinate past its edge means
  // something is clipped in every viewer that honours the viewBox.
  for (const game of loadGames()) {
    if (!game.layout) continue;
    const svg = renderDiagramSvg(game.layout, game.name);
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    assert.ok(box, `${game.id}: no viewBox`);

    const width = Number(box[1]);
    const height = Number(box[2]);
    for (const [, x, y] of svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)"/g)) {
      assert.ok(Number(x) >= 0 && Number(x) <= width, `${game.id}: rect x ${x}`);
      assert.ok(Number(y) >= 0 && Number(y) <= height, `${game.id}: rect y ${y}`);
    }
  }
});

// --- figures --------------------------------------------------------------

const figure: Figure = {
  kind: "ranking",
  caption: "Trump ranking when diamonds are trump",
  rows: [
    {
      label: "Trumps",
      cards: [
        { face: "J♦", note: "Right bower" },
        { face: "J♥", note: "Left bower" },
        { face: "A♦" },
      ],
    },
    { label: "Not a trump", valid: false, cards: [{ face: "J♠" }] },
  ],
};

test("a figure is a complete SVG document carrying its caption", () => {
  const svg = renderFigureSvg(figure, "Euchre");

  assert.match(svg, /^<svg /);
  assert.match(svg, /viewBox="0 0 [\d.]+ [\d.]+"/);
  assert.ok(svg.includes("Trump ranking when diamonds are trump"));
});

test("every card face and note is drawn", () => {
  const svg = renderFigureSvg(figure, "Euchre");

  // Notes are wrapped, so the words are what survive, not the phrase.
  for (const text of ["J♦", "J♥", "A♦", "J♠", "Right", "Left", "bower", "Trumps"]) {
    assert.ok(svg.includes(text), `missing ${text}`);
  }
});

test("a two-line note is drawn on two lines", () => {
  // Every wrapped line was drawn at the same y once, so "Right bower" and the
  // line below it came out overprinted as "Righlt Left bower".
  const svg = renderFigureSvg(figure, "Euchre");
  const ys = [...svg.matchAll(/<text[^>]*y="([\d.]+)"[^>]*>(?:Right|bower)/g)].map(
    (m) => Number(m[1]),
  );
  assert.deepEqual(ys, [...new Set(ys)], "two lines share one baseline");
});

test("red suits are drawn red and black suits are not", () => {
  const red = renderFigureSvg(
    { kind: "meld", caption: "A red card here", rows: [{ cards: [{ face: "A♥" }] }] },
    "Test",
  );
  const black = renderFigureSvg(
    { kind: "meld", caption: "A black card here", rows: [{ cards: [{ face: "A♠" }] }] },
    "Test",
  );

  assert.notEqual(red, black);
  assert.match(red, /fill="#[0-9a-f]{6}"[^>]*>A♥|A♥/);
});

test("a counter-example reads as a counter-example without the caption", () => {
  const svg = renderFigureSvg(figure, "Euchre");

  // Its cards are dimmed and its label is set in the warning colour, so "not
  // this" is visible at a glance rather than only stated underneath.
  const dimmed = [...svg.matchAll(/<rect[^>]*opacity="0.65"/g)];
  assert.equal(dimmed.length, 1, "one card in the invalid row");

  const label = /<text[^>]*fill="(#[0-9a-f]{6})"[^>]*>Not/.exec(svg);
  assert.ok(label, "the invalid row keeps its label");

  const clean = renderFigureSvg({ ...figure, rows: [figure.rows[0]!] }, "Euchre");
  assert.ok(!clean.includes("opacity="), "a valid figure dims nothing");
  assert.notEqual(label[1], /fill="(#[0-9a-f]{6})"[^>]*>Trumps/.exec(svg)?.[1]);
});
