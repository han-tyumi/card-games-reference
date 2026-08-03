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
 * What a game asks you to do to a deck, as independent capabilities.
 *
 * Bits and a subset test rather than a ceiling, because these are not degrees
 * of one thing. A ceiling claims that accepting the strictest accepts
 * everything milder, and someone whose deck has no jokers can strip cards
 * happily while still being unable to add one — so "willing to strip" does not
 * contain "can add jokers" in either direction. Modelled as a ceiling, that
 * reader is handed games they cannot play, which is the false yes this whole
 * module exists to remove.
 *
 * This is the entire vocabulary the checkboxes offer, so an unknown token from
 * a URL contributes nothing rather than being read as a number.
 *
 * @type {Record<string, number>}
 */
export const PREP = { jokers: 1, strip: 2 };

/**
 * A pack that no standard deck becomes and no checkbox can offer — hanafuda.
 *
 * Deliberately outside PREP: a game carrying it is unreachable the moment the
 * control is touched at all, which is how `standard_decks: 0` already behaves
 * under the deck count. It is not "stripping plus jokers"; it is a different
 * kind of obstacle, and pretending otherwise is the modelling error again.
 */
export const PREP_OWN_PACK = 4;

/**
 * @typedef {object} Facet
 * @property {string} s name, aliases, category and tags, for the offline fallback
 * @property {string} c category id
 * @property {number} lo fewest players
 * @property {number} hi most players
 * @property {number} i the count the game is best with; orders, never filters
 * @property {number} d standard decks needed; 0 means a purpose-built pack
 * @property {number} p what must be done to a deck: PREP bits, or PREP_OWN_PACK
 * @property {number[] | null} dn decks needed at each seat from `lo` upward
 * @property {number | null} max longest run in minutes, null if open-ended
 * @property {string} diff difficulty
 */

/**
 * The table the reader is asking about: the headcount they chose, and how far
 * down they said they might shrink.
 *
 * The headcount is the top of the range because both reasons a table shrinks —
 * no-shows and sitting out — reduce from a number you already know. The floor
 * is optional and defaults to the headcount, which is why an existing
 * `?players=5` link still means exactly five without a compatibility branch.
 *
 * **This is the only place a range is built, and therefore the whole of "the
 * range cannot invert".** A floor above the count clamps to the count rather
 * than swapping the two, so there is no push rule for a reader to learn and no
 * unreachable state for a URL to name.
 *
 * Returns null when no count was given, and also when the count does not parse.
 * The second case keeps behaviour the page has always had: the index drops
 * unknown chip values through `allowed` before they reach here, so only the
 * print sheet can see one, and there it has always been inert. The deck branch
 * below refuses it on purpose, which is a different question.
 *
 * @param {{players?: string, from?: string}} criteria
 * @returns {{lo: number, hi: number} | null}
 */
export function playerRange(criteria) {
  if (!criteria.players) return null;
  const hi = Number(criteria.players);
  if (!Number.isFinite(hi)) return null;
  const floor = criteria.from ? Number(criteria.from) : hi;
  return { lo: Number.isFinite(floor) ? Math.min(Math.max(floor, 1), hi) : hi, hi };
}

/**
 * @param {Facet} facet
 * @param {{category?: string, players?: string, from?: string, decks?: string,
 *   minutes?: string, difficulty?: string, prep?: string}} criteria
 * @returns {boolean}
 */
export function matches(facet, criteria) {
  // Family is an exact match per value, unlike difficulty and time: nobody
  // wants trick-taking games "or simpler". Several combine with OR, because
  // this group is browsing rather than constraint -- every other control here
  // narrows as you add to it and this one widens, which is the difference
  // between "what can we play" and "show me the rummy games".
  if (criteria.category && !criteria.category.split(",").includes(facet.c)) return false;

  // A game matches when its span OVERLAPS the range, not when it covers it.
  // Containment is the stricter reading and is a strict subset of this one, so
  // gating on it hides games the reader can actually play — belote, canasta and
  // contract-bridge are perfect if four of the six turn up. Coverage is a real
  // signal and it is not thrown away: plan() ranks on it, which is the same
  // treatment `ideal` gets, and for the same reason.
  const range = playerRange(criteria);
  if (range && (facet.lo > range.hi || facet.hi < range.lo)) return false;

  // A game needing its own pack is unreachable for someone holding a 52-card
  // deck, so "0 decks <= 1 deck" must NOT read as playable. This was a real
  // defect in the command-line picker before it was one here.
  //
  // The requirement is read at the player count the reader gave, because `d`
  // is what the game needs at its SMALLEST table: slapjack is one pack at
  // three players and two at eight, and answering from `d` alone offered it
  // to someone with one deck and eight friends. `dn` is computed at build
  // time so the rule behind it lives in one place, which is not this file.
  if (criteria.decks) {
    if (facet.d === 0) return false;
    const held = Number(criteria.decks);
    if (!Number.isFinite(held)) return false;
    // A garbled players value never reaches the index -- `allowed` in readQuery
    // drops it -- but print.js has no chips to check against and calls
    // readQuery without that map, so "?players=abc" arrives here intact. It
    // used to fall through to `facet.dn[NaN]` being undefined by accident.
    // Refused on purpose instead: the table size cannot be determined, and a
    // chip that cannot answer must not say yes.
    if (criteria.players && !range) return false;

    // The reader can play this if ANY seat they might sit fits the decks they
    // hold, so the seats to try are the ones the range and the game share.
    // Without a range that is the smallest table, because nothing else is
    // knowable -- which is the behaviour this replaces, unchanged.
    //
    // A loop rather than "check the smallest seat, the requirement only
    // climbs": decks_by_players is typed as an object of integers and nothing
    // in the schema forbids {"4":2,"6":1}, so the shortcut would be correct
    // only under an assumption no validator enforces. The intersection is at
    // most twelve wide.
    //
    // Clamping to the game's own range is deliberately NOT load-bearing: drop
    // it and the extra seats index off the front of `dn`, come back undefined,
    // and get skipped, so every answer is the same and no test can tell the
    // difference. It stays because that is precisely the shape this branch was
    // burned by once -- a safe outcome resting on an out-of-bounds read
    // returning undefined -- and the bounds are stated rather than stumbled on.
    const first = range ? Math.max(range.lo, facet.lo) : facet.lo;
    const last = range ? Math.min(range.hi, facet.hi) : facet.lo;
    let playable = false;
    for (let n = first; n <= last && !playable; n++) {
      const needed = facet.dn ? facet.dn[n - facet.lo] : facet.d;
      playable = needed !== undefined && needed <= held;
    }
    if (!playable) return false;
  }

  // Untouched means no claim was made, so it constrains nothing -- the same
  // reading an unset chip gets everywhere else here. Once anything is ticked
  // the reader has said what they can do, and a game qualifies when everything
  // it asks for is among it. That is why ticking both boxes shows one game
  // fewer than ticking neither: koi-koi wants a pack neither box offers, and
  // "I can do these two things" is a claim that excludes it.
  if (criteria.prep) {
    let held = 0;
    for (const token of criteria.prep.split(",")) held |= PREP[token] ?? 0;
    if ((facet.p & ~held) !== 0) return false;
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
export const PARAMS = ["category", "players", "from", "decks", "minutes", "difficulty", "prep"];

/**
 * The params holding a list rather than one value, comma-separated.
 *
 * Named here rather than inferred from the markup, because readQuery has to
 * validate a list token by token and the print sheet has no markup to infer
 * from. A group that becomes multi-select without joining this set would have
 * its whole value checked against `allowed` as one string, match nothing, and
 * be dropped silently — a filter that stops working rather than one that errors.
 */
export const MULTI = new Set(["category", "prep"]);

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
    if (!value) continue;

    if (!MULTI.has(name)) {
      if (!allowed || allowed[name]?.has(value)) state[name] = value;
      continue;
    }

    // Token by token, so one stale value in a list does not take the rest of
    // the list with it. Order is the order given and duplicates collapse, which
    // is what makes writeQuery(readQuery(s)) settle rather than oscillate.
    /** @type {string[]} */
    const kept = [];
    for (const token of value.split(",")) {
      if (!token || kept.includes(token)) continue;
      if (allowed && !allowed[name]?.has(token)) continue;
      kept.push(token);
    }
    if (kept.length) state[name] = kept.join(",");
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
