/**
 * The card game data, plus the helpers every consumer needs to describe it.
 *
 * This is the package the Markdown renderer, the PDF builder, the picker, and
 * eventually the website and apps all read from, so a game is loaded and
 * described the same way everywhere. Nothing here writes output.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CardGame } from "../schema/game.types.ts";

export type { CardGame } from "../schema/game.types.ts";

export { CARD, buildDiagram } from "./layout.ts";
export type { Diagram, Layout, Pile, Zone, ZoneKind } from "./layout.ts";

export { MAX_FIGURE_WIDTH, buildFigure, isRedSuit, mayWrap, wrapCards } from "./figure.ts";
export type { Figure, FigureCard, FigureLayout, FigureRow } from "./figure.ts";

export {
  INK,
  MIN_LEGIBLE_SCALE,
  naturalWidth,
  renderDiagramSvg,
  renderFigureSvg,
  wrapText,
} from "./svg.ts";
export type { SvgOptions } from "./svg.ts";

export { blocks } from "./prose.ts";
export type { Block } from "./prose.ts";

export type Category = CardGame["category"];

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The released version of the corpus, from this package's own manifest.
 *
 * One place, because it goes on the booklet's cover and into the release, and
 * two numbers that could disagree would eventually disagree. Read at import
 * rather than written out, so bumping the manifest is the whole of a bump.
 */
export const VERSION: string = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
).version;

export const GAMES_DIR = join(PACKAGE_ROOT, "games");
export const SCHEMA_PATH = join(PACKAGE_ROOT, "schema", "game.schema.json");

/** Display labels, in the order categories appear in generated output. */
export const CATEGORY_LABELS = {
  solitaire: "Solitaire (1 player)",
  "trick-taking": "Trick-taking",
  "rummy-type": "Rummy family",
  shedding: "Shedding",
  "matching-collecting": "Matching & collecting",
  bluffing: "Bluffing",
  casino: "Casino",
} as const satisfies Record<Category, string>;

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as Category[];

/** The prose sections, in the order they are presented. */
export const SECTIONS = [
  { key: "setup", heading: "Setup" },
  { key: "play", heading: "Play" },
  { key: "goal_and_scoring", heading: "Goal & scoring" },
] as const satisfies readonly { key: keyof CardGame; heading: string }[];

/**
 * Background is deliberately NOT in SECTIONS.
 *
 * Everything in SECTIONS is required and comes before the variants, because it
 * is what someone with a deck in hand needs. Background is optional and comes
 * after them, so a reader reaches the deal without wading through where the
 * game was invented. Keeping it out of the list is what stops a generator
 * looping over the sections and quietly putting it back at the front.
 */
export const BACKGROUND_HEADING = "Background";

/**
 * The prose fields a source could be copied into.
 *
 * This is what gets compared against sources, what the coincidence baseline is
 * measured over, what a `checked` fingerprint covers, and what the corpus tests
 * sweep. It was four hand-kept copies of the same three strings, which is three
 * chances to add a prose field and leave one behind.
 *
 * Deliberately NOT derived from SECTIONS, and not the same question. SECTIONS
 * is a render order, and background is kept out of it on purpose so a generator
 * cannot put the eighteenth century before the deal. Whether prose renders
 * early and whether prose can be plagiarised are unrelated, so a field must be
 * able to join this list without moving up the page.
 */
export const PROSE_FIELDS = [
  "setup",
  "play",
  "goal_and_scoring",
] as const satisfies readonly (keyof CardGame)[];

/** One of the prose fields. */
export type ProseField = (typeof PROSE_FIELDS)[number];

export function gameFiles(): string[] {
  return readdirSync(GAMES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(GAMES_DIR, name));
}

export const SHARED_FIGURES_PATH = join(PACKAGE_ROOT, "shared", "figures.json");

type SharedFigures = Record<string, NonNullable<CardGame["figures"]>[number]>;

/** Figures shared by several games, keyed by id. */
export function loadSharedFigures(): SharedFigures {
  return JSON.parse(readFileSync(SHARED_FIGURES_PATH, "utf8")) as SharedFigures;
}

/**
 * Every game entry, sorted by display name, with shared figures resolved.
 *
 * A game referencing a shared figure gets the real thing spliced in, so no
 * consumer has to know the indirection exists: the source is shared, the output
 * is not. Unknown ids are dropped here and reported by the validator.
 */
export function loadGames(): CardGame[] {
  const shared = loadSharedFigures();

  const games = gameFiles().map((path) => {
    const game = JSON.parse(readFileSync(path, "utf8")) as CardGame;
    if (game.figure_refs && game.figure_refs.length > 0) {
      const resolved = game.figure_refs
        .map((id) => shared[id])
        .filter((figure) => figure !== undefined);
      game.figures = [...(game.figures ?? []), ...resolved] as CardGame["figures"];
    }
    return game;
  });

  return games.sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

/**
 * Fingerprint of the prose an originality check actually reads.
 *
 * A date on its own rots: it goes on claiming a check that stopped covering the
 * text the moment somebody edited a sentence. Pairing the date with a
 * fingerprint of what was read turns "checked on the 1st" into a statement the
 * validator can test, and lets it say "edited since" instead of nothing.
 *
 * PROSE_FIELDS and nothing else, because those are the only ones a source could
 * be copied into. Retagging a game or fixing its deal table does not invalidate
 * a reading of its rules. Reading that list rather than repeating it here is
 * what stops the fingerprint covering less than the check actually reads.
 *
 * An absent optional field contributes nothing rather than an empty slot. That
 * matters when one joins the list: only the entries that actually carry it see
 * their fingerprint move, so re-reading is scoped to the prose that gained
 * cover instead of the whole corpus.
 */
export function proseFingerprint(game: CardGame): string {
  const text = PROSE_FIELDS.map((field) => game[field] ?? "")
    .filter((prose) => prose.length > 0)
    .join("\u0000");
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/** Games grouped into [category, entries] pairs in display order. */
export function gamesByCategory(games: CardGame[]): [string, CardGame[]][] {
  const grouped: [string, CardGame[]][] = [];

  for (const category of CATEGORY_ORDER) {
    const entries = games.filter((game) => game.category === category);
    if (entries.length > 0) grouped.push([category, entries]);
  }

  // Anything with an unexpected category still gets rendered rather than dropped.
  const known = new Set<string>(CATEGORY_ORDER);
  const leftovers = games.filter((game) => !known.has(game.category));
  if (leftovers.length > 0) grouped.push(["other", leftovers]);

  return grouped;
}

export function categoryLabel(category: string): string {
  const known = CATEGORY_LABELS as Record<string, string>;
  return (
    known[category] ??
    category
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

/** e.g. "3-7 players (best with 4)" or "1 player". */
export function playersLine(game: CardGame): string {
  const { min, max, ideal } = game.players;
  if (min === max) return min === 1 ? "1 player" : `${min} players`;
  return `${min}-${max} players (best with ${ideal})`;
}

export function durationLine(game: CardGame): string {
  const value = game.duration_minutes;
  return value.endsWith("+")
    ? `${value.slice(0, -1)}+ minutes`
    : `${value} minutes`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * How many standard decks a game needs at a given table size.
 *
 * `standard_decks` is the requirement at the *minimum* player count, which is
 * what the schema has always said it was — so on its own it understates every
 * game that wants another pack as the table grows. `decks_by_players` supplies
 * the counts it cannot, and this is the only place that reading exists: the
 * site and the picker both ask here, because two copies of it drifted once
 * already.
 *
 * Keys are sorted rather than trusted in insertion order, so a hand-edited
 * entry cannot change the answer by listing its steps out of order.
 */
export function decksNeeded(game: CardGame, players: number): number {
  const steps = game.equipment.decks_by_players;
  if (!steps) return game.equipment.standard_decks;

  let needed = game.equipment.standard_decks;
  for (const key of Object.keys(steps).sort((a, b) => Number(a) - Number(b))) {
    if (players >= Number(key)) needed = steps[key]!;
  }
  return needed;
}

/**
 * Can a reader holding this many decks play this game at this table size?
 *
 * A purpose-built pack (`standard_decks: 0`) is never yes, however many decks
 * are held — hanafuda is not something a 52-card deck stands in for. The way
 * this function fails badly is by saying yes when the answer is no, which
 * looks like a working filter until someone reaches for a deck they do not own.
 */
export function playableWith(game: CardGame, players: number, decksHeld: number): boolean {
  if (game.equipment.standard_decks === 0) return false;
  return decksNeeded(game, players) <= decksHeld;
}

/** The at-a-glance rows shown above the rules in every output format. */
export function facts(game: CardGame): [string, string][] {
  const rows: [string, string][] = [
    ["Players", playersLine(game)],
    ["Deck", game.decks],
    ["Time", durationLine(game)],
    ["Difficulty", titleCase(game.difficulty)],
    ["Category", categoryLabel(game.category)],
  ];
  if (game.aliases.length > 0) {
    rows.unshift(["Also known as", game.aliases.join(", ")]);
  }
  return rows;
}
