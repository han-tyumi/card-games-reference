/**
 * Draw a setup diagram as SVG, from the geometry in the data package.
 *
 * The PDF draws the same diagram with PDFKit primitives. Both read from
 * buildDiagram(), so they cannot disagree about where anything goes.
 */

import { CARD, buildDiagram, type Diagram, type Layout, type ZoneKind } from "naibi";

const PAD = 8;
const RADIUS = 3;

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
const FACE_DOWN = "#c3ccd6";
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
/** Rough advance width per character for the caption font, used to wrap. */
const CHAR_WIDTH = CAPTION_SIZE * 0.52;
/** Narrow diagrams still get a readable caption column rather than one word per line. */
const MIN_CAPTION_WIDTH = 260;

/** SVG text does not wrap, so break the caption to fit before drawing it. */
function wrapCaption(caption: string, width: number): string[] {
  const maxChars = Math.max(12, Math.floor(width / CHAR_WIDTH));
  const lines: string[] = [];
  let line = "";

  for (const word of caption.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderDiagramSvg(layout: Layout, title: string): string {
  const diagram: Diagram = buildDiagram(layout);

  // A long caption under a narrow diagram would otherwise spill outside the
  // viewBox and be cropped, so the canvas widens to hold it.
  const captionWidth = diagram.caption
    ? Math.max(diagram.width, MIN_CAPTION_WIDTH)
    : diagram.width;
  const captionLines = diagram.caption
    ? wrapCaption(diagram.caption, captionWidth)
    : [];
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
      `width="${width}" height="${height}" role="img" ` +
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
          `stroke-dasharray="4 3" opacity="0.55"/>`,
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
        parts.push(
          `<text x="${(last.x + PAD + shift + CARD.width / 2).toFixed(1)}" ` +
            `y="${(last.y + PAD + CARD.height / 2 + 4).toFixed(1)}" ` +
            `text-anchor="middle" font-family="system-ui, sans-serif" ` +
            `font-size="11" fill="${TEXT}">${pile.count}</text>`,
        );
      }
    }
  }

  for (const label of diagram.labels) {
    parts.push(
      `<text x="${(label.x + PAD + shift + label.width / 2).toFixed(1)}" ` +
        `y="${(label.y + PAD).toFixed(1)}" text-anchor="middle" ` +
        `font-family="system-ui, sans-serif" font-size="8" fill="${TEXT}">` +
        `${escapeXml(label.text)}</text>`,
    );
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
