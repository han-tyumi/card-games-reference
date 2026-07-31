/**
 * Answer "what can we play right now?" from the game data.
 *
 *   node scripts/pick.ts --players 5
 *   node scripts/pick.ts --players 2 --decks 1 --minutes 20
 *   node scripts/pick.ts --players 4 --difficulty simple --tag family-friendly
 *
 * Options
 *   --players N     only games that seat exactly N
 *   --decks N       only games playable with N standard decks on hand
 *   --jokers        you have jokers available (default: assume not)
 *   --minutes N     only games that can finish within N minutes
 *   --difficulty X  simple | easy | medium | complex (or "up-to-X")
 *   --category X    trick-taking, shedding, rummy-type, solitaire, ...
 *   --tag X         require a tag; repeatable
 *
 * This is a proof that the data supports the filtering an app will need, not
 * the companion picker described in tools/README.md.
 */

import type { CardGame } from "../schema/game.types.ts";
import { categoryLabel, durationLine, loadGames, playersLine } from "./games.ts";

const DIFFICULTY_ORDER = ["simple", "easy", "medium", "complex"] as const;

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
    games = games.filter((g) => g.equipment.standard_decks <= decks);
    reasons.push(`${decks} deck${decks === 1 ? "" : "s"}`);
  }

  if (!hasJokers) {
    games = games.filter((g) => g.equipment.jokers === 0);
  } else {
    reasons.push("jokers available");
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
    const needs =
      game.equipment.special_deck ??
      `${game.equipment.standard_decks} deck${game.equipment.standard_decks === 1 ? "" : "s"}`;
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

process.exit(main());
