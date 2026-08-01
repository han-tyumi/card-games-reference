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
import { pathToFileURL } from "node:url";

import PDFDocument from "pdfkit";

import type { Block, CardGame } from "naibi";
import {
  CARD,
  SECTIONS,
  blocks,
  buildDiagram,
  buildFigure,
  isRedSuit,
  categoryLabel,
  facts,
  gamesByCategory,
  loadGames,
} from "naibi";
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

// Left/right margins are set by READABILITY, not by fitting the most words on
// the page: they give a measure of roughly 70 characters, near the 66 that
// centuries of book typography converged on. A wider column costs the reader
// their place on every return sweep.
const MARGINS = { top: 58, bottom: 62, left: 95, right: 95 };

// Contents-page metrics. Used both to reserve pages and to draw them, so the
// two cannot disagree.
/** Cap on growing a figure past its natural size, so cards stay card-shaped. */
const MAX_ENLARGE = 1.35;

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
    doc.font(fonts.bold).fontSize(12.5).fillColor(ACCENT);
    this.text(value);
    doc.moveDown(0.25);
  }

  body(content: Block[]): void {
    const { doc, fonts } = this;
    doc.font(fonts.regular).fontSize(11).fillColor(TEXT);

    for (const block of content) {
      if (block.kind === "paragraph") {
        this.ensureSpace(24);
        doc.x = MARGINS.left;
        this.text(block.text, { align: "left", lineGap: 2.6 });
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
          lineGap: 2.6,
        });
        doc.moveDown(0.2);
      }
      doc.x = MARGINS.left;
      doc.moveDown(0.35);
    }
  }
}

/**
 * Decide how to place a block that would overrun the page.
 *
 * Returns the scale to draw at, having started a new page if the block cannot
 * reasonably be squeezed in. Shrinking slightly beats leaving a third of a page
 * blank; shrinking a lot does not, so there is a floor.
 */
function fitOrBreak(book: Booklet, naturalHeight: number, scale: number): number {
  const available = book.bottom - book.doc.y - 12;
  if (naturalHeight <= available) return scale;

  const MIN_SHRINK = 0.72;
  if (available > 90 && available / naturalHeight >= MIN_SHRINK) {
    return scale * (available / naturalHeight);
  }

  book.doc.addPage();
  return scale;
}

/**
 * Draw the setup diagram with PDFKit primitives.
 *
 * PDFKit cannot consume SVG, so this is a second renderer -- but it reads the
 * same buildDiagram() geometry the SVG does, so the two pictures agree.
 */
function drawDiagram(book: Booklet, layout: NonNullable<CardGame["layout"]>): void {
  const { doc, fonts } = book;
  const diagram = buildDiagram(layout);

  // Fit the measure, and allow modest enlargement: at natural size a small
  // diagram reads as incidental rather than as something to study.
  const widthScale = Math.min(MAX_ENLARGE, book.contentWidth / diagram.width);
  const captionHeight = diagram.caption ? 14 : 0;
  const naturalHeight = diagram.height * widthScale + captionHeight;

  // Rather than always bumping a too-tall diagram to the next page -- which can
  // strand half a page of white -- shrink it to fit when there is a sensible
  // amount of room left, and only break when there genuinely is not.
  const scale = fitOrBreak(book, naturalHeight, widthScale);
  const width = diagram.width * scale;
  const height = diagram.height * scale + captionHeight;

  const originX = MARGINS.left + (book.contentWidth - width) / 2;
  const originY = doc.y + 4;
  const at = (x: number, y: number): [number, number] => [
    originX + x * scale,
    originY + y * scale,
  ];

  for (const pile of diagram.piles) {
    if (pile.empty) {
      const [x, y] = at(pile.x, pile.y);
      doc
        .roundedRect(x, y, CARD.width * scale, CARD.height * scale, 2)
        .dash(3, { space: 2 })
        .strokeColor(RULE)
        .lineWidth(0.7)
        .stroke()
        .undash();
      continue;
    }

    for (const card of pile.cards) {
      const [x, y] = at(card.x, card.y);
      doc
        .roundedRect(x, y, card.width * scale, card.height * scale, 2)
        .fillColor(card.faceUp ? "#ffffff" : "#c3ccd6")
        .fillAndStroke(card.faceUp ? "#ffffff" : "#c3ccd6", MUTED);
    }

    if (pile.count !== undefined && pile.count > pile.cards.length) {
      const last = pile.cards[pile.cards.length - 1];
      if (last) {
        const [x, y] = at(last.x, last.y + CARD.height / 2 - 3);
        doc
          .font(fonts.regular)
          .fontSize(7 * scale + 2)
          .fillColor(MUTED)
          .text(String(pile.count), x, y, {
            width: CARD.width * scale,
            align: "center",
            lineBreak: false,
          });
      }
    }
  }

  doc.font(fonts.regular).fontSize(6.5).fillColor(MUTED);
  for (const label of diagram.labels) {
    // Give the caption more room than the card it sits under, centred on it, so
    // a word like "Opponent" wraps between words instead of mid-word.
    const bleed = 18;
    const [x, y] = at(label.x, label.y - 6);
    doc.text(label.text, x - bleed / 2, y, {
      width: label.width * scale + bleed,
      align: "center",
    });
  }

  if (diagram.caption) {
    doc.fontSize(7).fillColor(MUTED);
    doc.text(
      clean(diagram.caption, book.fonts.unicode),
      MARGINS.left,
      originY + diagram.height * scale + 4,
      { width: book.contentWidth, align: "center" },
    );
  }

  doc.x = MARGINS.left;
  doc.y = originY + height + 8;
}

const RED = "#a4243b";

/** Draw a ranking strip or combination example, mirroring the SVG figure. */
function drawFigure(book: Booklet, figure: NonNullable<CardGame["figures"]>[number]): void {
  const { doc, fonts } = book;
  const built = buildFigure(figure);
  const widthScale = Math.min(MAX_ENLARGE, book.contentWidth / Math.max(built.width, 1));
  const scale = fitOrBreak(book, built.height * widthScale + 26, widthScale);

  const originX = MARGINS.left + (book.contentWidth - built.width * scale) / 2;
  const originY = doc.y + 4;

  for (const card of built.cards) {
    const x = originX + card.x * scale;
    const y = originY + card.y * scale;
    doc
      .roundedRect(x, y, card.width * scale, card.height * scale, 2)
      .fillAndStroke("#ffffff", MUTED);

    doc
      .font(fonts.bold)
      .fontSize(9 * scale + 1)
      .fillColor(isRedSuit(card.face) ? RED : TEXT)
      .text(clean(card.face, book.fonts.unicode), x, y + card.height * scale / 2 - 5, {
        width: card.width * scale,
        align: "center",
        lineBreak: false,
      });

    if (card.note) {
      doc
        .font(fonts.regular)
        .fontSize(5.5)
        .fillColor(MUTED)
        .text(card.note, x - 7, y + card.height * scale + 2, {
          width: card.width * scale + 14,
          align: "center",
        });
    }
  }

  doc.font(fonts.regular).fontSize(6.5);
  for (const row of built.rowLabels) {
    doc
      .fillColor(row.struck ? RED : MUTED)
      .text(row.text, originX, originY + row.y * scale - 8, {
        width: row.width * scale,
        align: "right",
      });
  }

  doc.font(fonts.regular).fontSize(7).fillColor(MUTED);
  doc.text(
    clean(figure.caption, book.fonts.unicode),
    MARGINS.left,
    originY + built.height * scale + 4,
    { width: book.contentWidth, align: "center" },
  );

  doc.x = MARGINS.left;
  doc.moveDown(0.5);
}

/** A compact reference table: deal sizes, or point values. */
function drawTable(book: Booklet, header: string[], rows: string[][]): void {
  const { doc, fonts } = book;
  const columns = header.length;
  // First column carries the label and gets the room; the rest split what's left.
  const firstWidth = book.contentWidth * (columns === 2 ? 0.55 : 0.4);
  const restWidth = (book.contentWidth - firstWidth) / (columns - 1);
  const widthOf = (i: number) => (i === 0 ? firstWidth : restWidth);
  const xOf = (i: number) =>
    MARGINS.left + (i === 0 ? 0 : firstWidth + (i - 1) * restWidth);

  const write = (cells: string[], bold: boolean): void => {
    const height =
      Math.max(
        ...cells.map((cell, i) =>
          doc
            .font(bold ? fonts.bold : fonts.regular)
            .fontSize(9)
            .heightOfString(clean(cell, book.fonts.unicode), { width: widthOf(i) - 6 }),
        ),
      ) + 4;

    book.ensureSpace(height + 4);
    const y = doc.y;
    cells.forEach((cell, i) => {
      doc
        .font(bold ? fonts.bold : fonts.regular)
        .fontSize(9)
        .fillColor(bold ? ACCENT : TEXT)
        .text(clean(cell, book.fonts.unicode), xOf(i), y, { width: widthOf(i) - 6 });
    });
    doc.y = y + height;
    doc
      .moveTo(MARGINS.left, doc.y - 2)
      .lineTo(MARGINS.left + book.contentWidth, doc.y - 2)
      .strokeColor(RULE)
      .lineWidth(0.4)
      .stroke();
    doc.x = MARGINS.left;
  };

  doc.moveDown(0.3);
  write(header, true);
  for (const row of rows) write(row, false);
  doc.moveDown(0.4);
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
    doc.font(fonts.regular).fontSize(9.5);
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

    if (key === "setup") {
      if (game.layout) drawDiagram(book, game.layout);
      if (game.deal) {
        const hasRemoved = game.deal.some((r) => r.removed);
        const header = ["Players", "Each player gets"];
        if (hasRemoved) header.push("Removed");
        drawTable(
          book,
          header,
          game.deal.map((r) => {
            const cells = [
              String(r.players),
              r.hand === 0 ? "whole deck, shared out" : `${r.hand} cards`,
            ];
            if (hasRemoved) cells.push(r.removed ?? "\u2014");
            return cells;
          }),
        );
      }
    }

    if (key === "play" && game.figures) {
      for (const figure of game.figures) drawFigure(book, figure);
    }

    if (key === "goal_and_scoring" && game.scoring_table) {
      const hasNote = game.scoring_table.some((r) => r.note);
      drawTable(
        book,
        hasNote ? ["Scores", "Value", "Notes"] : ["Scores", "Value"],
        game.scoring_table.map((r) =>
          hasNote ? [r.item, r.value, r.note ?? "\u2014"] : [r.item, r.value],
        ),
      );
    }
  }

  book.heading("Variants");
  doc.fontSize(11).fillColor(TEXT);
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
      { width: book.contentWidth, lineGap: 2.6 },
    );
    doc.moveDown(0.4);
  }

  doc.moveDown(0.4);
  book.ensureSpace(26);
  doc.font(fonts.italic).fontSize(9).fillColor(MUTED);
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

/**
 * Where each game ended up, as the two independent records of it.
 *
 * They are built by different mechanisms -- the outline binds to whatever page
 * is current when addItem() is called, the contents line records book.current
 * after the heading is drawn -- and they are supposed to agree. When they did
 * not, every bookmark in the PDF landed on the LAST page of its game instead of
 * the first, which reads as working until you use one. Returning both is what
 * lets a test say they agree.
 */
export type Placement = { game: string; bookmarkPage: number; contentsPage: number };

export type Booklet_ = { pageCount: number; placements: Placement[]; unicode: boolean };

/** Compile every game into one PDF at `output`, and report where they landed. */
export async function compile(
  games: CardGame[],
  output: string,
): Promise<Booklet_> {
  mkdirSync(dirname(output), { recursive: true });

  const book = new Booklet();
  const stream = createWriteStream(output);
  book.doc.pipe(stream);

  titlePage(book, games.length);
  const contentsPages = reserveContentsPages(book, games);

  const bookmarkPages = new Map<string, number>();
  const outline = book.doc.outline;

  for (const [category, entries] of gamesByCategory(games)) {
    const label = categoryLabel(category);
    let parent: PDFKit.PDFOutline | undefined;

    entries.forEach((game, index) => {
      gamePage(book, game, index === 0 ? label : null, () => {
        if (index === 0) parent = outline.addItem(label);
        (parent ?? outline).addItem(game.name);
        bookmarkPages.set(game.name, book.current);
      });
    });
  }

  drawContents(book, contentsPages);
  drawFooters(book);

  const pageCount = book.current + 1;

  book.doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  return {
    pageCount,
    unicode: book.fonts.unicode,
    placements: book.toc
      .filter((entry) => entry.level === 1)
      .map((entry) => ({
        game: entry.title,
        bookmarkPage: bookmarkPages.get(entry.title) ?? -1,
        contentsPage: entry.page,
      })),
  };
}

async function main(): Promise<number> {
  const games = loadGames();
  if (games.length === 0) {
    console.error("No games found. Nothing to build.");
    return 1;
  }

  const output = outputPath();
  const { unicode } = await compile(games, output);

  const sizeKb = statSync(output).size / 1024;
  console.log(`Wrote ${output} (${games.length} games, ${sizeKb.toFixed(0)} KB)`);
  if (!unicode) {
    console.log("Note: fell back to a core PDF font; suit symbols were spelled out.");
  }
  return 0;
}

// Only when run as a command. Imported -- by the tests -- this file is just
// compile() and the functions under it.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main());
}
