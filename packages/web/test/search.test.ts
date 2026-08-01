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

import { loadGames } from "naibi";
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
