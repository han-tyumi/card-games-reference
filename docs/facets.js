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
 *
 * Reading and writing that same state as a query string lives here too, since
 * it is the same set of names and the two would drift if they were apart.
 */

/**
 * Difficulty is ordered, so a filter means "up to this", not "exactly this".
 *
 * Typed as a plain string lookup because neither key comes from code: one is a
 * validated field on an entry, the other the value of a chip. What keeps the two
 * sets in step is the test "every difficulty in the data is ranked", not the
 * type — a value this table has never heard of is a game that drops out of every
 * difficulty filter, which is quiet enough to want a test on it.
 *
 * @type {Record<string, number>}
 */
export const DIFFICULTY = { simple: 0, easy: 1, medium: 2, complex: 3 };

/**
 * @typedef {object} Facet
 * @property {string} s name, aliases, category and tags, for the offline fallback
 * @property {string} c category id
 * @property {number} lo fewest players
 * @property {number} hi most players
 * @property {number} d standard decks needed; 0 means a purpose-built pack
 * @property {number | null} max longest run in minutes, null if open-ended
 * @property {string} diff difficulty
 */

/**
 * @param {Facet} facet
 * @param {{category?: string, players?: string, decks?: string, minutes?: string,
 *   difficulty?: string}} criteria
 * @returns {boolean}
 */
export function matches(facet, criteria) {
  // Family is an exact match, unlike difficulty and time: nobody wants
  // trick-taking games "or simpler".
  if (criteria.category && facet.c !== criteria.category) return false;

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

  if (criteria.difficulty) {
    const ceiling = DIFFICULTY[criteria.difficulty];
    const rank = DIFFICULTY[facet.diff];
    // A difficulty nothing ranks used to compare as undefined, which is false
    // both ways round, so an unrankable game passed every difficulty filter
    // there was. Undefined on either side means the question cannot be
    // answered, and a chip that cannot answer must not say yes.
    if (ceiling === undefined || rank === undefined || rank > ceiling) return false;
  }

  return true;
}

/**
 * The chip groups that can be carried in a URL. `q` is handled separately
 * because it is free text rather than one of a fixed set.
 */
export const PARAMS = ["category", "players", "decks", "minutes", "difficulty"];

/**
 * Filter state out of a query string, so a filtered view can be linked to.
 *
 * `allowed` maps each chip group to the values it actually offers. Anything
 * outside that is dropped rather than passed through: a stale or mistyped
 * value would match no game at all, and a shared link that opens on an empty
 * list looks like a broken site rather than a stale link.
 *
 * Omit it where there are no chips to be stale against — the print sheet has
 * none. It was briefly given a map built from the facets instead, which got
 * `difficulty` wrong and dropped that filter silently, so a printed sheet held
 * games the index had excluded. Knowing the chips in two places is what caused
 * that; the second place is gone rather than corrected.
 *
 * @param {string} search location.search, with or without the leading "?"
 * @param {Record<string, Set<string>>} [allowed]
 * @returns {Record<string, string>}
 */
export function readQuery(search, allowed) {
  const params = new URLSearchParams(search);
  /** @type {Record<string, string>} */
  const state = {};

  const q = params.get("q");
  if (q && q.trim()) state.q = q.trim().toLowerCase();

  for (const name of PARAMS) {
    const value = params.get(name);
    if (value && (!allowed || allowed[name]?.has(value))) state[name] = value;
  }
  return state;
}

/**
 * The query string for a given filter state, empty when nothing is set so the
 * bare URL stays clean.
 *
 * @param {Record<string, string>} state
 * @returns {string}
 */
export function writeQuery(state) {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  for (const name of PARAMS) {
    if (state[name]) params.set(name, state[name]);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Does this game match the query, using only what the page already has?
 *
 * The fallback for a visitor whose search index has not arrived — offline on a
 * first visit, or mid-fetch. `s` carries the name, aliases, family and tags, so
 * a name search still works with nothing loaded.
 *
 * @param {Facet} facet
 * @param {string} query already lowercased and trimmed
 * @returns {boolean}
 */
export function nameMatch(facet, query) {
  for (const word of query.split(/\s+/)) {
    if (word && !facet.s.includes(word)) return false;
  }
  return true;
}

/**
 * The count under the filters. Says "of" only when something is filtered out,
 * because a printed sheet has no chips on it to explain why it is short.
 *
 * @param {number} shown
 * @param {number} total
 * @returns {string}
 */
export function countLabel(shown, total) {
  return shown === total ? `${total} games` : `${shown} of ${total} games`;
}

/**
 * What the list should show, in what order, for a given filter state.
 *
 * This is the whole of the index page's behaviour that is not the DOM: which
 * games survive the chips, which survive the query, and how they rank. It lives
 * here rather than in app.js so it can be tested — app.js talks to the browser
 * and nothing else, and was for a long time the only file in the project with
 * neither tests nor type checking.
 *
 * @param {Facet[]} facets
 * @param {Record<string, string>} state
 * @param {Map<number, {s: number, m: number}> | null} hits ranked search results
 * @returns {{order: number[], count: string}} indices in display order
 */
export function plan(facets, state, hits) {
  /** @type {[number, number][]} */
  const ranked = [];

  facets.forEach((facet, i) => {
    if (!matches(facet, state)) return;
    if (!state.q) {
      ranked.push([i, 0]);
      return;
    }
    const hit = hits ? hits.get(i) : nameMatch(facet, state.q) ? { s: 1, m: 0 } : null;
    if (hit) ranked.push([i, hit.s]);
  });

  // Ranking only applies when the index answered; the fallback has no scores
  // worth sorting on and keeping source order beats shuffling by a constant.
  if (state.q && hits) ranked.sort((a, b) => b[1] - a[1]);

  return { order: ranked.map(([i]) => i), count: countLabel(ranked.length, facets.length) };
}
