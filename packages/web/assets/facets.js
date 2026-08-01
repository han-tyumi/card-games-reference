/**
 * The filter chips: does this game match what the reader said they have?
 *
 * Kept apart from the page so it can be tested. The whole point of the filters
 * is to answer "what can we play right now", and the way that fails is by
 * saying yes when the answer is no — which looks like a working filter until
 * someone reaches for a deck they do not own.
 *
 * Criteria arrive as the strings the radio inputs hold; an empty string means
 * the chip is not set. Numbers are parsed here rather than at the call site so
 * the parsing cannot differ between callers.
 */

/** Difficulty is ordered, so a filter means "up to this", not "exactly this". */
export const DIFFICULTY = { simple: 0, easy: 1, medium: 2, complex: 3 };

/**
 * @typedef {object} Facet
 * @property {string} s name, aliases, category and tags, for the offline fallback
 * @property {number} lo fewest players
 * @property {number} hi most players
 * @property {number} d standard decks needed; 0 means a purpose-built pack
 * @property {number | null} max longest run in minutes, null if open-ended
 * @property {string} diff difficulty
 */

/**
 * @param {Facet} facet
 * @param {{players?: string, decks?: string, minutes?: string, difficulty?: string}} criteria
 * @returns {boolean}
 */
export function matches(facet, criteria) {
  if (criteria.players) {
    const n = Number(criteria.players);
    if (facet.lo > n || facet.hi < n) return false;
  }

  // A game needing its own pack is unreachable for someone holding a 52-card
  // deck, so "0 decks <= 1 deck" must NOT read as playable. This was a real
  // defect in the command-line picker before it was one here.
  if (criteria.decks && (facet.d === 0 || facet.d > Number(criteria.decks))) {
    return false;
  }

  // An open-ended game ("60+") has no upper bound, so it can never be promised
  // to finish inside one.
  if (criteria.minutes && (facet.max === null || facet.max > Number(criteria.minutes))) {
    return false;
  }

  if (criteria.difficulty && DIFFICULTY[facet.diff] > DIFFICULTY[criteria.difficulty]) {
    return false;
  }

  return true;
}
