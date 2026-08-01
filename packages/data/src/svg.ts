/**
 * Draw a setup diagram as SVG, from the geometry alongside it.
 *
 * The PDF draws the same diagram with PDFKit primitives. Both read from
 * buildDiagram(), so they cannot disagree about where anything goes.
 *
 * This sits in the data package rather than the build one because the site
 * needs it too, and a second copy is a second thing to keep in step -- the
 * mistake the prose parser already made once.
 */

import { CARD, buildDiagram, type Diagram, type Layout, type ZoneKind } from "./layout.ts";
import { buildFigure, isRedSuit, type Figure } from "./figure.ts";

const PAD = 8;
const RADIUS = 3;
/**
 * Rendered size relative to the coordinate space. The viewBox keeps the
 * geometry in abstract units; this decides how big it actually appears, and at
 * 1:1 the diagrams read as postage stamps in a Markdown page.
 */
const DISPLAY_SCALE = 1.6;

/**
 * Face-down cards get a tint so a diagram reads at a glance: what you can see
 * versus what is hidden is the thing a setup picture most needs to convey.
 */
const FILL: Record<ZoneKind, string> = {
  tableau: "#ffffff",
  foundation: "#eef4fb",
  stock: "#dfe6ee",
  waste: "#ffffff",
  reserve: "#f4f0e6",
  "free-cell": "#f2f7f2",
  hand: "#ffffff",
  discard: "#ffffff",
  meld: "#eef4fb",
  trick: "#ffffff",
  gap: "none",
};

const STROKE = "#5b6672";
/**
 * A face-down card's tint, and the ink for anything written on one.
 *
 * Which cards are hidden is the thing a setup picture most needs to convey, and
 * the tint is the only thing conveying it -- so it has to clear SC 1.4.11's 3:1
 * against the face-up white beside it. The old #c3ccd6 managed 1.62:1.
 *
 * Darkening it alone makes things worse, not better: the pile-depth count is
 * written *on* this fill, and in the ordinary ink it was already failing at
 * 3.60:1. Two levers, not one. At #7e8b9a the tint reads 3.47:1 against a
 * face-up card and the count, in near-black, reads 4.71:1 on top of it.
 */
const FACE_DOWN = "#7e8b9a";
const FACE_DOWN_INK = "#1b2027";
const TEXT = "#5b6672";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CAPTION_SIZE = 9;
const CAPTION_LINE = 12;
const LABEL_SIZE = 8;
const LABEL_LINE = 9;
/** Rough advance width per character, as a fraction of font size. */
const CHAR_RATIO = 0.52;
/** Narrow diagrams still get a readable caption column rather than one word per line. */
const MIN_CAPTION_WIDTH = 260;

/**
 * SVG text does not wrap, so break it to fit before drawing.
 *
 * `maxLines` caps the result; anything that still will not fit is left on the
 * last line, since a clipped word is worse than a slightly wide one.
 */
export function wrapText(
  text: string,
  width: number,
  fontSize: number,
  maxLines = Infinity,
): string[] {
  const maxChars = Math.max(6, Math.floor(width / (fontSize * CHAR_RATIO)));
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      if (lines.length + 1 >= maxLines) {
        line = candidate;
        continue;
      }
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Where the caption goes.
 *
 * Drawn inside the image for Markdown and the PDF, which have nowhere else to
 * put it. The site has `<figcaption>`, which sets it in the page's own type at
 * the page's own size -- a caption baked into an image shrinks along with the
 * image, and a phone shrinks these a long way. Off by default there, and the
 * canvas stops reserving width it no longer needs.
 */
export type SvgOptions = { caption?: boolean };

export function renderDiagramSvg(
  layout: Layout,
  title: string,
  { caption = true }: SvgOptions = {},
): string {
  const diagram: Diagram = buildDiagram(layout);
  const text = caption ? diagram.caption : undefined;

  // A long caption under a narrow diagram would otherwise spill outside the
  // viewBox and be cropped, so the canvas widens to hold it.
  const captionWidth = text
    ? Math.max(diagram.width, MIN_CAPTION_WIDTH)
    : diagram.width;
  const captionLines = text ? wrapText(text, captionWidth, CAPTION_SIZE) : [];
  const captionHeight =
    captionLines.length > 0 ? captionLines.length * CAPTION_LINE + 6 : 0;

  const content = Math.max(diagram.width, captionWidth);
  const width = content + PAD * 2;
  const height = diagram.height + PAD * 2 + captionHeight;
  // Centre a diagram that is narrower than its caption.
  const shift = (content - diagram.width) / 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
      `width="${(width * DISPLAY_SCALE).toFixed(0)}" ` +
      `height="${(height * DISPLAY_SCALE).toFixed(0)}" role="img" ` +
      `aria-label="${escapeXml(title)} setup diagram">`,
  );
  parts.push(`<title>${escapeXml(title)} setup</title>`);

  for (const pile of diagram.piles) {
    if (pile.empty) {
      // An empty slot is a place a card will go: dashed outline, no card drawn.
      parts.push(
        `<rect x="${(pile.x + PAD + shift).toFixed(1)}" y="${(pile.y + PAD).toFixed(1)}" ` +
          `width="${CARD.width}" height="${CARD.height}" rx="${RADIUS}" ` +
          `fill="none" stroke="${STROKE}" stroke-width="1" ` +
          // The dashes are the whole of what says "a card goes here", so they
          // carry SC 1.4.11's 3:1 on their own. At 0.55 they were at 2.28:1;
          // the dash pattern already reads as provisional without the fading.
          `stroke-dasharray="4 3" opacity="0.8"/>`,
      );
      continue;
    }

    for (const card of pile.cards) {
      const fill = card.faceUp ? FILL[pile.kind] : FACE_DOWN;
      parts.push(
        `<rect x="${(card.x + PAD + shift).toFixed(1)}" y="${(card.y + PAD).toFixed(1)}" ` +
          `width="${card.width}" height="${card.height}" rx="${RADIUS}" ` +
          `fill="${fill}" stroke="${STROKE}" stroke-width="1"/>`,
      );
    }

    // Show the depth of a pile that is deeper than the cards drawn.
    if (pile.count !== undefined && pile.count > pile.cards.length) {
      const last = pile.cards[pile.cards.length - 1];
      if (last) {
        // Written on whichever fill the top card has, so it takes its ink from
        // that rather than always assuming the pale one.
        const ink = last.faceUp ? TEXT : FACE_DOWN_INK;
        parts.push(
          `<text x="${(last.x + PAD + shift + CARD.width / 2).toFixed(1)}" ` +
            `y="${(last.y + PAD + CARD.height / 2 + 4).toFixed(1)}" ` +
            `text-anchor="middle" font-family="system-ui, sans-serif" ` +
            `font-size="11" fill="${ink}">${pile.count}</text>`,
        );
      }
    }
  }

  for (const label of diagram.labels) {
    // A label wider than the pile it sits under would run into its neighbour,
    // so break it rather than let two captions collide.
    const lines = wrapText(label.text, label.width, LABEL_SIZE, 2);
    lines.forEach((line, index) => {
      parts.push(
        `<text x="${(label.x + PAD + shift + label.width / 2).toFixed(1)}" ` +
          `y="${(label.y + PAD + index * LABEL_LINE).toFixed(1)}" ` +
          `text-anchor="middle" font-family="system-ui, sans-serif" ` +
          `font-size="${LABEL_SIZE}" fill="${TEXT}">${escapeXml(line)}</text>`,
      );
    });
  }

  captionLines.forEach((line, index) => {
    const y = diagram.height + PAD + 14 + index * CAPTION_LINE;
    parts.push(
      `<text x="${(width / 2).toFixed(1)}" y="${y.toFixed(1)}" ` +
        `text-anchor="middle" font-family="system-ui, sans-serif" ` +
        `font-size="${CAPTION_SIZE}" fill="${TEXT}">${escapeXml(line)}</text>`,
    );
  });

  parts.push("</svg>");
  return parts.join("\n");
}

/**
 * Least a drawing may be scaled down before it stops being readable.
 *
 * Labels go first. They are drawn at LABEL_SIZE and a renderer shows that at
 * DISPLAY_SCALE, so a pile caption starts life about 13px tall; below roughly
 * 9px "Foundations" is a grey smudge. A page with less room than this should
 * scroll a drawing rather than shrink it further -- which is the one thing a
 * stylesheet can decide, since it is the only part of a drawing's size that is
 * still open once the thing has been written.
 */
export const MIN_LEGIBLE_SCALE = 9 / (LABEL_SIZE * DISPLAY_SCALE);

/** The width a drawing asked to be shown at, in px. */
export function naturalWidth(svg: string): number {
  return Number(/\bwidth="(\d+)"/.exec(svg)?.[1] ?? 0);
}

const RED = "#a4243b";
const FACE_SIZE = 12;

/**
 * The ink a card drawing is made of, shared with the PDF.
 *
 * The booklet draws the same pictures with PDFKit primitives and had these
 * values written out a second time, so a contrast fix here would have left the
 * booklet failing and nothing would have said so. Same reason the geometry is
 * shared: two copies of a number are two things that can drift.
 *
 * Every pairing is measured in packages/data/test/contrast.test.ts against
 * WCAG 2.2 SC 1.4.3 and 1.4.11, so changing one of these without checking it
 * fails the build rather than the reader.
 */
export const INK = {
  stroke: STROKE,
  text: TEXT,
  red: RED,
  faceDown: FACE_DOWN,
  /** For anything written on a face-down card, which is a dark fill. */
  faceDownInk: FACE_DOWN_INK,
  faceUp: "#ffffff",
  /** The page these are drawn on, which most of the labels sit against. */
  page: "#fbfaf8",
  /** Opacity for an empty slot's dashes and, formerly, a struck card. */
  provisional: 0.8,
} as const;

/** Draw a ranking strip or a combination example. */
export function renderFigureSvg(
  figure: Figure,
  title: string,
  { caption = true }: SvgOptions = {},
): string {
  const built = buildFigure(figure);
  const captionLines = caption
    ? wrapText(figure.caption, Math.max(built.width, MIN_CAPTION_WIDTH), CAPTION_SIZE)
    : [];
  const captionHeight =
    captionLines.length > 0 ? captionLines.length * CAPTION_LINE + 6 : 0;

  const content = caption ? Math.max(built.width, MIN_CAPTION_WIDTH) : built.width;
  const width = content + PAD * 2;
  const height = built.height + PAD * 2 + captionHeight;
  const shift = (content - built.width) / 2;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
      `width="${(width * DISPLAY_SCALE).toFixed(0)}" ` +
      `height="${(height * DISPLAY_SCALE).toFixed(0)}" role="img" ` +
      `aria-label="${escapeXml(title)}: ${escapeXml(figure.caption)}">`,
    `<title>${escapeXml(figure.caption)}</title>`,
  ];

  for (const card of built.cards) {
    const x = card.x + PAD + shift;
    const y = card.y + PAD;
    const ink = isRedSuit(card.face) ? RED : STROKE;

    parts.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${card.width}" ` +
        `height="${card.height}" rx="${RADIUS}" fill="#ffffff" ` +
        // A counter-example was dimmed to 0.65, which took the card's own
        // outline down to 2.73:1 -- it made the "not this" cue out of the same
        // contrast the card needs to be seen at all. A dashed outline says the
        // same thing by shape, at full strength, and survives forced-colors
        // mode where an opacity does not. The red row label is the second
        // channel, so it is not carried by colour alone either.
        `stroke="${STROKE}" stroke-width="1"` +
          `${card.struck ? ' stroke-dasharray="3 2"' : ""}/>`,
      `<text x="${(x + card.width / 2).toFixed(1)}" ` +
        `y="${(y + card.height / 2 + FACE_SIZE / 3).toFixed(1)}" ` +
        `text-anchor="middle" font-family="system-ui, sans-serif" ` +
        `font-size="${FACE_SIZE}" fill="${ink}">${escapeXml(card.face)}</text>`,
    );

    if (card.note) {
      wrapText(card.note, CARD.width + 14, LABEL_SIZE, 2).forEach((line, i) => {
        parts.push(
          `<text x="${(x + card.width / 2).toFixed(1)}" ` +
            `y="${(y + card.height + 8 + i * LABEL_LINE).toFixed(1)}" ` +
            `text-anchor="middle" font-family="system-ui, sans-serif" ` +
            `font-size="${LABEL_SIZE}" fill="${TEXT}">${escapeXml(line)}</text>`,
        );
      });
    }
  }

  // A struck row reads as "not this" at a glance, without needing the caption.
  // The label sits above its row and starts where the cards start, so the eye
  // reads the heading and then the hand under it.
  for (const row of built.rowLabels) {
    const lines = wrapText(row.text, row.width, LABEL_SIZE + 1, 2);
    lines.forEach((line, i) => {
      parts.push(
        `<text x="${(row.x + PAD + shift).toFixed(1)}" ` +
          `y="${(row.y + PAD + i * LABEL_LINE).toFixed(1)}" ` +
          `font-family="system-ui, sans-serif" ` +
          `font-size="${LABEL_SIZE + 1}" fill="${row.struck ? RED : TEXT}">` +
          `${escapeXml(line)}</text>`,
      );
    });
  }

  captionLines.forEach((line, index) => {
    parts.push(
      `<text x="${(width / 2).toFixed(1)}" ` +
        `y="${(built.height + PAD + 14 + index * CAPTION_LINE).toFixed(1)}" ` +
        `text-anchor="middle" font-family="system-ui, sans-serif" ` +
        `font-size="${CAPTION_SIZE}" fill="${TEXT}">${escapeXml(line)}</text>`,
    );
  });

  parts.push("</svg>");
  return parts.join("\n");
}
