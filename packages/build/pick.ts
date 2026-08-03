/**
 * Answer "what can we play right now?" from the game data.
 *
 *   npm run pick -- --players 5
 *   npm run pick -- --players 2 --decks 1 --minutes 20
 *   npm run pick -- --players 4 --difficulty simple --tag family-friendly
 *
 * Options
 *   --players N     only games that seat exactly N
 *   --decks N       only games playable with N standard decks on hand
 *                   (excludes games needing a purpose-built pack)
 *   --special       include games needing their own pack, e.g. hanafuda
 *   --jokers        you have jokers available (default: assume not)
 *   --minutes N     only games that can finish within N minutes
 *   --difficulty X  simple | easy | medium | complex (or "up-to-X")
 *   --category X    trick-taking, shedding, rummy-type, solitaire, ...
 *   --tag X         require a tag; repeatable
 *
 * This is a proof that the data supports the filtering an app will need, not
 * the companion picker described in tools/README.md.
 */

import { pathToFileURL } from "node:url";

import type { CardGame } from "naibi";
import { categoryLabel, decksNeeded, durationLine, loadGames, playableWith, playersLine } from "naibi";

const DIFFICULTY_ORDER = ["simple", "easy", "medium", "complex"] as const;

/**
 * The games a reader holding `decks` packs can play, at `players` if they said.
 *
 * Extracted from `main` so it can be tested: everything else here reads
 * `process.argv`, which is why the deck filter went wrong unnoticed. Without a
 * player count the smallest table is the only thing knowable, and that is
 * exactly what `standard_decks` already means, so judging a game at its own
 * `players.min` is correct by construction, not merely a shortcut for it.
 */
export function withDecksOnHand(
  games: readonly CardGame[],
  decks: number,
  players?: number,
): CardGame[] {
  return games.filter((game) => playableWith(game, players ?? game.players.min, decks));
}

/**
 * The deck requirement as the picker prints it, at the table size asked for
 * (or the game's minimum, if none was given).
 *
 * Extracted for the same reason `withDecksOnHand` was: reading
 * `standard_decks` straight off the entry prints the requirement at the
 * SMALLEST table, which understates every other one -- 500 Rummy, BS,
 * Egyptian Ratscrew and President all want a second pack by eight players and
 * printed "1 deck" regardless, even after the filter itself was fixed to know
 * better. A `special_deck` that also scales (mau-mau, at six or more players)
 * needs both halves said, because `??` alone means the reader sees the pack
 * name and never learns the count doubles.
 */
export function deckLabel(game: CardGame, players?: number): string {
  const n = decksNeeded(game, players ?? game.players.min);
  const count = `${n} deck${n === 1 ? "" : "s"}`;
  if (!game.equipment.special_deck) return count;
  return game.equipment.decks_by_players
    ? `${game.equipment.special_deck}; ${count} at this table`
    : game.equipment.special_deck;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function argNumber(flag: string): number | undefined {
  const raw = argValue(flag);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    console.error(`${flag} needs a number, got "${raw}"`);
    process.exit(1);
  }
  return value;
}

function allTags(): string[] {
  const tags: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === "--tag") {
      const value = process.argv[i + 1];
      if (value) tags.push(value);
    }
  }
  return tags;
}

/** Upper bound of a duration range; "60+" has none. */
function longestGame(game: CardGame): number | null {
  const match = /^(\d{1,3})-(\d{1,3})$/.exec(game.duration_minutes);
  return match?.[2] ? Number(match[2]) : null;
}

function main(): number {
  const players = argNumber("--players");
  const decks = argNumber("--decks");
  const minutes = argNumber("--minutes");
  const hasJokers = process.argv.includes("--jokers");
  const category = argValue("--category");
  const tags = allTags();

  const difficultyRaw = argValue("--difficulty");
  const upTo = difficultyRaw?.startsWith("up-to-") ?? false;
  const difficulty = upTo ? difficultyRaw!.slice("up-to-".length) : difficultyRaw;
  const difficultyCap = DIFFICULTY_ORDER.indexOf(
    difficulty as (typeof DIFFICULTY_ORDER)[number],
  );
  if (difficulty !== undefined && difficultyCap === -1) {
    console.error(
      `--difficulty must be one of ${DIFFICULTY_ORDER.join(", ")} ` +
        `(optionally prefixed "up-to-")`,
    );
    return 1;
  }

  const reasons: string[] = [];
  let games = loadGames();

  if (players !== undefined) {
    games = games.filter((g) => g.players.min <= players && players <= g.players.max);
    reasons.push(`${players} players`);
  }

  if (decks !== undefined) {
    games = withDecksOnHand(games, decks, players);
    reasons.push(`${decks} deck${decks === 1 ? "" : "s"}`);
  }

  if (!hasJokers) {
    games = games.filter((g) => g.equipment.jokers === 0);
  } else {
    reasons.push("jokers available");
  }

  // Games needing their own pack are out of reach unless you say you have one.
  if (!process.argv.includes("--special")) {
    games = games.filter((g) => g.equipment.standard_decks > 0);
  } else {
    reasons.push("specialty decks included");
  }

  if (minutes !== undefined) {
    games = games.filter((g) => {
      const longest = longestGame(g);
      return longest !== null && longest <= minutes;
    });
    reasons.push(`under ${minutes} minutes`);
  }

  if (difficultyCap !== -1) {
    games = games.filter((g) => {
      const rank = DIFFICULTY_ORDER.indexOf(g.difficulty);
      return upTo ? rank <= difficultyCap : rank === difficultyCap;
    });
    reasons.push(upTo ? `up to ${difficulty}` : `${difficulty} only`);
  }

  if (category !== undefined) {
    games = games.filter((g) => g.category === category);
    reasons.push(category);
  }

  for (const tag of tags) {
    games = games.filter((g) => (g.tags as string[]).includes(tag));
    reasons.push(tag);
  }

  const filter = reasons.length > 0 ? reasons.join(", ") : "no filters";
  if (games.length === 0) {
    console.log(`Nothing matches (${filter}). Try loosening a constraint.`);
    return 0;
  }

  console.log(`${games.length} game${games.length === 1 ? "" : "s"} — ${filter}\n`);

  const width = Math.max(...games.map((g) => g.name.length));
  for (const game of games) {
    const needs = deckLabel(game, players);
    console.log(
      `  ${game.name.padEnd(width)}  ${durationLine(game).padEnd(14)} ` +
        `${game.difficulty.padEnd(8)} ${needs}`,
    );
    console.log(
      `  ${" ".repeat(width)}  ${playersLine(game)} · ${categoryLabel(game.category)}`,
    );
  }

  return 0;
}

// Only when run as a command. Imported -- by the tests -- this file is just
// the filter above.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main());
}
