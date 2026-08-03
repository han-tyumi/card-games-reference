/**
 * The search index: built here, queried here.
 *
 * Both halves live in one file on purpose. The builder decides what counts as a
 * word and the browser has to make the same decision, or a query tokenised one
 * way silently misses terms indexed the other way — a failure with no error
 * message and no symptom except worse results. They share a tokeniser because
 * they are the same question asked twice.
 *
 * Plain JavaScript with no imports, so the browser loads it as a module and the
 * build imports it directly. Nothing here touches the DOM or the filesystem.
 */

/** @typedef {{ key: string, bit: number, weight: number, label: string }} Field */
/** @typedef {[number, number, string]} PublishedField bit, weight, label */
/** @typedef {{ s: number, m: number }} Hit score, and the fields it was found in */
/**
 * @typedef {object} Index
 * @property {PublishedField[]} fields
 * @property {string[]} common words in so many entries they rank nothing
 * @property {Record<string, number[]>} exact whole title -> [doc, bonus, ...]
 * @property {Record<string, number[]> | null} terms word -> [doc, mask, ...]
 */

/**
 * Where a word was found, and what that is worth.
 *
 * The primary name outranks an alias by a wide margin. Otherwise Hand and Foot,
 * aliased "Hand and Foot Canasta", ties with Canasta for "canasta" — and then
 * wins on prose, which is exactly backwards.
 *
 * Bits are fixed: they are baked into every published index, so a new field
 * takes the next free bit rather than renumbering.
 *
 * @type {Field[]}
 */
export const FIELDS = [
  { key: "name", bit: 1, weight: 14, label: "name" },
  { key: "tags", bit: 2, weight: 6, label: "tags" },
  { key: "setup", bit: 4, weight: 1, label: "setup" },
  { key: "play", bit: 8, weight: 2, label: "play" },
  { key: "goal_and_scoring", bit: 16, weight: 1, label: "scoring" },
  { key: "variants", bit: 32, weight: 1, label: "variants" },
  { key: "alias", bit: 64, weight: 5, label: "other names" },
  // "euchre deck", "piquet pack" and "skat pack" are verbatim in the data and
  // returned nothing at all, because the pack was the one thing about a game
  // this index did not carry. Weighted between prose and aliases: typing a
  // pack should find the games that use it, but a game merely mentioning one
  // in its variants must not outrank the game named after it.
  { key: "pack", bit: 128, weight: 3, label: "the deck" },
];

const NAME_BIT = 1;

/** A prefix match is worth less than a whole word — but see score(). */
const PREFIX_PENALTY = 0.6;

/** Shorter than this and a prefix matches most of the corpus, so don't try. */
const MIN_PREFIX = 2;

/** A word in this share of all entries ("card", "player") ranks nothing. */
const UBIQUITOUS = 0.9;

/**
 * Added when the whole query is exactly a game's name or one of its aliases.
 *
 * Large enough to settle it outright: no accumulation of prose mentions can
 * reach it, so typing a game's name puts that game first even when a longer
 * name contains it. Without this, "Rummy" led with Contract Rummy, which has
 * the word in its name AND all through its rules.
 */
const EXACT_NAME = 1000;
const EXACT_ALIAS = 900;

/**
 * Words are runs of letters, apostrophes and hyphens, starting with a letter.
 *
 * Digits are excluded deliberately: "500 Rummy" and "Sixty-Six" are found by
 * their words, and indexing every point value in every scoring section would
 * bloat the index with terms nobody searches for.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function tokenise(text) {
  return (text.toLowerCase().match(/[a-z][a-z'-]+/g) ?? []).map((word) =>
    word.replace(/^-+|-+$/g, ""),
  );
}

/**
 * The words of a title, normalised the same way a query is.
 * @param {string} text
 * @returns {string}
 */
function titleKey(text) {
  return tokenise(text).join(" ");
}

/**
 * Build the index from one text record per document.
 *
 * A record maps field keys to text, plus an optional `titles` array — the game's
 * name followed by its aliases — used for the exact-title bonus. The document's
 * identity is its position in the array, which is the order the page renders, so
 * a hit is an array index.
 *
 * The score is a pure function of the field bitmask — each field contributes
 * its weight once — so storing a score per posting would be a third of the
 * index spent on a number the client can derive.
 *
 * @param {Record<string, string | string[] | undefined>[]} records
 * @returns {Index}
 */
export function buildIndex(records) {
  /** @type {Map<string, Map<number, number>>} term -> doc -> field bitmask */
  const terms = new Map();
  /** @type {Map<string, number[]>} whole title -> [doc, bonus, doc, bonus, ...] */
  const exact = new Map();

  records.forEach((record, doc) => {
    for (const { key, bit } of FIELDS) {
      const text = record[key];
      // A weighted field is text; `titles` is the one array a record carries,
      // and it is read below rather than indexed.
      if (typeof text !== "string" || !text) continue;
      for (const word of new Set(tokenise(text))) {
        let postings = terms.get(word);
        if (!postings) terms.set(word, (postings = new Map()));
        postings.set(doc, (postings.get(doc) ?? 0) | bit);
      }
    }

    const titles = Array.isArray(record.titles) ? record.titles : [];
    titles.forEach((title, i) => {
      const key = titleKey(title);
      if (!key) return;
      const bonus = i === 0 ? EXACT_NAME : EXACT_ALIAS;
      const entries = exact.get(key) ?? [];
      // A game can reach the same key twice (a name and an alias that tokenise
      // alike); the first, stronger claim stands.
      if (!entries.includes(doc)) exact.set(key, [...entries, doc, bonus]);
    });
  });

  const ceiling = Math.max(1, Math.floor(records.length * UBIQUITOUS));
  /** @type {Record<string, number[]>} */
  const out = {};
  /** @type {string[]} */
  const common = [];
  for (const [word, postings] of terms) {
    // Words in nearly every entry cost bytes and rank nothing. They are still
    // listed, because a query has to tell "everyone says this" apart from
    // "nobody says this" -- see score().
    if (postings.size > ceiling) common.push(word);
    // Flattened to [doc, mask, doc, mask, ...]: half the punctuation of an
    // array of pairs, over tens of thousands of postings.
    else out[word] = [...postings].flat();
  }

  return {
    fields: FIELDS.map((f) => [f.bit, f.weight, f.label]),
    common,
    exact: Object.fromEntries(exact),
    terms: out,
  };
}

/**
 * Weight of one posting's bitmask, with prefix hits outside the name discounted.
 * @param {PublishedField[]} fields
 * @param {number} mask
 * @param {number} penalty
 * @returns {number}
 */
function weigh(fields, mask, penalty) {
  let total = 0;
  for (const [bit, weight] of fields) {
    if ((mask & bit) === 0) continue;
    // A prefix hit on a game's NAME is a strong signal, not a weak one: typing
    // "canast" means Canasta, even though prose elsewhere may use the finished
    // word more often. Only the other fields are discounted.
    total += weight * (bit === NAME_BIT ? 1 : penalty);
  }
  return total;
}

/**
 * Score every document against a query.
 *
 * Every word must hit something: this is an AND, not an OR. The final word is
 * matched as a prefix as well, so results narrow while you are still typing it;
 * earlier words must match in full, because once you have finished a word,
 * meaning it loosely is not helpful.
 *
 * Words the index dropped as ubiquitous are skipped rather than failing the AND.
 * They carry no information, and treating them as unmatched meant a game's own
 * name found nothing: "Five Card Draw" contains "card", every entry contains
 * "card", so the query excluded all sixty games including the one being typed.
 *
 * Returns a Map of document index to `{ s, m }` — score, and the union of the
 * field bits that matched, which is what lets a result say WHERE it was found.
 * Returns null for an empty query or a missing index, meaning "no opinion",
 * which is not the same as the empty Map meaning "nothing matched".
 *
 * @param {Index | null | undefined} index
 * @param {string} query
 * @returns {Map<number, Hit> | null}
 */
export function score(index, query) {
  const all = tokenise(query);
  if (all.length === 0) return null;
  if (!index || !index.terms) return null;

  const { fields, terms } = index;
  const common = new Set(index.common ?? []);
  const words = all.filter((word) => !common.has(word));

  /** @type {Map<number, Hit> | null} */
  let running = null;

  // A query of nothing but stop words narrows nothing, so it skips the loop and
  // falls through to the exact-title check -- "Last One" is every-entry words
  // twice over, and is also an alias of Crazy Eights.
  words.forEach((word, i) => {
    /** @type {Map<number, Hit>} */
    const hits = new Map();

    /**
     * @param {number[]} postings flattened [doc, mask, doc, mask, ...]
     * @param {number} penalty
     */
    const consider = (postings, penalty) => {
      for (let p = 0; p < postings.length; p += 2) {
        const doc = /** @type {number} */ (postings[p]);
        const mask = /** @type {number} */ (postings[p + 1]);
        const s = weigh(fields, mask, penalty);
        const previous = hits.get(doc);
        // The best-scoring way this word matched, but every field it matched
        // in: the score picks a winner, the mask is a union.
        if (previous) {
          previous.m |= mask;
          if (s > previous.s) previous.s = s;
        } else {
          hits.set(doc, { s, m: mask });
        }
      }
    };

    if (terms[word]) consider(terms[word], 1);

    if (i === words.length - 1 && word.length >= MIN_PREFIX) {
      for (const term in terms) {
        const postings = terms[term];
        if (postings && term !== word && term.startsWith(word)) {
          consider(postings, PREFIX_PENALTY);
        }
      }
    }

    if (running === null) {
      running = hits;
      return;
    }

    /** @type {Map<number, Hit>} */
    const merged = new Map();
    for (const [doc, value] of hits) {
      const previous = running.get(doc);
      if (previous) merged.set(doc, { s: previous.s + value.s, m: previous.m | value.m });
    }
    running = merged;
  });

  // A query that is exactly a game's name means that game, whatever the prose
  // elsewhere adds up to. Applied once per document rather than once per word,
  // and to the whole query — "rummy" is Rummy, "contract rummy" is not.
  const titled = (index.exact ?? {})[all.join(" ")];
  if (titled) {
    if (running === null) running = new Map();
    for (let p = 0; p < titled.length; p += 2) {
      const doc = /** @type {number} */ (titled[p]);
      const bonus = /** @type {number} */ (titled[p + 1]);
      const previous = running.get(doc);
      if (previous) previous.s += bonus;
      // A title made entirely of stop words matched nothing above. Surfacing it
      // here is the whole point of the rule.
      else running.set(doc, { s: bonus, m: NAME_BIT });
    }
  }

  // Still null means the query said nothing the index can act on, which is not
  // the same as the empty Map meaning nothing matched.
  return running;
}

/**
 * Where a hit came from, most telling first.
 *
 * A multi-word query typically matches somewhere in nearly every section, and
 * "found in name, setup, play, scoring, variants, other names" says nothing at
 * all. Only the strongest couple are named — which is the useful part anyway,
 * since "in play" is the difference between a game called Slapjack and a game
 * you slap in.
 *
 * @param {PublishedField[]} fields
 * @param {number} mask
 * @param {number} [limit]
 * @returns {string[]}
 */
export function labelsFor(fields, mask, limit = 2) {
  return fields
    .filter(([bit]) => (mask & bit) !== 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([, , label]) => label);
}
