/**
 * Compile every game entry into a single printable PDF.
 *
 *   npm run pdf
 *   npm run pdf -- --output /tmp/rules.pdf
 *
 * Produces a bookmarked, page-numbered booklet with a contents page and one
 * game per page. Like rendered/, the PDF is generated output -- edit the JSON,
 * rebuild.
 *
 * PDFKit writes in a single pass, so the contents page cannot know its page
 * numbers while it is being written. We reserve blank pages for it up front,
 * record where each heading lands while laying out the games, then go back and
 * fill the reserved pages in at the end.
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import PDFDocument from "pdfkit";

import type { CardGame } from "@naibi/data";
import {
  SECTIONS,
  categoryLabel,
  facts,
  gamesByCategory,
  loadGames,
} from "@naibi/data";
import { RENDERED_DIR } from "./paths.ts";

const TITLE = "Naibi";
const PRONUNCIATION = "NYE-bee";
const SUBTITLE = "Original write-ups of traditional and popular card games";
const ORIGIN =
  "Naibi is the first European word for playing cards, recorded in Florence in " +
  "1377. It comes from the Arabic nā'ib, “deputy” — the rank of court card in " +
  "the Mamluk pack that every European deck descends from. Spain still calls " +
  "them naipes.";

// Core PDF fonts cannot encode card suit pips, so prefer a TrueType face that can.
const FONT_CANDIDATES = [
  {
    regular: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    bold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    italic: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
  },
  {
    regular: "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    bold: "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    italic: "/usr/share/fonts/dejavu/DejaVuSans-Oblique.ttf",
  },
  {
    regular: "/Library/Fonts/DejaVuSans.ttf",
    bold: "/Library/Fonts/DejaVuSans-Bold.ttf",
    italic: "/Library/Fonts/DejaVuSans-Oblique.ttf",
  },
];

// Used only when we fall back to a core font that cannot represent these glyphs.
const GLYPH_FALLBACKS: [string, string][] = [
  ["♠", "spades"], ["♥", "hearts"], ["♦", "diamonds"], ["♣", "clubs"],
  ["♤", "spades"], ["♡", "hearts"], ["♢", "diamonds"], ["♧", "clubs"],
  ["→", "->"], ["≤", "<="], ["≥", ">="], ["×", "x"],
];

const ACCENT = "#1f3a5f";
const MUTED = "#5b6672";
const RULE = "#c8d0d8";
const TEXT = "#111111";

const MARGINS = { top: 58, bottom: 62, left: 61, right: 61 };

// Contents-page metrics. Used both to reserve pages and to draw them, so the
// two cannot disagree.
const TOC_TITLE_HEIGHT = 46;
const TOC_LINE = { category: 27, game: 17 };

type FontSet = { regular: string; bold: string; italic: string; unicode: boolean };
type TocEntry = { level: 0 | 1; title: string; page: number };

function resolveFonts(doc: PDFKit.PDFDocument): FontSet {
  // registerFont is lazy -- it does not touch the file until the font is first
  // used -- so check the paths here rather than catching an error later.
  for (const candidate of FONT_CANDIDATES) {
    if (!existsSync(candidate.regular) || !existsSync(candidate.bold)) continue;

    doc.registerFont("body", candidate.regular);
    doc.registerFont("bold", candidate.bold);
    // Not every DejaVu install ships an oblique face; regular reads fine in the
    // one place italic is used.
    doc.registerFont(
      "italic",
      existsSync(candidate.italic) ? candidate.italic : candidate.regular,
    );
    return { regular: "body", bold: "bold", italic: "italic", unicode: true };
  }

  return {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
    italic: "Helvetica-Oblique",
    unicode: false,
  };
}

function clean(text: string, unicode: boolean): string {
  if (unicode) return text;
  let out = text;
  for (const [glyph, replacement] of GLYPH_FALLBACKS) {
    out = out.split(glyph).join(replacement);
  }
  return out;
}

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

/**
 * Split prose on blank lines. Entries use a light Markdown convention -- blank
 * lines between paragraphs and "- " for bullets -- which the Markdown output
 * gets for free but the PDF has to interpret.
 */
function blocks(text: string): Block[] {
  const out: Block[] = [];

  for (const chunk of text.split("\n\n")) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      out.push({
        kind: "list",
        items: lines.map((line) => line.replace(/^[-*]\s+/, "")),
      });
    } else {
      out.push({ kind: "paragraph", text: lines.join(" ") });
    }
  }

  return out;
}

class Booklet {
  readonly doc: PDFKit.PDFDocument;
  readonly fonts: FontSet;
  private pageIndex = -1;
  readonly toc: TocEntry[] = [];

  constructor() {
    this.doc = new PDFDocument({
      size: "LETTER",
      margins: MARGINS,
      bufferPages: true,
      autoFirstPage: false,
      info: {
        Title: TITLE,
        Author: "Naibi contributors",
        Subject: "Card game rules",
      },
    });
    this.fonts = resolveFonts(this.doc);
    this.doc.on("pageAdded", () => {
      this.pageIndex += 1;
    });
  }

  get contentWidth(): number {
    return this.doc.page.width - MARGINS.left - MARGINS.right;
  }

  get bottom(): number {
    return this.doc.page.height - MARGINS.bottom;
  }

  /** Zero-based index of the page currently being written. */
  get current(): number {
    return this.pageIndex;
  }

  text(value: string, options: PDFKit.Mixins.TextOptions = {}): void {
    this.doc.text(clean(value, this.fonts.unicode), {
      width: this.contentWidth,
      ...options,
    });
  }

  /** Start a new page if less than `needed` points remain. */
  ensureSpace(needed: number): void {
    if (this.doc.y + needed > this.bottom) this.doc.addPage();
  }

  heading(value: string): void {
    const { doc, fonts } = this;
    // Keep a heading with at least one line of its section.
    this.ensureSpace(34);
    doc.moveDown(0.6);
    doc.font(fonts.bold).fontSize(11.5).fillColor(ACCENT);
    this.text(value);
    doc.moveDown(0.25);
  }

  body(content: Block[]): void {
    const { doc, fonts } = this;
    doc.font(fonts.regular).fontSize(10).fillColor(TEXT);

    for (const block of content) {
      if (block.kind === "paragraph") {
        this.ensureSpace(24);
        doc.x = MARGINS.left;
        this.text(block.text, { align: "left", lineGap: 2.2 });
        doc.moveDown(0.45);
        continue;
      }

      const bulletX = MARGINS.left + 8;
      const itemX = MARGINS.left + 20;
      const itemWidth = this.contentWidth - 20;

      for (const item of block.items) {
        this.ensureSpace(22);
        const y = doc.y;
        doc.text("•", bulletX, y, { lineBreak: false });
        doc.text(clean(item, fonts.unicode), itemX, y, {
          width: itemWidth,
          lineGap: 2.2,
        });
        doc.moveDown(0.2);
      }
      doc.x = MARGINS.left;
      doc.moveDown(0.35);
    }
  }
}

function titlePage(book: Booklet, gameCount: number): void {
  const { doc, fonts } = book;
  doc.addPage();

  doc.y = 180;
  doc.font(fonts.bold).fontSize(30).fillColor(ACCENT);
  book.text(TITLE);
  doc.moveDown(0.15);

  doc.font(fonts.italic).fontSize(11).fillColor(MUTED);
  book.text(PRONUNCIATION);
  doc.moveDown(0.5);

  doc.font(fonts.regular).fontSize(13).fillColor(MUTED);
  book.text(SUBTITLE);
  doc.moveDown(1.2);

  book.text(
    `${gameCount} games for 1 to 8 players, playable with the decks you already own.`,
  );

  doc.y = 530;
  doc.fontSize(9.5).fillColor(MUTED);
  book.text(ORIGIN, { lineGap: 2.5 });
  doc.moveDown(0.6);
  book.text(
    "Every entry in this book was written from scratch. Game rules are facts and " +
      "belong to everyone; the words used to explain them here are the project's " +
      "own, not reproduced from any other rulebook or website.",
    { lineGap: 2.5 },
  );
  doc.moveDown(0.6);
  book.text(
    `Text licensed under CC BY-SA 4.0. Scripts licensed under MIT. ` +
      `Generated ${new Date().toISOString().slice(0, 10)}.`,
    { lineGap: 2.5 },
  );
}

/** How many pages the contents needs, given what will go on it. */
function reserveContentsPages(book: Booklet, games: CardGame[]): number[] {
  const grouped = gamesByCategory(games);
  const usable = book.doc.page.height - MARGINS.top - MARGINS.bottom;

  let height = TOC_TITLE_HEIGHT;
  let pages = 1;
  for (const [, entries] of grouped) {
    for (const step of [TOC_LINE.category, ...entries.map(() => TOC_LINE.game)]) {
      if (height + step > usable) {
        pages += 1;
        height = 0;
      }
      height += step;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < pages; i += 1) {
    book.doc.addPage();
    indices.push(book.current);
  }
  return indices;
}

function gamePage(
  book: Booklet,
  game: CardGame,
  category: string | null,
  bookmark: () => void,
): void {
  const { doc, fonts } = book;
  doc.addPage();

  // Outline items bind to whichever page is current, so they must be added at
  // the top of the entry -- not after it has been laid out across pages.
  bookmark();

  if (category) {
    doc.font(fonts.bold).fontSize(10).fillColor(MUTED);
    book.text(category.toUpperCase(), { characterSpacing: 0.8 });
    doc.moveDown(0.2);
    book.toc.push({ level: 0, title: category, page: book.current });
  }

  doc.font(fonts.bold).fontSize(21).fillColor(ACCENT);
  book.text(game.name);
  book.toc.push({ level: 1, title: game.name, page: book.current });
  doc.moveDown(0.5);

  // Facts table: fixed label column, wrapping value column.
  const labelWidth = 86;
  const valueX = MARGINS.left + labelWidth;
  const valueWidth = book.contentWidth - labelWidth;

  for (const [label, value] of facts(game)) {
    const cleaned = clean(value, book.fonts.unicode);
    doc.font(fonts.regular).fontSize(9);
    const rowHeight = doc.heightOfString(cleaned, { width: valueWidth }) + 3;
    book.ensureSpace(rowHeight);

    const y = doc.y;
    doc.font(fonts.bold).fillColor(MUTED).text(label, MARGINS.left, y, {
      width: labelWidth,
      lineBreak: false,
    });
    doc.font(fonts.regular).fillColor(TEXT).text(cleaned, valueX, y, {
      width: valueWidth,
    });
    doc.y = y + rowHeight;
  }

  doc.moveDown(0.3);
  doc
    .moveTo(MARGINS.left, doc.y)
    .lineTo(MARGINS.left + book.contentWidth, doc.y)
    .strokeColor(RULE)
    .lineWidth(0.5)
    .stroke();
  doc.x = MARGINS.left;
  doc.moveDown(0.5);

  for (const { key, heading } of SECTIONS) {
    book.heading(heading);
    book.body(blocks(game[key]));
  }

  book.heading("Variants");
  doc.fontSize(10).fillColor(TEXT);
  for (const variant of game.variants) {
    book.ensureSpace(28);
    doc.font(fonts.bold);
    doc.text(clean(variant.name, book.fonts.unicode), MARGINS.left, doc.y, {
      width: book.contentWidth,
      continued: true,
    });
    doc.font(fonts.regular);
    doc.text(
      ` — ${clean(variant.description, book.fonts.unicode).replace(/\n/g, " ")}`,
      { width: book.contentWidth, lineGap: 2.2 },
    );
    doc.moveDown(0.4);
  }

  doc.moveDown(0.4);
  book.ensureSpace(26);
  doc.font(fonts.italic).fontSize(8.5).fillColor(MUTED);
  book.text(
    `Rules verified against: ${game.sources_consulted.join(", ")}. ` +
      `Original text; not reproduced from those sources.`,
    { lineGap: 1.5 },
  );
}

function drawContents(book: Booklet, pages: number[]): void {
  const { doc, fonts } = book;
  let slot = 0;
  const first = pages[0];
  if (first === undefined) return;

  doc.switchToPage(first);
  doc.x = MARGINS.left;
  doc.y = MARGINS.top;
  doc.font(fonts.bold).fontSize(21).fillColor(ACCENT);
  doc.text("Contents", MARGINS.left, doc.y, { width: book.contentWidth });
  doc.y = MARGINS.top + TOC_TITLE_HEIGHT;

  const right = MARGINS.left + book.contentWidth;

  for (const entry of book.toc) {
    const step = entry.level === 0 ? TOC_LINE.category : TOC_LINE.game;

    if (doc.y + step > book.bottom) {
      slot += 1;
      const next = pages[slot];
      if (next === undefined) break; // Should not happen; reservation matches this loop.
      doc.switchToPage(next);
      doc.x = MARGINS.left;
      doc.y = MARGINS.top;
    }

    const label = clean(entry.title, book.fonts.unicode);
    // Displayed page numbers are 1-based and count the title page as page 1.
    const number = String(entry.page + 1);
    const y = doc.y + (entry.level === 0 ? 10 : 0);
    const indent = entry.level === 0 ? 0 : 14;

    doc
      .font(entry.level === 0 ? fonts.bold : fonts.regular)
      .fontSize(entry.level === 0 ? 10.5 : 10)
      .fillColor(entry.level === 0 ? MUTED : TEXT);

    const text = entry.level === 0 ? label.toUpperCase() : label;
    doc.text(text, MARGINS.left + indent, y, { lineBreak: false });

    const numberWidth = doc.widthOfString(number);
    doc.text(number, right - numberWidth, y, { lineBreak: false });

    if (entry.level === 1) {
      const textEnd = MARGINS.left + indent + doc.widthOfString(text) + 6;
      const dotsEnd = right - numberWidth - 6;
      if (dotsEnd > textEnd) {
        doc
          .moveTo(textEnd, y + 7)
          .lineTo(dotsEnd, y + 7)
          .dash(1, { space: 3 })
          .strokeColor(RULE)
          .lineWidth(0.75)
          .stroke()
          .undash();
      }
    }

    doc.y = y + step - (entry.level === 0 ? 10 : 0);
  }
}

function drawFooters(book: Booklet): void {
  const { doc, fonts } = book;
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i += 1) {
    if (i === 0) continue; // No furniture on the title page.
    doc.switchToPage(i);

    // Writing below the bottom margin would otherwise spill onto a new page.
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = book.bottom + 16;
    doc
      .moveTo(MARGINS.left, y)
      .lineTo(MARGINS.left + book.contentWidth, y)
      .strokeColor(RULE)
      .lineWidth(0.5)
      .stroke();

    doc.font(fonts.regular).fontSize(8).fillColor(MUTED);
    doc.text(TITLE, MARGINS.left, y + 6, { lineBreak: false });
    const label = String(i + 1);
    doc.text(label, MARGINS.left + book.contentWidth - doc.widthOfString(label), y + 6, {
      lineBreak: false,
    });

    doc.page.margins.bottom = saved;
  }
}

function outputPath(): string {
  const index = process.argv.indexOf("--output");
  const supplied = index !== -1 ? process.argv[index + 1] : undefined;
  return supplied ?? join(RENDERED_DIR, "naibi.pdf");
}

const games = loadGames();
if (games.length === 0) {
  console.error("No games found. Nothing to build.");
  process.exit(1);
}

const output = outputPath();
mkdirSync(dirname(output), { recursive: true });

const book = new Booklet();
const stream = createWriteStream(output);
book.doc.pipe(stream);

titlePage(book, games.length);
const contentsPages = reserveContentsPages(book, games);

const outline = book.doc.outline;
for (const [category, entries] of gamesByCategory(games)) {
  const label = categoryLabel(category);
  let parent: PDFKit.PDFOutline | undefined;

  entries.forEach((game, index) => {
    gamePage(book, game, index === 0 ? label : null, () => {
      if (index === 0) parent = outline.addItem(label);
      (parent ?? outline).addItem(game.name);
    });
  });
}

drawContents(book, contentsPages);
drawFooters(book);

book.doc.end();
await new Promise<void>((resolve, reject) => {
  stream.on("finish", () => resolve());
  stream.on("error", reject);
});

const sizeKb = statSync(output).size / 1024;
console.log(`Wrote ${output} (${games.length} games, ${sizeKb.toFixed(0)} KB)`);
if (!book.fonts.unicode) {
  console.log("Note: fell back to a core PDF font; suit symbols were spelled out.");
}
