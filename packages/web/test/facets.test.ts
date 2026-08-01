/**
 * The filter chips.
 *
 * These answer "what can we play right now", and the way they fail is by saying
 * yes when the answer is no — a game shown under "1 deck" that actually needs a
 * hanafuda pack, or under "30 minutes" when it has no ending. Nothing errors;
 * someone just reaches for a deck they do not own.
 *
 * The same mistake was made once already in the command-line picker, where
 * `standard_decks: 0` passed a `<= 1` test. Both halves are pinned here: the
 * facts extracted from each entry, and the predicate the page runs on them.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { loadGames } from "naibi";
import { DIFFICULTY, matches } from "../assets/facets.js";
import { facetsFor } from "../records.ts";
import type { Facet } from "../records.ts";

const games = loadGames();
const facets = facetsFor(games);

/** The games a set of chips leaves showing. */
function shown(criteria: Parameters<typeof matches>[1]): string[] {
  return games.filter((_, i) => matches(facets[i]!, criteria)).map((g) => g.name);
}

const facet = (fields: Partial<Facet> = {}): Facet => ({
  s: "test",
  lo: 2,
  hi: 4,
  d: 1,
  max: 30,
  diff: "easy",
  ...fields,
});

// --- extraction -----------------------------------------------------------

test("one facet per game, in the same order the page renders", () => {
  assert.equal(facets.length, games.length);
  for (const [i, game] of games.entries()) {
    assert.equal(facets[i]!.lo, game.players.min);
    assert.equal(facets[i]!.hi, game.players.max);
    assert.equal(facets[i]!.d, game.equipment.standard_decks);
    assert.equal(facets[i]!.diff, game.difficulty);
  }
});

test("an open-ended duration has no upper bound", () => {
  const open = games.filter((g) => g.duration_minutes.endsWith("+"));
  assert.ok(open.length > 0, "no open-ended game in the corpus to check");

  for (const game of open) {
    const i = games.indexOf(game);
    assert.equal(facets[i]!.max, null, `${game.id} claims an end it does not have`);
  }
});

test("a closed range reports its upper bound", () => {
  const closed = games.find((g) => /^\d+-\d+$/.test(g.duration_minutes))!;
  const [, high] = /^(\d+)-(\d+)$/.exec(closed.duration_minutes)!.slice(1);
  assert.equal(facets[games.indexOf(closed)]!.max, Number(high));
});

test("the fallback text carries the name, aliases, category and tags", () => {
  const canasta = games.findIndex((g) => g.name === "Canasta");
  const text = facets[canasta]!.s;

  assert.ok(text.includes("canasta"));
  assert.ok(text.includes("rummy"), "the category label is searchable");
  assert.equal(text, text.toLowerCase(), "compared against a lowercased query");
});

// --- the predicate --------------------------------------------------------

test("no criteria shows everything", () => {
  assert.equal(shown({}).length, games.length);
  assert.equal(shown({ players: "", decks: "", minutes: "", difficulty: "" }).length, games.length);
});

test("a player count has to fall inside the game's range", () => {
  assert.equal(matches(facet({ lo: 2, hi: 4 }), { players: "3" }), true);
  assert.equal(matches(facet({ lo: 2, hi: 4 }), { players: "2" }), true, "inclusive low");
  assert.equal(matches(facet({ lo: 2, hi: 4 }), { players: "4" }), true, "inclusive high");
  assert.equal(matches(facet({ lo: 2, hi: 4 }), { players: "1" }), false);
  assert.equal(matches(facet({ lo: 2, hi: 4 }), { players: "5" }), false);
});

test("a game needing its own pack never shows under a deck count", () => {
  // The regression: 0 decks satisfies "<= 1 deck" arithmetically, and a
  // hanafuda game surfaced for someone holding a 52-card pack.
  assert.equal(matches(facet({ d: 0 }), { decks: "1" }), false);
  assert.equal(matches(facet({ d: 0 }), { decks: "2" }), false);
  assert.equal(matches(facet({ d: 0 }), {}), true, "still browsable with no filter");
});

test("the corpus actually contains a game with no standard deck", () => {
  // Otherwise the rule above is tested only against a fixture and could stop
  // mattering without anyone noticing.
  const special = games.filter((g) => g.equipment.standard_decks === 0);
  assert.ok(special.length > 0, "nothing exercises the special-deck path");

  for (const game of special) {
    assert.ok(!shown({ decks: "1" }).includes(game.name), `${game.id} shown under 1 deck`);
    assert.ok(!shown({ decks: "2" }).includes(game.name), `${game.id} shown under 2 decks`);
  }
});

test("a deck count means what you have, not what the game wants exactly", () => {
  assert.equal(matches(facet({ d: 1 }), { decks: "2" }), true, "one deck fits in two");
  assert.equal(matches(facet({ d: 2 }), { decks: "1" }), false);
  assert.equal(matches(facet({ d: 2 }), { decks: "2" }), true);
});

test("a game with no ending is never promised to finish in time", () => {
  assert.equal(matches(facet({ max: null }), { minutes: "30" }), false);
  assert.equal(matches(facet({ max: null }), {}), true);
  assert.equal(matches(facet({ max: 30 }), { minutes: "30" }), true, "inclusive");
  assert.equal(matches(facet({ max: 45 }), { minutes: "30" }), false);
});

test("difficulty is a ceiling, not an exact match", () => {
  assert.equal(matches(facet({ diff: "simple" }), { difficulty: "medium" }), true);
  assert.equal(matches(facet({ diff: "medium" }), { difficulty: "medium" }), true);
  assert.equal(matches(facet({ diff: "complex" }), { difficulty: "medium" }), false);
});

test("every difficulty in the data is ranked", () => {
  // An unranked value compares as undefined and silently passes every filter.
  for (const game of games) {
    assert.notEqual(
      DIFFICULTY[game.difficulty],
      undefined,
      `${game.id}: difficulty "${game.difficulty}" has no rank`,
    );
  }
});

test("criteria combine, and each one only narrows", () => {
  const players = shown({ players: "2" });
  const both = shown({ players: "2", decks: "1" });

  assert.ok(both.length > 0, "nothing survives a very ordinary pair of filters");
  assert.ok(both.length <= players.length);
  for (const name of both) assert.ok(players.includes(name));
});

test("a solitaire shows for one player and a partnership game does not", () => {
  const solo = shown({ players: "1" });
  assert.ok(solo.length > 0);

  for (const name of solo) {
    const game = games.find((g) => g.name === name)!;
    assert.ok(game.players.min <= 1 && game.players.max >= 1, `${game.id} cannot seat 1`);
  }

  const four = games.filter((g) => g.players.min >= 4).map((g) => g.name);
  for (const name of four) assert.ok(!solo.includes(name));
});
