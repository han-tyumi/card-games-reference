/**
 * The PDF's structure, which is the part that fails silently.
 *
 * PDFKit writes in one pass and binds an outline item to whatever page happens
 * to be current, so the booklet keeps two independent records of where a game
 * landed: the bookmark, and the line on the contents page. They are supposed to
 * agree. They once did not — every bookmark pointed at the LAST page of its
 * game rather than the first, which looks perfect until you click one, and no
 * amount of reading the code makes it obvious.
 *
 * This builds the real PDF from the real corpus, which takes about a second and
 * is the only way to find out where anything actually ended up.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildFigure, gamesByCategory, loadGames } from "naibi";
import { PAGE, VENDORED_FONT_DIR, compile } from "../build-pdf.ts";
import type { Placement } from "../build-pdf.ts";

const games = loadGames();

let dir: string;
let output: string;
let built: Awaited<ReturnType<typeof compile>>;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "naibi-pdf-"));
  output = join(dir, "naibi.pdf");
  built = await compile(games, output);
});

after(() => rmSync(dir, { recursive: true, force: true }));

test("every game gets a bookmark and a contents line", () => {
  assert.equal(built.placements.length, games.length);

  const named = new Set(built.placements.map((p) => p.game));
  for (const game of games) {
    assert.ok(named.has(game.name), `${game.name} is not in the contents`);
  }
});

test("each bookmark points at the same page as its contents line", () => {
  // The bug. Both numbers come from book.current, but at different moments:
  // the bookmark when the page is created, the contents entry after the heading
  // is drawn. Anything that lets layout run in between breaks this.
  const disagreements = built.placements.filter(
    (p) => p.bookmarkPage !== p.contentsPage,
  );

  assert.deepEqual(
    disagreements.map(
      (p: Placement) => `${p.game}: bookmark p${p.bookmarkPage}, contents p${p.contentsPage}`,
    ),
    [],
  );
});

test("no bookmark failed to record a page at all", () => {
  assert.deepEqual(
    built.placements.filter((p) => p.bookmarkPage < 0).map((p) => p.game),
    [],
  );
});

test("games appear in order, each starting after the last", () => {
  const pages = built.placements.map((p) => p.bookmarkPage);
  assert.deepEqual(
    pages,
    [...pages].sort((a, b) => a - b),
    "the contents lists games out of page order",
  );

  // One game per page start: two games sharing a first page would mean a page
  // was created and then not used.
  assert.equal(new Set(pages).size, pages.length);
});

test("the contents order matches the category order the rest of the site uses", () => {
  const expected = gamesByCategory(games).flatMap(([, entries]) =>
    entries.map((g) => g.name),
  );
  assert.deepEqual(built.placements.map((p) => p.game), expected);
});

test("every game starts after the front matter and lands inside the document", () => {
  for (const placement of built.placements) {
    assert.ok(placement.bookmarkPage > 0, `${placement.game} is on the title page`);
    assert.ok(
      placement.bookmarkPage < built.pageCount,
      `${placement.game} is past the end of the document`,
    );
  }
});

test("the file is a PDF with as many pages as the builder counted", () => {
  const bytes = readFileSync(output);
  assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-");

  // Page objects are not inside compressed streams, so they can be counted
  // without a parser.
  const pageObjects = bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
  assert.equal(pageObjects.length, built.pageCount);

  assert.ok(bytes.toString("latin1").includes("/Outlines"), "no bookmarks at all");
});

test("the booklet uses a font that can draw suit pips", () => {
  // The fallback spells them out, which is legible but not what the figures
  // were designed around. Worth knowing if CI loses its fonts.
  assert.equal(built.unicode, true, "fell back to a core PDF font");
});

test("a figure fits the page it is drawn on, at a size cards still read at", () => {
  // Figures wrap themselves to a phone's column by default, and a page is not
  // a phone. Left at the default, Hand and Foot's four seven-card melds wrapped
  // to eight lines, MAX_ENLARGE magnified the taller result, and one figure
  // grew from a third of a page to more than the page had left. The booklet
  // therefore passes its own measure, and this is what says it still does.
  /** Room drawFigure needs beyond the geometry: the caption and its gap. */
  const CAPTION = 26;

  const tall: string[] = [];
  const shrunk: string[] = [];

  for (const game of games) {
    for (const [index, spec] of (game.figures ?? []).entries()) {
      const built = buildFigure(spec, PAGE.contentWidth);
      const scale = Math.min(PAGE.maxEnlarge, PAGE.contentWidth / Math.max(built.width, 1));
      const id = `${game.id}-fig${index + 1}`;

      if (built.height * scale + CAPTION > PAGE.contentHeight) tall.push(id);
      // Below 1:1 the cards are smaller than the geometry intends, which is
      // what the wider measure is for.
      if (scale < 1) shrunk.push(id);
    }
  }

  assert.deepEqual(tall, [], "these figures no longer fit a page");
  assert.deepEqual(shrunk, [], "these figures are drawn smaller than card size");
});

test("the booklet is built from the font in this repository", () => {
  // The PDF embeds a subset of the font file, which makes that file a build
  // input like any other. While it came from the system, two machines with
  // different DejaVu builds produced different bytes from one corpus, and the
  // booklet could not be gated — see decision 0012, which cost a red CI to
  // learn. The fonts are vendored now, and this asserts the vendored copy is
  // the one that won rather than a system copy that happens to sit earlier on
  // some other machine. Silently falling through is the failure that would
  // quietly un-fix all of it.
  for (const file of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"]) {
    assert.ok(
      existsSync(join(VENDORED_FONT_DIR, file)),
      `${file} is missing from packages/build/fonts/`,
    );
  }
  assert.equal(
    built.fontSource,
    join(VENDORED_FONT_DIR, "DejaVuSans.ttf"),
    "the booklet was built from a font outside the repository",
  );
});

test("the same corpus compiles to the same bytes", () => {
  // PDFKit stamps the moment of the build, so every run used to produce a new
  // 0.9 MB object in git whether or not a card had moved: 140 of them, most of
  // a 29 MB history. A fixed CreationDate stops that, and this holds the line.
  //
  // Both compiles happen in this process, so what this proves directly is
  // determinism here. Cross-machine reproducibility rests on the two inputs
  // being pinned rather than on this test: the font is vendored beside this
  // file, and pdfkit is pinned by package-lock. The gate in CI is what actually
  // checks the claim, because it runs on a machine that is not this one.
  const twin = join(dir, "twin.pdf");
  return compile(games, twin).then(() => {
    assert.ok(
      readFileSync(output).equals(readFileSync(twin)),
      "two builds of one corpus differ — something in the PDF is time or order dependent",
    );
  });
});
