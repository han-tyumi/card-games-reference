/**
 * What the search index is built from.
 *
 * A document is a game reduced to the fields search.js weights, and its identity
 * is its position in the array — the same order the index page renders, so a hit
 * is an array index and the index stores no ids at all.
 *
 * This is its own module so the tests can index the real corpus and assert on
 * what a query actually returns, rather than on a hand-built fixture that agrees
 * with the code by construction.
 */

import type { CardGame } from "naibi";
import { categoryLabel, decksNeeded } from "naibi";

import { PREP, PREP_OWN_PACK } from "./assets/facets.js";

/** Field keys match search.js's FIELDS; `titles` feeds the exact-title bonus. */
export type SearchRecord = {
  name: string;
  alias: string;
  tags: string;
  setup: string;
  play: string;
  goal_and_scoring: string;
  variants: string;
  /** What you play it with: the deck line, plus any named pack. */
  pack: string;
  titles: string[];
};

export function searchRecords(games: CardGame[]): SearchRecord[] {
  return games.map((game) => ({
    name: game.name,
    alias: game.aliases.join(" "),
    // Every string that names this game, primary name first. Used for the
    // exact-title bonus, so typing a name finds the game called that.
    titles: [game.name, ...game.aliases],
    // The category reads as a tag to a searcher: "trick-taking" should find
    // trick-taking games whether or not any of them carries it as a tag.
    tags: [...game.tags, categoryLabel(game.category)].join(" "),
    // Someone holding a 32-card pack has no way to find the games that use
    // one. `decks` is the sentence the card already prints; `special_deck`
    // names the pack itself, and is where "euchre deck" and "piquet pack"
    // actually live.
    pack: [game.decks, game.equipment.special_deck].filter(Boolean).join(" "),
    setup: game.setup,
    play: game.play,
    goal_and_scoring: game.goal_and_scoring,
    variants: game.variants.map((v) => `${v.name} ${v.description}`).join(" "),
  }));
}

/**
 * The compact per-game facts the filter chips run on.
 *
 * Ships inside the index page, so it carries only what a filter reads and is
 * keyed by position like the search index. `s` is the searchable text used by
 * the fallback that runs before the search index has loaded.
 */
export type Facet = {
  s: string;
  /** Category id, so the family chips filter on the same value the schema uses. */
  c: string;
  lo: number;
  hi: number;
  /** The count the game is best with. Orders the list; never filters it. */
  i: number;
  d: number;
  /**
   * Decks needed at each seat from `lo` upward, or null when the requirement
   * never changes. Precomputed because the browser must not carry a second
   * copy of the rule that reads the step map.
   */
  dn: number[] | null;
  /**
   * What must be done to a deck before this can be played: PREP bits, or
   * PREP_OWN_PACK for a pack no standard deck becomes. Derived from
   * `equipment` so it cannot drift from what the entry actually says.
   */
  p: number;
  max: number | null;
  diff: string;
};

/**
 * `special_deck` does two unrelated jobs and the field name tells them apart
 * for nobody. For piquet it is a setup instruction — strip a 52 down to 32.
 * For koi-koi it is an equipment barrier. `standard_decks: 0` is what actually
 * distinguishes them, so it is read first and answers alone: a hanafuda pack is
 * not "stripping plus jokers", it is a thing you either own or do not.
 */
function preparation(game: CardGame): number {
  if (game.equipment.standard_decks === 0) return PREP_OWN_PACK;
  return (
    (game.equipment.special_deck ? PREP.strip! : 0) | (game.equipment.jokers > 0 ? PREP.jokers! : 0)
  );
}

export function facetsFor(games: CardGame[]): Facet[] {
  return games.map((game) => {
    const range = /^(\d{1,3})-(\d{1,3})$/.exec(game.duration_minutes);
    return {
      s: [game.name, ...game.aliases, categoryLabel(game.category), ...game.tags]
        .join(" ")
        .toLowerCase(),
      c: game.category,
      lo: game.players.min,
      hi: game.players.max,
      i: game.players.ideal,
      d: game.equipment.standard_decks,
      dn: game.equipment.decks_by_players
        ? Array.from({ length: game.players.max - game.players.min + 1 }, (_, i) =>
            decksNeeded(game, game.players.min + i),
          )
        : null,
      p: preparation(game),
      // Only a closed range promises an end; "60+" does not.
      max: range?.[2] ? Number(range[2]) : null,
      diff: game.difficulty,
    };
  });
}
