/**
 * The card game data, plus the helpers every consumer needs to describe it.
 *
 * This is the package the Markdown renderer, the PDF builder, the picker, and
 * eventually the website and apps all read from, so a game is loaded and
 * described the same way everywhere. Nothing here writes output.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CardGame } from "../schema/game.types.ts";

export type { CardGame } from "../schema/game.types.ts";

export type Category = CardGame["category"];

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

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

export function gameFiles(): string[] {
  return readdirSync(GAMES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(GAMES_DIR, name));
}

/** Every game entry, sorted by display name. */
export function loadGames(): CardGame[] {
  const games = gameFiles().map(
    (path) => JSON.parse(readFileSync(path, "utf8")) as CardGame,
  );
  return games.sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
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
