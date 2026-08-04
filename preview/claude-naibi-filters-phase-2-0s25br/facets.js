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
 * What a game asks you to do to a deck before you can play it.
 *
 * Two independent obstacles, not degrees of one thing. A ceiling would claim
 * that accepting the strictest accepts everything milder, and someone whose
 * deck has no jokers can remove cards happily while still being unable to add
 * one — neither obstacle contains the other in either direction.
 *
 * Each box **excludes** the games carrying its bit, so ticking more shows
 * fewer, which is how every other control on the page behaves. The first draft
 * had these as capabilities — "I have jokers", matched by subset — and that
 * model could not express the most common request on the axis at all: nothing
 * ticked meant "no claim" and showed all 72, ticking both showed 71, and the 50
 * games playable with a plain 52 were unreachable at every setting. The sets
 * for a single box are the same either way round; only the polarity was wrong.
 *
 * This is the entire vocabulary the checkboxes offer, so an unknown token from
 * a URL contributes nothing rather than being read as a number.
 *
 * @type {Record<string, number>}
 */
export const PREP = { jokers: 1, strip: 2 };

/**
 * A pack that no standard deck becomes — hanafuda.
 *
 * Deliberately outside PREP: it is not "removing cards plus adding jokers", it
 * is a thing you either own or do not, and pretending otherwise is the
 * modelling error again. A game carrying it is excluded the moment either box
 * is ticked, because both of them say "my own deck, as it is", which a
 * purpose-built pack is not. That is how `standard_decks: 0` already behaves
 * under the deck count.
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

  // Each ticked box rules out the games carrying its bit, so ticking more
  // shows fewer -- the same direction as every other control here. Untouched
  // rules out nothing, which is the same reading an unset chip gets everywhere
  // else. Ticking both is "a plain 52 and nothing done to it", the most common
  // request on this axis and the one the first draft could not express.
  //
  // A purpose-built pack goes with either box, because both of them say "my
  // own deck, as it is", and hanafuda is not that.
  if (criteria.prep) {
    let refused = 0;
    for (const token of criteria.prep.split(",")) refused |= PREP[token] ?? 0;
    if (refused && facet.p & (refused | PREP_OWN_PACK)) return false;
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
 * The floors the reader may widen down to, each labelled with what it would show.
 *
 * Only values at or below the chosen count, so no invalid combination is
 * reachable from the control at all — there is no push rule to learn, which is
 * what two free bounds would have required.
 *
 * The counts are live because the cliff is otherwise invisible: a table of six
 * has no way to discover that dropping to four takes them from 36 games to 56,
 * and the payoff sits at irregular cliffs rather than a fixed offset, because
 * the corpus clusters at maxima of 4 and 6.
 *
 * Each count comes from plan() run with that floor and everything else the
 * reader has already set, so an option cannot promise a different list from the
 * one the page then renders. Twelve passes over the facets per keystroke.
 *
 * @param {Facet[]} facets
 * @param {Record<string, string>} state
 * @param {Map<number, {s: number, m: number}> | null} hits
 * @returns {{value: string, label: string, count: number}[]}
 */
export function floorOptions(facets, state, hits) {
  const range = playerRange(state);
  // No count chosen: there is nothing for a floor to be below. A count of one:
  // there is nothing below it. Both leave a control that cannot change the
  // list, and a solitaire player was being asked "might you be fewer?" — so
  // both return nothing and the page hides the control on an empty list rather
  // than on a rule of its own.
  if (!range || range.hi < 2) return [];

  const options = [];
  for (let n = 1; n <= range.hi; n++) {
    const { order } = plan(facets, { ...state, from: String(n) }, hits);
    options.push({
      value: String(n),
      label: `${n} — ${order.length} game${order.length === 1 ? "" : "s"}`,
      count: order.length,
    });
  }
  return options;
}

/**
 * What the reader asked for, said in words, one fragment per control.
 *
 * Shared by the index's empty state and the print sheet's header line, because
 * they are the same sentence for the same reason — a list that is short, or
 * absent, with no controls visible to explain why. Written twice they would
 * disagree, and the printed one is the copy nobody looks at until it is on
 * paper.
 *
 * Fragments are in the order the controls appear on the page, so reading the
 * line and scanning the column agree with each other.
 *
 * @param {Record<string, string>} state
 * @param {Record<string, string>} families category id to label
 * @returns {string[]}
 */
export function describe(state, families) {
  const said = [];

  const range = playerRange(state);
  if (range) {
    said.push(
      range.lo === range.hi
        ? `${range.hi} player${range.hi === 1 ? "" : "s"}`
        : `${range.lo}-${range.hi} players`,
    );
  }
  if (state.decks) said.push(`${state.decks} deck${state.decks === "1" ? "" : "s"}`);
  if (state.prep) {
    const refused = state.prep
      .split(",")
      .filter((token) => token in PREP)
      .map((token) => (token === "jokers" ? "no jokers" : "no cards removed"));
    // Both together are the plain-52 case, and saying it as one phrase beats
    // reciting the two exclusions that add up to it.
    if (refused.length === 2) said.push("a plain deck, as it is");
    else if (refused[0]) said.push(refused[0]);
  }
  if (state.minutes) said.push(`${state.minutes} minutes or less`);
  if (state.difficulty) said.push(`${state.difficulty} or simpler`);
  // Several families are an OR, and the word has to say so: "trick-taking,
  // rummy" reads as a narrowing everywhere else on the page.
  if (state.category) {
    said.push(state.category.split(",").map((c) => families[c] ?? c).join(" or "));
  }
  if (state.q) said.push(`matching “${state.q}”`);

  return said;
}

/**
 * "a", "a and b", "a, b and c" — an English list, not a comma-joined array.
 * @param {string[]} parts
 * @returns {string}
 */
function listed(parts) {
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Why the list is empty, in one sentence.
 *
 * An empty list with a row of controls above it is a puzzle: the reader has to
 * work out which of six things they set is the one that did it. Naming them
 * costs a sentence.
 *
 * Solitaire against a player count gets its own, because it is not a mistake
 * the reader made. All eleven solitaire games are one-player, and no one-player
 * game sits outside the family, so the two controls agreeing is redundant and
 * the two disagreeing is always empty — a fact about the corpus, which the
 * reader has no way to know and no reason to guess at.
 *
 * @param {Record<string, string>} state
 * @param {Record<string, string>} families
 * @returns {string}
 */
export function emptyReason(state, families) {
  const range = playerRange(state);
  if (state.category === "solitaire" && range && range.lo > 1) {
    return "Every solitaire game here is played by exactly one person, so none of them seats that many.";
  }

  const said = describe(state, families);
  return said.length ? `Nothing matches ${listed(said)}.` : "Nothing matches.";
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
 * Two signals order the list besides the search score, and NEITHER filters.
 * `ideal` would be a terrible gate — no game in the corpus is ideal at seven,
 * so filtering on it would empty the list there while looking like it was
 * working — and coverage would hide exactly the games overlap exists to keep.
 * They are stated as one comparator with a declared winner because two sorts
 * arriving in the same function with no precedence is how one of them silently
 * stops working:
 *
 *     with a query:  score ↓ · covers ↓ · ideal ↓ · source order
 *     without one:            covers ↓ · ideal ↓ · source order
 *
 * The sort is stable, so source order is what holds inside every group rather
 * than something arbitrary.
 *
 * @param {Facet[]} facets
 * @param {Record<string, string>} state
 * @param {Map<number, {s: number, m: number}> | null} hits ranked search results
 * @returns {{order: number[], count: string, marks: Map<number, string>}}
 */
export function plan(facets, state, hits) {
  const range = playerRange(state);
  /** @type {[number, number, number, number][]} index, score, covers, ideal */
  const ranked = [];

  facets.forEach((facet, i) => {
    if (!matches(facet, state)) return;
    let score = 0;
    if (state.q) {
      const hit = hits ? hits.get(i) : nameMatch(facet, state.q) ? { s: 1, m: 0 } : null;
      if (!hit) return;
      score = hit.s;
    }
    ranked.push([
      i,
      score,
      range && facet.lo <= range.lo && facet.hi >= range.hi ? 1 : 0,
      range && facet.i >= range.lo && facet.i <= range.hi ? 1 : 0,
    ]);
  });

  // The score only ranks when the index answered; the fallback has no scores
  // worth sorting on. Coverage and ideal still do, which is why they are not
  // inside that condition — they are facts about the game, not about the query.
  const scored = Boolean(state.q && hits);
  ranked.sort((a, b) => (scored ? b[1] - a[1] : 0) || b[2] - a[2] || b[3] - a[3]);

  // Said on the card, not just sorted for, because "these sort first" is
  // invisible. Only when the range is wider than one: at a single count,
  // coverage and overlap are the same set, so every card would carry it and it
  // would mean nothing. The wording lives here rather than in app.js for the
  // same reason countLabel does — it is testable here and not there.
  /** @type {Map<number, string>} */
  const marks = new Map();
  if (range && range.hi > range.lo) {
    for (const [i, , covers] of ranked) {
      if (covers) marks.set(i, `plays with any of ${range.lo}-${range.hi}`);
    }
  }

  return {
    order: ranked.map(([i]) => i),
    count: countLabel(ranked.length, facets.length),
    marks,
  };
}
