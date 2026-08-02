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

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import PDFDocument from "pdfkit";

import type { Block, CardGame } from "naibi";
import {
  CARD,
  INK,
  BACKGROUND_HEADING,
  SECTIONS,
  VERSION,
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
const REPO_URL = "https://github.com/han-tyumi/naibi";
const ORIGIN =
  "Naibi is the first European word for playing cards, recorded in Florence in " +
  "1377. It comes from the Arabic nā'ib, “deputy” — the rank of court card in " +
  "the Mamluk pack that every European deck descends from. Spain still calls " +
  "them naipes.";

/** The vendored face, and the reason the booklet can be gated at all. */
export const VENDORED_FONT_DIR = fileURLToPath(new URL("fonts", import.meta.url));

// Core PDF fonts cannot encode card suit pips, so prefer a TrueType face that can.
//
// The repository's own copy comes first and should always win. The font file is
// a build input -- the PDF embeds a subset of it -- so leaving it to whatever
// the system happens to have installed made the same corpus compile to
// different bytes on different machines. That is what stopped the booklet being
// gated like rendered/ and docs/, and it is why these two files are committed
// despite being 1.4 MB of binary. See decisions/0012.
//
// The system paths below are kept as a fallback for a checkout that somehow
// lacks them, not as an equal alternative: reach one and the bytes stop being
// reproducible, which is why a test asserts the vendored copy is what got used.
const FONT_CANDIDATES = [
  {
    regular: join(VENDORED_FONT_DIR, "DejaVuSans.ttf"),
    bold: join(VENDORED_FONT_DIR, "DejaVuSans-Bold.ttf"),
    italic: join(VENDORED_FONT_DIR, "DejaVuSans-Oblique.ttf"),
  },
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
const MUTED = INK.stroke;
const RED = INK.red;
const RULE = "#c8d0d8";
const TEXT = "#111111";

// Left/right margins are set by READABILITY, not by fitting the most words on
// the page. Measured with the vendored face at the body size: this column runs
// to about 77 characters, against the 66 that centuries of book typography
// converged on, so it is already at the wide end and must not be widened
// further -- a longer line costs the reader their place on every return sweep.
//
// 84pt and 11.5pt were chosen together and only make sense together. The
// booklet was 95pt margins at 11pt, which is the same 77-character measure with
// smaller type and more white space either side. Swapping to a slightly larger
// face and correspondingly narrower margins holds the measure and the page
// count exactly -- 364 pages both ways, measured -- while making every word
// bigger. Change one of the two and the measure moves: 84pt at 11pt gives 81
// characters, which is worse to read even though it saves ten pages.
const MARGINS = { top: 58, bottom: 62, left: 84, right: 84 };

// Contents-page metrics. Used both to reserve pages and to draw them, so the
// two cannot disagree.
/** Cap on growing a figure past its natural size, so cards stay card-shaped. */
const MAX_ENLARGE = 1.35;

/**
 * The page, in points, for anything that needs to reason about what fits.
 *
 * Exported because a test that copies these numbers is a second copy of them,
 * and this project spends most of its effort on not having those.
 */
export const PAGE = {
  /** US Letter, which the document is built at. */
  width: 612,
  height: 792,
  margins: MARGINS,
  maxEnlarge: MAX_ENLARGE,
  get contentWidth(): number {
    return this.width - this.margins.left - this.margins.right;
  },
  get contentHeight(): number {
    return this.height - this.margins.top - this.margins.bottom;
  },
} as const;

const TOC_TITLE_HEIGHT = 46;
const TOC_LINE = { category: 27, game: 17 };

type FontSet = {
  regular: string;
  bold: string;
  italic: string;
  unicode: boolean;
  /** The file the face was loaded from, so a test can prove which one won. */
  source: string | null;
};
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
    return {
      regular: "body",
      bold: "bold",
      italic: "italic",
      unicode: true,
      source: candidate.regular,
    };
  }

  return {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
    italic: "Helvetica-Oblique",
    unicode: false,
    source: null,
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
      size: [PAGE.width, PAGE.height],
      margins: MARGINS,
      bufferPages: true,
      autoFirstPage: false,
      info: {
        Title: TITLE,
        Author: "Naibi contributors",
        Subject: "Card game rules",
        // Fixed, so the same corpus always compiles to the same bytes.
        // PDFKit otherwise stamps the moment of the build, which made every
        // rebuild a new 0.9 MB object in git even when not one card had moved
        // -- 140 of them, most of a 29 MB history, for a file whose content
        // changed a handful of times. It also made the booklet the one
        // generated output that could not have a --check, because "differs
        // from the committed copy" was true every single time.
        CreationDate: new Date(0),
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
    doc.font(fonts.regular).fontSize(11.5).fillColor(TEXT);

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
        // Matches the SVG: the dashes are the whole of what says "a card goes
        // here", so they carry SC 1.4.11's 3:1 rather than being faded out.
        .strokeColor(MUTED)
        .lineWidth(0.7)
        .opacity(INK.provisional)
        .stroke()
        .opacity(1)
        .undash();
      continue;
    }

    for (const card of pile.cards) {
      const [x, y] = at(card.x, card.y);
      doc
        .roundedRect(x, y, card.width * scale, card.height * scale, 2)
        .fillColor(card.faceUp ? INK.faceUp : INK.faceDown)
        .fillAndStroke(card.faceUp ? INK.faceUp : INK.faceDown, MUTED);
    }

    if (pile.count !== undefined && pile.count > pile.cards.length) {
      const last = pile.cards[pile.cards.length - 1];
      if (last) {
        const [x, y] = at(last.x, last.y + CARD.height / 2 - 3);
        doc
          .font(fonts.regular)
          .fontSize(7 * scale + 2)
          .fillColor(last.faceUp ? MUTED : INK.faceDownInk)
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

/** Draw a ranking strip or combination example, mirroring the SVG figure. */
function drawFigure(book: Booklet, figure: NonNullable<CardGame["figures"]>[number]): void {
  const { doc, fonts } = book;
  // Figures wrap themselves to a phone's column unless told otherwise, which
  // for a page is the wrong constraint in both directions: there is room for a
  // wider strip, and wrapping narrow trades width for height and then
  // MAX_ENLARGE magnifies the result -- Hand and Foot's four melds went from a
  // third of a page to nearly all of one. A page's constraint is its measure.
  const built = buildFigure(figure, book.contentWidth);
  const widthScale = Math.min(MAX_ENLARGE, book.contentWidth / Math.max(built.width, 1));
  const scale = fitOrBreak(book, built.height * widthScale + 26, widthScale);

  const originX = MARGINS.left + (book.contentWidth - built.width * scale) / 2;
  const originY = doc.y + 4;

  for (const card of built.cards) {
    const x = originX + card.x * scale;
    const y = originY + card.y * scale;
    // A counter-example gets a dashed outline, as in the SVG. The booklet had
    // no cue for one at all: the red row label was carrying it alone, which is
    // colour as the only channel, and the booklet is the output most likely to
    // be printed in black and white.
    doc.roundedRect(x, y, card.width * scale, card.height * scale, 2);
    if (card.struck) doc.dash(2, { space: 1.5 });
    doc.fillAndStroke(INK.faceUp, MUTED);
    if (card.struck) doc.undash();

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
      .text(row.text, originX + row.x * scale, originY + row.y * scale - 7, {
        width: row.width * scale,
        align: "left",
        lineBreak: false,
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
  // The version and not the build date. A printed booklet has to say which one
  // it is, and "generated 2026-08-02" answered a question nobody asks while
  // making the file a function of the clock: same corpus, next day, different
  // bytes, and `npm run pdf -- --check` goes red on a repository nobody
  // touched. Decision 0013 fixed the PDF's CreationDate for exactly this
  // reason and this line went on quietly undoing it.
  book.text(
    `Text licensed under CC BY-SA 4.0. Scripts licensed under MIT. ` +
      `${REPO_URL} · Version ${VERSION}.`,
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

  if (game.background) {
    book.heading(BACKGROUND_HEADING);
    book.body(blocks(game.background));
  }

  doc.moveDown(0.4);
  book.ensureSpace(26);
  doc.font(fonts.italic).fontSize(9).fillColor(MUTED);
  book.text(`Rules checked against: ${game.sources_consulted.join(", ")}.`, {
    lineGap: 1.5,
  });
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

export type Booklet_ = {
  pageCount: number;
  placements: Placement[];
  unicode: boolean;
  /** The font file the booklet was built from. Null means a core PDF font. */
  fontSource: string | null;
};

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
    fontSource: book.fonts.source,
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

  // --check earns its place now the build is deterministic: it compiles to a
  // scratch file and compares, so a committed booklet that has fallen behind
  // the data fails the gate instead of shipping. rendered/ and docs/ have had
  // this; the booklet could not, and was the one output where "I forgot to
  // rebuild" reached a reader.
  if (process.argv.includes("--check")) {
    const scratch = join(dirname(output), ".naibi-check.pdf");
    await compile(games, scratch);
    const stale = !existsSync(output) || !readFileSync(output).equals(readFileSync(scratch));
    rmSync(scratch, { force: true });

    if (stale) {
      console.error(`${output} is out of date. Run: npm run pdf`);
      return 1;
    }
    console.log(`${output} is up to date.`);
    return 0;
  }

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
