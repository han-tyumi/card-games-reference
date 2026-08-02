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

import { CATEGORY_ORDER, loadGames } from "naibi";
import {
  DIFFICULTY,
  countLabel,
  matches,
  nameMatch,
  plan,
  readQuery,
  writeQuery,
} from "../assets/facets.js";
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
  c: "trick-taking",
  lo: 2,
  hi: 4,
  d: 1,
  max: 30,
  diff: "easy",
  ...fields,
});

test("the family chip shows that family and nothing else", () => {
  // Family is the one facet that is an exact match rather than a ceiling, so
  // the failure to look for is the opposite of the others': not a game wrongly
  // included, but the whole of a family wrongly excluded.
  for (const category of CATEGORY_ORDER) {
    const expected = games.filter((g) => g.category === category).map((g) => g.name);
    assert.deepEqual(
      shown({ category }).sort(),
      expected.sort(),
      `the ${category} chip does not show exactly the ${category} games`,
    );
  }
});

test("family combines with the other chips rather than overriding them", () => {
  // A chip that quietly widened the result once it was combined with another
  // would be the same class of lie the rest of this file exists to catch.
  const both = shown({ category: "solitaire", players: "1" });
  const solo = games.filter((g) => g.category === "solitaire").map((g) => g.name);
  assert.deepEqual(both.sort(), solo.sort());
  assert.deepEqual(shown({ category: "solitaire", players: "4" }), []);
});

// --- links ----------------------------------------------------------------

const allowedChips = (): Record<string, Set<string>> => ({
  category: new Set(["", ...CATEGORY_ORDER]),
  players: new Set(["", "1", "2", "3", "4", "5", "6", "8"]),
  decks: new Set(["", "1", "2"]),
  minutes: new Set(["", "15", "30", "60"]),
  difficulty: new Set(["", "simple", "easy", "medium"]),
});

test("a filtered view survives a round trip through the URL", () => {
  const state = { q: "bower", category: "trick-taking", players: "4", decks: "1" };
  const back = readQuery(writeQuery(state), allowedChips());
  assert.deepEqual(back, state);
});

test("nothing set means a clean URL", () => {
  assert.equal(writeQuery({}), "");
  assert.equal(writeQuery({ q: "", category: "" }), "");
});

test("a value no chip offers is dropped rather than filtering to nothing", () => {
  // The failure this prevents: someone shares a link, a category is later
  // renamed, and the page opens on an empty list looking broken rather than
  // simply unfiltered.
  assert.deepEqual(readQuery("?category=trumps", allowedChips()), {});
  assert.deepEqual(readQuery("?players=11", allowedChips()), {});
  assert.deepEqual(readQuery("?nonsense=1", allowedChips()), {});
});

test("every family is linkable, and the link selects that family", () => {
  for (const category of CATEGORY_ORDER) {
    const parsed = readQuery(writeQuery({ category }), allowedChips());
    assert.deepEqual(parsed, { category }, `${category} does not survive a link`);
    const expected = games.filter((g) => g.category === category).map((g) => g.name);
    assert.deepEqual(shown(parsed).sort(), expected.sort());
  }
});

// --- what the list shows --------------------------------------------------

test("with nothing typed, every game that survives the chips is shown in order", () => {
  const all = plan(facets, {}, null);
  assert.equal(all.order.length, games.length);
  assert.deepEqual(all.order, games.map((_, i) => i), "source order was not kept");
  assert.equal(all.count, `${games.length} games`);

  const solo = plan(facets, { players: "1" }, null);
  assert.deepEqual(
    solo.order.map((i) => games[i]!.name).sort(),
    games.filter((g) => g.players.min <= 1 && g.players.max >= 1).map((g) => g.name).sort(),
  );
});

test("the count says 'of' only when something is filtered out", () => {
  // This is the string a printed sheet relies on to admit it is a subset, so
  // it is worth pinning rather than leaving to whoever edits the template.
  assert.equal(countLabel(72, 72), "72 games");
  assert.equal(countLabel(15, 72), "15 of 72 games");
  assert.equal(countLabel(0, 72), "0 of 72 games");
  assert.equal(plan(facets, { category: "casino" }, null).count.endsWith("of 72 games"), true);
});

test("a query ranks by score, and the chips still apply on top", () => {
  const hits = new Map([
    [2, { s: 5, m: 0 }],
    [0, { s: 9, m: 0 }],
    [1, { s: 7, m: 0 }],
  ]);
  const { order } = plan(facets, { q: "x" }, hits);
  assert.deepEqual(order, [0, 1, 2], "hits were not ordered by descending score");

  // A game the chips exclude must not come back just because it scored.
  const excluded = games.findIndex((g) => g.category !== "casino");
  const scoped = plan(facets, { q: "x", category: "casino" }, new Map([[excluded, { s: 9, m: 0 }]]));
  assert.deepEqual(scoped.order, [], "a filtered-out game was resurrected by the query");
});

test("with no index loaded, a query still matches names and families", () => {
  // The offline case: the search index has not arrived, so only what is already
  // in the page can be matched. Getting this wrong shows an empty list to
  // someone on a train, which is the exact situation the app is built for.
  const hearts = games.findIndex((g) => g.name === "Hearts");
  const fallback = plan(facets, { q: "hearts" }, null);
  assert.ok(fallback.order.includes(hearts), "a name search failed without the index");

  const family = plan(facets, { q: "trick-taking" }, null);
  assert.ok(family.order.length > 5, "the family label is not searchable offline");

  assert.deepEqual(plan(facets, { q: "zzzznotaword" }, null).order, []);
});

test("every word of a multi-word query has to match", () => {
  assert.equal(nameMatch({ ...facet(), s: "hearts black lady" }, "hearts lady"), true);
  assert.equal(nameMatch({ ...facet(), s: "hearts black lady" }, "hearts spades"), false);
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

test("an unrankable difficulty is excluded rather than waved through", () => {
  // It used to be waved through: undefined > undefined is false, so a game
  // whose difficulty nothing ranked passed every difficulty filter there was.
  // A chip that cannot answer the question must not answer it with yes.
  assert.equal(matches(facet({ diff: "brutal" }), { difficulty: "medium" }), false);
  assert.equal(matches(facet({ diff: "brutal" }), {}), true, "still browsable unfiltered");
  assert.equal(matches(facet({ diff: "easy" }), { difficulty: "trivial" }), false);
});

test("every difficulty in the data is ranked", () => {
  // Which is what stops the rule above from quietly hiding a real entry.
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
