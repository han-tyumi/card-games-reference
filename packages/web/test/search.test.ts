/**
 * Search: how the index is built, and how a query is ranked against it.
 *
 * Ranking fails quietly. Nothing throws when "canast" puts Hand and Foot above
 * Canasta — the page just answers the wrong question, and the only way anyone
 * finds out is by typing it. So the real corpus is indexed here and real queries
 * are run against it, including the two that were wrong.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { durationLine, loadGames, playersLine } from "naibi";
import { FIELDS, buildIndex, labelsFor, score, tokenise } from "../assets/search.js";
import { searchRecords } from "../records.ts";

const games = loadGames();
const index = buildIndex(searchRecords(games));

/**
 * Score, asserting the query got a real answer.
 *
 * null means "no opinion" and is a legitimate result for a query of nothing but
 * stop words, so the tests that expect an answer say so rather than reading
 * through a `?.` and quietly passing on undefined.
 */
function hitsFor(query: string, from = index) {
  const hits = score(from, query);
  assert.notEqual(hits, null, `"${query}" produced no opinion at all`);
  return hits!;
}

/** The words the index kept, which is not all of them. */
function postings(built: ReturnType<typeof buildIndex>, word: string): number[] {
  assert.notEqual(built.terms, null);
  return built.terms![word] ?? [];
}

/** Games matching a query, best first. */
function results(query: string): string[] {
  const hits = score(index, query);
  if (!hits) return [];
  return [...hits.entries()]
    .sort((a, b) => b[1].s - a[1].s)
    .map(([doc]) => games[doc]!.name);
}

function rank(query: string, name: string): number {
  return results(query).indexOf(name);
}

// --- tokenising -----------------------------------------------------------

test("words are lowercased runs of letters", () => {
  assert.deepEqual(tokenise("Deal Thirteen Cards"), ["deal", "thirteen", "cards"]);
});

test("apostrophes and internal hyphens stay inside a word", () => {
  assert.deepEqual(tokenise("trick-taking"), ["trick-taking"]);
  assert.deepEqual(tokenise("dealer's"), ["dealer's"]);
});

test("a trailing dash is trimmed rather than indexed", () => {
  assert.deepEqual(tokenise("king- queen"), ["king", "queen"]);
});

test("digits and single letters are not words", () => {
  // Indexing every point value in every scoring section would fill the index
  // with terms nobody searches for. The cost is that "500 Rummy" is found by
  // "rummy", not by "500".
  assert.deepEqual(tokenise("500 Rummy"), ["rummy"]);
  assert.deepEqual(tokenise("a of 7s"), ["of"]);
});

test("punctuation separates", () => {
  assert.deepEqual(tokenise("Ace, two; three."), ["ace", "two", "three"]);
});

// --- building -------------------------------------------------------------

test("a posting records every field a word appears in", () => {
  const built = buildIndex([
    { name: "Slapjack", play: "Slap the jack.", setup: "Deal the whole deck." },
  ]);

  const bitOf = (key: string) => FIELDS.find((f) => f.key === key)!.bit;
  const [doc, mask] = postings(built, "slap");
  assert.equal(doc, 0);
  assert.equal(mask, bitOf("play"));
  assert.equal(postings(built, "slapjack")[1], bitOf("name"));
  assert.equal(postings(built, "deal")[1], bitOf("setup"));
});

test("a word in two fields of one document gets both bits, not two postings", () => {
  const built = buildIndex([{ name: "War", play: "War is declared." }]);
  const bitOf = (key: string) => FIELDS.find((f) => f.key === key)!.bit;

  assert.deepEqual(postings(built, "war"), [0, bitOf("name") | bitOf("play")]);
});

test("postings are flattened to doc, mask pairs", () => {
  const built = buildIndex([
    { name: "Snap" },
    { name: "Snap Dragon" },
    { name: "War" },
    { name: "Whist" },
  ]);

  assert.equal(postings(built, "snap").length, 4);
  assert.equal(postings(built, "snap")[0], 0);
  assert.equal(postings(built, "snap")[2], 1);
});

test("a word in nearly every entry is dropped as useless", () => {
  const built = buildIndex(
    Array.from({ length: 10 }, (_, i) => ({ name: `Game ${i}`, play: "the cards" })),
  );

  assert.deepEqual(postings(built, "cards"), [], "in all ten, so it ranks nothing");
  assert.ok(built.common.includes("cards"), "listed as common, not forgotten");
});

test("a word in most but not all entries is kept", () => {
  const built = buildIndex([
    ...Array.from({ length: 5 }, () => ({ play: "trump" })),
    { play: "no trumps here" },
  ]);
  assert.ok(postings(built, "trump").length > 0, "5 of 6 is under the ceiling");
});

test("the published field table is bit-ascending and complete", () => {
  const built = buildIndex([{ name: "X" }]);
  const bits = built.fields.map(([bit]) => bit);
  assert.deepEqual(bits, [...bits].sort((a, b) => a - b));
  assert.equal(built.fields.length, FIELDS.length);
});

// --- scoring --------------------------------------------------------------

test("an empty query has no opinion, which is not the same as no results", () => {
  assert.equal(score(index, ""), null);
  assert.equal(score(index, "   "), null);
  assert.equal(score(null, "war"), null);
  assert.equal(score({ fields: [], common: [], exact: {}, terms: null }, "war"), null);
});

test("a query nobody wrote about finds nothing", () => {
  assert.equal(hitsFor("xylophone").size, 0);
});

test("every word must match: this is an AND", () => {
  const both = hitsFor("trump partner");
  const trump = hitsFor("trump");
  assert.ok(both.size < trump.size);
  for (const doc of both.keys()) assert.ok(trump.has(doc));
});

test("a word every entry uses does not veto the rest of the query", () => {
  // "card" is in all sixty entries, so it is dropped from the index. Treating
  // it as unmatched made the AND exclude everything, and "Five Card Draw"
  // returned nothing at all.
  assert.ok(index.common.includes("card"), "the fixture assumes card is dropped");
  assert.equal(results("Five Card Draw")[0], "Five Card Draw");
  assert.equal(results("Seven Card Stud")[0], "Seven Card Stud");
  assert.equal(results("Kings in the Corner")[0], "Kings in the Corner");
});

test("a query of nothing but common words has no opinion", () => {
  assert.equal(score(index, "the of and"), null);
});

test("a title made entirely of common words is still findable", () => {
  // "Last One" is an alias of Crazy Eights and every word of it is dropped, so
  // it can only be found as a whole title.
  assert.ok(results("Last One").includes("Crazy Eights"));
});

test("an exact name beats a longer name that contains it", () => {
  // Contract Rummy has "rummy" in its name AND throughout its rules, so on
  // accumulated weight alone it outranked the game actually called Rummy.
  assert.equal(results("rummy")[0], "Rummy");
  assert.equal(results("contract rummy")[0], "Contract Rummy");
  assert.ok(results("rummy").includes("Contract Rummy"), "still a result");
});

test("the exact-title bonus needs the whole query, not a prefix of it", () => {
  const built = buildIndex([
    { name: "War", titles: ["War"], play: "A war of flipping." },
    { name: "War of Attrition", titles: ["War of Attrition"], play: "A slower war." },
    { name: "Snap", titles: ["Snap"], play: "Slap the pile." },
    { name: "Whist", titles: ["Whist"], play: "Take tricks." },
  ]);

  const only = hitsFor("war", built);
  assert.ok(only.get(0)!.s > only.get(1)!.s, "the game called War wins on its name");

  const longer = hitsFor("war of attrition", built);
  assert.ok(longer.get(1)!.s > (longer.get(0)?.s ?? 0), "the longer title wins its own");
});

test("a name match beats the same word buried in prose", () => {
  assert.equal(results("canasta")[0], "Canasta");
  assert.equal(results("cribbage")[0], "Cribbage");
  assert.equal(results("hearts")[0], "Hearts");
});

test('"canast" finds Canasta, not the game that aliases it', () => {
  // Hand and Foot is aliased "Hand and Foot Canasta". While the name and the
  // aliases shared one field, and prefix hits were discounted everywhere, the
  // alias plus prose beat the real name and Hand and Foot came first.
  assert.equal(results("canast")[0], "Canasta");
  assert.ok(rank("canast", "Hand and Foot") > 0, "still a result, just not the first");
});

test('"slap" finds Slapjack', () => {
  // Egyptian Ratscrew is a game you slap in and says so throughout its rules;
  // Slapjack is the game called that. The name has to win.
  assert.equal(results("slap")[0], "Slapjack");
});

test("a prefix of a finished word still ranks below the whole word", () => {
  // "spade" is a word in its own right, so an exact hit outranks "spades".
  assert.ok(hitsFor("spades").size > 0 && hitsFor("spade").size > 0);
  assert.equal(results("spades")[0], "Spades");
});

test("only the last word is matched as a prefix", () => {
  // "canast" alone matches Canasta; followed by another word it must not,
  // because a finished word meant loosely is noise.
  assert.ok(hitsFor("canast").size > 0);
  assert.equal(hitsFor("canast rummy").size, 0);
});

test("a one-letter query does not prefix-match the whole corpus", () => {
  const hits = score(index, "z");
  assert.equal(hits, null, "a single letter is not a word");
});

test("a hit reports every field it was found in", () => {
  const doc = games.findIndex((g) => g.name === "Canasta");
  const labels = labelsFor(index.fields, hitsFor("canasta").get(doc)!.m);

  assert.ok(labels.includes("name"));
  assert.deepEqual(labels, [...new Set(labels)], "no field named twice");
});

test("labels name the strongest fields first, and only a couple of them", () => {
  const { fields } = buildIndex([{ name: "X" }]);

  assert.deepEqual(labelsFor(fields, 1 | 8), ["name", "play"]);
  assert.deepEqual(labelsFor(fields, 8 | 1), ["name", "play"], "weight, not bit order");
  assert.deepEqual(labelsFor(fields, 0), []);

  // Matching almost everywhere is not a signal, so it is not reported as one.
  const everywhere = fields.reduce((mask, [bit]) => mask | bit, 0);
  assert.deepEqual(labelsFor(fields, everywhere), ["name", "tags"]);
  assert.equal(labelsFor(fields, everywhere, 4).length, 4);
});

test("searching a game's exact name returns it first, for every game", () => {
  // The blunt version of the ranking rule, over the whole corpus. A game you
  // cannot find by typing its name is the one unforgivable search result.
  // "500 Rummy" reaches search as "rummy", because a number is not a word --
  // the same query Rummy answers. Where two games are genuinely indistinguishable
  // to a searcher, either answer is right, so only unambiguous names are held
  // to this.
  const claims = new Map<string, number>();
  for (const game of games) {
    const key = tokenise(game.name).join(" ");
    claims.set(key, (claims.get(key) ?? 0) + 1);
  }

  const misses: string[] = [];
  for (const game of games) {
    const key = tokenise(game.name).join(" ");
    if (key === "" || claims.get(key)! > 1) continue;
    if (results(game.name)[0] !== game.name) misses.push(game.name);
  }
  assert.deepEqual(misses, []);
  assert.ok(claims.size >= games.length - 2, "almost every name is unambiguous");
});

test("searching an alias finds the game that carries it", () => {
  const misses: string[] = [];
  for (const game of games) {
    for (const alias of game.aliases) {
      if (tokenise(alias).length === 0) continue;
      const found = results(alias);
      if (!found.includes(game.name)) misses.push(`${alias} -> ${game.name}`);
    }
  }
  assert.deepEqual(misses, []);
});


// --- the pack -------------------------------------------------------------

test("a query for words in no entry returns nothing", () => {
  // The control, and it comes first deliberately: every assertion below is
  // worth nothing if this harness answers everything. A verification pass in
  // this project once reported 22 of 30 entries checked with its network down,
  // and the phrase searching that "cleared" the earlier passes had never
  // worked at all.
  //
  // Read together with the tests below, which fail if it answers NOTHING, this
  // pins the harness from both sides.
  for (const absent of ["quorbling", "zaxflutter", "backgammon", "mahjong"]) {
    assert.deepEqual(results(absent), [], `"${absent}" matched something`);
  }
});

test("a word that lives only in the deck line is findable at all", () => {
  // Measured, and the reason `decks` is indexed and not merely
  // `special_deck`: "pencil" appears in no searchable field anywhere in the
  // corpus except cribbage's deck line -- "plus a cribbage board (or pencil
  // and paper)" -- and returned nothing whatsoever before this.
  assert.deepEqual(results("pencil"), ["Cribbage"]);
});

test("a reader who knows their deck must be stripped can search for that", () => {
  // "stripped" went from 2 games to 15. The word is how the corpus describes
  // the operation, and it was almost entirely unsearchable.
  const found = results("stripped");
  const expected = games
    .filter((g) => /\bstripped\b/i.test(searchRecords(games)[games.indexOf(g)]!.pack))
    .map((g) => g.name);
  assert.ok(expected.length > 5, "the corpus no longer describes stripping, so this proves nothing");
  for (const name of expected) {
    assert.ok(found.includes(name), `${name} is described as stripped and was not found`);
  }
});

test("every distinctive word of a game's pack finds that game", () => {
  // Derived from the corpus rather than from a list of examples, so an entry
  // added with an unusual pack is covered without anyone remembering this file.
  // Words the index deliberately ranks nothing -- those in nearly every entry,
  // like "card" and "deck" -- are excluded, since not ranking them is the
  // point of that rule rather than a failure of this one.
  const records = searchRecords(games);
  const frequency = new Map<string, number>();
  for (const record of records) {
    for (const word of new Set(tokenise(Object.values(record).flat().join(" ")))) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }

  const misses: string[] = [];
  for (const [i, record] of records.entries()) {
    for (const word of new Set(tokenise(record.pack))) {
      if (word.length < 3 || (frequency.get(word) ?? 0) >= games.length * 0.9) continue;
      if (!results(word).includes(games[i]!.name)) misses.push(`${games[i]!.id}: "${word}"`);
    }
  }
  assert.deepEqual(misses, []);
});

test("naming a pack still leads with the game that uses it", () => {
  // These already worked before the pack was indexed, because each query
  // carries the game's own name -- the design document's claim that they
  // "return nothing" was wrong, and was checked here rather than repeated.
  // Pinned so the new field cannot displace them.
  for (const [query, name] of [
    ["euchre deck", "Euchre"],
    ["piquet pack", "Piquet"],
    ["skat pack", "Skat"],
    ["hanafuda", "Koi-Koi"],
  ] as const) {
    assert.equal(results(query)[0], name, `"${query}" no longer leads with ${name}`);
  }
});

test("a pack match does not outrank a name match", () => {
  // Weight 3 sits above prose and below aliases on purpose: a game whose deck
  // line mentions a pinochle deck must not beat the game called Pinochle.
  assert.equal(results("pinochle")[0], "Pinochle");
  assert.equal(results("euchre")[0], "Euchre");
  assert.equal(results("canasta")[0], "Canasta");
});

test("every game with a named pack carries it in the index", () => {
  const records = searchRecords(games);
  for (const [i, game] of games.entries()) {
    if (!game.equipment.special_deck) continue;
    assert.ok(
      records[i]!.pack.includes(game.equipment.special_deck),
      `${game.id}'s pack is not in its search record`,
    );
    assert.ok(records[i]!.pack.includes(game.decks), `${game.id}'s deck line is not in its record`);
  }
});

test("the pack took the next free bit, and the published ones did not move", () => {
  // The bits are baked into every index already cached on someone's phone, so
  // a renumbering would mislabel where every existing hit was found.
  assert.deepEqual(
    FIELDS.map((f) => [f.key, f.bit]),
    [
      ["name", 1],
      ["tags", 2],
      ["setup", 4],
      ["play", 8],
      ["goal_and_scoring", 16],
      ["variants", 32],
      ["alias", 64],
      ["pack", 128],
    ],
  );
});

test("a pack hit says it was found in the deck", () => {
  const hits = hitsFor("stripped");
  const belote = games.findIndex((g) => g.id === "belote");
  const mask = hits.get(belote)?.m ?? 0;
  assert.ok(mask & 128, "a stripped-pack hit is not attributed to the deck");
  assert.ok(labelsFor(index.fields, mask).includes("the deck"));
});

// --- names two games answer to --------------------------------------------

test("an alias two games share finds both of them, and says why", () => {
  // `Slam` is an alias on Speed and on Spit, and both are honestly called it.
  // The decision (0022) is to keep both rather than make one of them give the
  // name up, because dropping either means a reader searching the name they
  // know finds nothing. What that decision rests on is this: the search has to
  // return every game that answers to the word, and each card has to say why it
  // is in the list. A ranking that quietly kept only the best claimant would
  // look like a working search and be the exact failure the decision assumed
  // away.
  //
  // Derived from the corpus rather than written out, so a shared alias added
  // later is covered by this without anyone remembering to extend it.
  const claimants = new Map<string, number[]>();
  games.forEach((game, doc) => {
    for (const alias of game.aliases) {
      const key = alias.trim().toLowerCase();
      claimants.set(key, [...(claimants.get(key) ?? []), doc]);
    }
  });

  const shared = [...claimants].filter(([, docs]) => docs.length > 1);
  assert.ok(
    shared.length > 0,
    "no alias is shared any more -- delete this test or the decision it defends",
  );

  for (const [alias, docs] of shared) {
    const hits = hitsFor(alias);
    for (const doc of docs) {
      const hit = hits.get(doc);
      assert.ok(hit, `"${alias}" does not find ${games[doc]!.name}, which answers to it`);
      // Not merely present: present with a reason the card can print. Both
      // games matched on `alias`, which is what "found in other names" is.
      assert.ok(
        hit.m & 64,
        `"${alias}" finds ${games[doc]!.name} without attributing it to other names`,
      );
    }

    // And they are the answer, not buried under games that merely mention the
    // word in prose -- Contract Bridge says "slam" in its scoring, legitimately.
    const best = [...hits.entries()].sort((a, b) => b[1].s - a[1].s).slice(0, docs.length);
    assert.deepEqual(
      best.map(([doc]) => doc).sort(),
      [...docs].sort(),
      `"${alias}" ranks something else above the games actually called it`,
    );
  }
});

test("games sharing an alias are told apart by what their cards print", () => {
  // The reader's job after searching a shared name is to work out which one
  // they meant, and the only thing they have to do it with is the card: the
  // name, then players, time, difficulty and family. Two entries answering to
  // one alias whose cards read identically would leave them with a coin flip.
  //
  // Speed and Spit differ in two of the four -- 2-4 players against 2, and
  // 5-15 minutes against 10-25 -- which is what makes "look a bit closer" a
  // real instruction rather than a hope.
  const card = (game: (typeof games)[number]) =>
    [playersLine(game), durationLine(game), game.difficulty, game.category].join(" · ");

  const claimants = new Map<string, number[]>();
  games.forEach((game, doc) => {
    for (const alias of game.aliases) {
      const key = alias.trim().toLowerCase();
      claimants.set(key, [...(claimants.get(key) ?? []), doc]);
    }
  });

  for (const [alias, docs] of claimants) {
    if (docs.length < 2) continue;
    const cards = docs.map((doc) => card(games[doc]!));
    assert.equal(
      new Set(cards).size,
      cards.length,
      `${docs.map((d) => games[d]!.name).join(" and ")} both answer to "${alias}" and print ` +
        `the same card, so nothing on screen tells them apart`,
    );
  }
});
