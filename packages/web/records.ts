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
import { categoryLabel } from "naibi";

/** Field keys match search.js's FIELDS; `titles` feeds the exact-title bonus. */
export type SearchRecord = {
  name: string;
  alias: string;
  tags: string;
  setup: string;
  play: string;
  goal_and_scoring: string;
  variants: string;
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
    setup: game.setup,
    play: game.play,
    goal_and_scoring: game.goal_and_scoring,
    variants: game.variants.map((v) => `${v.name} ${v.description}`).join(" "),
  }));
}
