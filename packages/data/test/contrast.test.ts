/**
 * Colour contrast in the drawings, against WCAG 2.2.
 *
 * These numbers were all wrong at once and nothing said so: the face-down tint
 * sat at 1.62:1 against a face-up card when the tint is the only thing saying a
 * card is hidden, and the pile-depth count written on that tint was at 3.60:1.
 * The obvious fix — darken the tint — makes the second one worse, which is the
 * trap: it takes two levers, and only arithmetic catches that.
 *
 * So the ratios are computed here rather than described in a comment. Changing
 * an ink without checking it fails the build instead of the reader.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { INK, loadGames, renderDiagramSvg, renderFigureSvg } from "naibi";

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** What a colour actually becomes when drawn at `alpha` over a backdrop. */
function flatten(fg: string, bg: string, alpha: number): string {
  const mix = (i: number) => {
    const f = parseInt(fg.slice(i, i + 2), 16);
    const b = parseInt(bg.slice(i, i + 2), 16);
    return Math.round(f * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

// Every drawn glyph is well under 24px, so none of it is "large text" and all
// of it owes the full 4.5:1.
const TEXT_MIN = 4.5;
const GRAPHIC_MIN = 3;

test("every word drawn in a figure clears SC 1.4.3", () => {
  const pairs: [string, string, string][] = [
    ["pile-depth count on a face-down pile", INK.faceDownInk, INK.faceDown],
    ["pile-depth count on a face-up pile", INK.text, INK.faceUp],
    ["card face, black suit", INK.stroke, INK.faceUp],
    ["card face, red suit", INK.red, INK.faceUp],
    ["pile label, note and caption", INK.text, INK.page],
    ["the label of a counter-example row", INK.red, INK.page],
  ];

  const failing = pairs
    .map(([what, fg, bg]) => [what, contrast(fg, bg)] as const)
    .filter(([, ratio]) => ratio < TEXT_MIN)
    .map(([what, ratio]) => `${what}: ${ratio.toFixed(2)}:1`);

  assert.deepEqual(failing, [], `these need ${TEXT_MIN}:1`);
});

test("a hidden card is visibly hidden, per SC 1.4.11", () => {
  // The tint is the whole of what distinguishes a face-down card from a
  // face-up one, and which cards are hidden is the point of a setup diagram.
  const ratio = contrast(INK.faceDown, INK.faceUp);
  assert.ok(
    ratio >= GRAPHIC_MIN,
    `face-down against face-up is ${ratio.toFixed(2)}:1, needs ${GRAPHIC_MIN}`,
  );
});

test("darkening the face-down tint did not strand the text on it", () => {
  // The failure mode this file exists for. Both constraints pull on the same
  // colour in opposite directions, so assert them together: a change that fixes
  // one by breaking the other should not pass.
  assert.ok(contrast(INK.faceDown, INK.faceUp) >= GRAPHIC_MIN);
  assert.ok(contrast(INK.faceDownInk, INK.faceDown) >= TEXT_MIN);
});

test("an empty slot's dashes are visible enough to read as a slot", () => {
  const ratio = contrast(flatten(INK.stroke, INK.page, INK.provisional), INK.page);
  assert.ok(
    ratio >= GRAPHIC_MIN,
    `dashes at opacity ${INK.provisional} are ${ratio.toFixed(2)}:1`,
  );
});

test("a card outline is visible whether or not the row is a counter-example", () => {
  // A struck card used to be drawn at opacity 0.65, which took its own outline
  // to 2.73:1 — it built the "not this" cue out of the same contrast the card
  // needs in order to be seen at all. It is a dash pattern now, at full
  // strength, so both rows clear the bar identically.
  const ratio = contrast(INK.stroke, INK.page);
  assert.ok(ratio >= GRAPHIC_MIN, `card outline is ${ratio.toFixed(2)}:1`);

  const figure = {
    kind: "meld",
    caption: "A counter-example",
    rows: [
      { label: "Valid", cards: [{ face: "5♠" }] },
      { label: "Not a run", valid: false, cards: [{ face: "K♠" }] },
    ],
  };
  const svg = renderFigureSvg(figure as never, "Test", { caption: false });
  assert.ok(!/opacity="0\.[0-6]/.test(svg), "a card is still being faded out");
  assert.match(svg, /stroke-dasharray/, "the counter-example lost its shape cue");
});

test("a counter-example is not marked by colour alone, per SC 1.4.1", () => {
  const figure = {
    kind: "meld",
    caption: "A counter-example",
    rows: [
      { label: "Valid", cards: [{ face: "5♠" }] },
      { label: "Not a run", valid: false, cards: [{ face: "K♠" }] },
    ],
  };
  const svg = renderFigureSvg(figure as never, "Test", { caption: false });

  // Two channels: the dashed outline is a shape, the red label is a colour.
  // Strip the colour and the dashes still say which row is which.
  const withoutColour = svg.replace(new RegExp(INK.red, "g"), INK.text);
  assert.match(withoutColour, /stroke-dasharray/);
});

test("the booklet and the site are drawn with the same ink", () => {
  // The PDF had these hexes written out a second time, so a contrast fix here
  // would have left the booklet failing with nothing to say so.
  const pdf = new URL("../../build/build-pdf.ts", import.meta.url);
  const source = readFileSync(pdf, "utf8");

  const literals = [...source.matchAll(/#[0-9a-f]{6}/g)].map((m) => m[0]);
  for (const shared of [INK.faceDown, INK.faceDownInk]) {
    assert.ok(
      !literals.includes(shared),
      `${shared} is written out in build-pdf.ts instead of taken from INK`,
    );
  }
});

test("nothing in the corpus draws a colour the audit has not seen", () => {
  // The pairings above are only worth anything if they cover what is actually
  // drawn. A new fill added to the palette without a row here would otherwise
  // go unchecked.
  const known = new Set<string>([
    ...Object.values(INK).filter((v) => typeof v === "string"),
    // Zone tints. They sit under a card outline that carries the shape, so they
    // are reinforcement rather than the sole carrier of anything, and 1.4.11
    // does not reach them — but they still have to be listed to be dismissed.
    "#eef4fb", "#dfe6ee", "#f4f0e6", "#f2f7f2", "#ffffff",
  ]);

  const seen = new Set<string>();
  for (const game of loadGames()) {
    const drawings = [
      ...(game.layout ? [renderDiagramSvg(game.layout, game.name)] : []),
      ...(game.figures ?? []).map((f) => renderFigureSvg(f, game.name)),
    ];
    for (const svg of drawings) {
      for (const [, colour] of svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)) {
        seen.add(colour!);
      }
    }
  }

  assert.deepEqual(
    [...seen].filter((c) => !known.has(c)),
    [],
    "these colours are drawn but not covered by the contrast audit",
  );
});
