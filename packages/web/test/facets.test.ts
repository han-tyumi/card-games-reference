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
  PARAMS,
  countLabel,
  matches,
  nameMatch,
  plan,
  playerRange,
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
  i: 3,
  d: 1,
  dn: null,
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

test("with no chip list to check against, every filter survives", () => {
  // The print sheet has no chips, so it passes no allowed-values map. It was
  // briefly given one built from the facets instead, which got `difficulty`
  // wrong and dropped it silently -- so a printed sheet carried games the index
  // had filtered out, and nothing failed. Every parameter, every time.
  const state = { q: "bower", category: "trick-taking", players: "4", decks: "1",
    minutes: "30", difficulty: "easy" };
  assert.deepEqual(readQuery(writeQuery(state)), state);

  for (const name of PARAMS) {
    const parsed = readQuery(`?${name}=simple`);
    assert.equal(parsed[name], "simple", `${name} was dropped without a chip list`);
  }

  // And a value nothing matches shows nothing, rather than being ignored.
  assert.deepEqual(plan(facets, readQuery("?difficulty=banana"), null).order, []);
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

// --- the players range ----------------------------------------------------

test("a game seating exactly 5 matches the range 5-6", () => {
  // Overlap, stated as a test so it cannot quietly become containment. The
  // design rejects containment as a gate because it hides twenty titles a
  // party of six can play by benching two, and twenty a party of four gets
  // outright.
  assert.equal(matches(facet({ lo: 5, hi: 5 }), { players: "6", from: "5" }), true);
  assert.equal(matches(facet({ lo: 6, hi: 6 }), { players: "6", from: "5" }), true, "the top");
  assert.equal(matches(facet({ lo: 2, hi: 5 }), { players: "6", from: "5" }), true, "from below");
  assert.equal(matches(facet({ lo: 7, hi: 9 }), { players: "6", from: "5" }), false, "above");
  assert.equal(matches(facet({ lo: 1, hi: 4 }), { players: "6", from: "5" }), false, "below");
});

test("overlap is what the range filters on, and it is wider than containment", () => {
  // Against the corpus rather than a fixture, and derived rather than pinned
  // to a literal: what matters is that the filter admits every game touching
  // the range, not that today's number is 56.
  const overlap = games.filter((g) => g.players.min <= 6 && g.players.max >= 4).length;
  const contained = games.filter((g) => g.players.min <= 4 && g.players.max >= 6).length;

  assert.equal(shown({ players: "6", from: "4" }).length, overlap);
  assert.ok(overlap > contained, "the corpus no longer distinguishes the two readings");
  assert.notEqual(
    shown({ players: "6", from: "4" }).length,
    contained,
    "the range filters by containment, which hides games the reader can play",
  );
});

test("a range whose floor is the count is exactly that count", () => {
  assert.deepEqual(playerRange({ players: "5", from: "5" }), { lo: 5, hi: 5 });
  assert.deepEqual(shown({ players: "5", from: "5" }), shown({ players: "5" }));
});

test("an existing single-value players link still means exactly that count", () => {
  // Phase 1's links are in the wild. `?players=5` has to keep meaning 5-5, and
  // it does so by construction rather than by a compatibility branch: an
  // absent floor defaults to the count.
  for (let n = 1; n <= 12; n++) {
    assert.deepEqual(playerRange({ players: String(n) }), { lo: n, hi: n }, `players=${n}`);
    assert.deepEqual(
      shown({ players: String(n) }),
      games.filter((g) => g.players.min <= n && n <= g.players.max).map((g) => g.name),
      `players=${n} stopped meaning exactly ${n}`,
    );
  }
});

test("a floor above the count is clamped, not inverted", () => {
  assert.deepEqual(playerRange({ players: "4", from: "9" }), { lo: 4, hi: 4 });
});

test("no reachable combination of chip and floor produces an inverted range", () => {
  // Every pair the controls can produce, not a sampled few. This is the whole
  // of "the range cannot invert": clamping happens in playerRange and there is
  // no other path to a range.
  for (let count = 1; count <= 12; count++) {
    for (let floor = 1; floor <= 12; floor++) {
      const range = playerRange({ players: String(count), from: String(floor) })!;
      assert.ok(range, `${floor}-${count} produced no range`);
      assert.ok(range.lo <= range.hi, `${floor}-${count} inverted to ${range.lo}-${range.hi}`);
      assert.equal(range.hi, count, `${floor}-${count} moved the count`);
    }
  }
});

test("a floor with no count is not a filter", () => {
  // The floor lives inside a collapsed panel under the chip row and means
  // nothing on its own. A URL carrying only one must not filter by it.
  assert.equal(playerRange({ from: "3" }), null);
  assert.equal(shown({ from: "3" }).length, games.length);
});

test("a garbled count leaves the players filter inert, as it always has", () => {
  // Not a new decision: the index drops unknown values through `allowed`, and
  // only the print sheet can see one. Pinned so the rewrite does not quietly
  // start emptying a printed sheet instead.
  assert.equal(playerRange({ players: "abc" }), null);
  assert.equal(shown({ players: "abc" }).length, games.length);
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

test("a deck count is judged at the player count asked for", () => {
  // The chips are read together, not one at a time: "one deck" and "eight
  // players" is a single question, and slapjack is a yes to each separately
  // and a no to both.
  const slapjack = facets[games.findIndex((g) => g.id === "slapjack")]!;
  assert.equal(matches(slapjack, { decks: "1", players: "8" }), false);
  assert.equal(matches(slapjack, { decks: "1", players: "3" }), true);
  assert.equal(matches(slapjack, { decks: "2", players: "8" }), true);
});

test("with no player count, a deck count judges the smallest table", () => {
  // Nothing else is knowable: the reader has not said how many they are.
  const slapjack = facets[games.findIndex((g) => g.id === "slapjack")]!;
  assert.equal(matches(slapjack, { decks: "1" }), true);
});

test("a per-player game is refused once the table outgrows the decks held", () => {
  const nertz = facets[games.findIndex((g) => g.id === "nertz")]!;
  assert.equal(matches(nertz, { decks: "2", players: "2" }), true);
  assert.equal(matches(nertz, { decks: "2", players: "6" }), false);
});

test("one deck and a range spanning the threshold still offers the game", () => {
  // slapjack wants a second pack from six players. A party of six who might be
  // four can play it -- they seat four -- so a range straddling the threshold
  // is a yes. Reading the requirement at the TOP of the range would refuse it,
  // which is the same "answer from one seat" mistake phase 1 fixed for `d`,
  // moved up a level.
  const slapjack = facets[games.findIndex((g) => g.id === "slapjack")]!;
  assert.equal(matches(slapjack, { decks: "1", players: "6", from: "4" }), true);
  assert.equal(matches(slapjack, { decks: "1", players: "6", from: "6" }), false, "six only");
  assert.equal(matches(slapjack, { decks: "1", players: "8", from: "7" }), false, "clear of it");
});

test("the deck question is asked of every seat the range and the game share", () => {
  // The seats to try are the INTERSECTION, not the range's own floor and not
  // the game's. A game seating 6-8 asked about by a party of 2-8 must be
  // answered at 6, 7 and 8; asking at seat 2 indexes off the front of `dn`.
  const late = facet({ lo: 6, hi: 8, d: 2, dn: [2, 2, 3] });
  assert.equal(matches(late, { decks: "1", players: "8", from: "2" }), false, "nothing fits");
  assert.equal(matches(late, { decks: "2", players: "8", from: "2" }), true, "six and seven fit");
});

test("a per-player game's requirement climbs with the count", () => {
  // nertz needs one deck per player. One deck held never offers it above one
  // player, however the range is expressed.
  const nertz = facets[games.findIndex((g) => g.id === "nertz")]!;
  assert.equal(nertz.dn?.[8 - nertz.lo], 8, "nertz no longer needs 8 decks at 8 players");
  assert.equal(matches(nertz, { decks: "8", players: "8", from: "8" }), true);
  assert.equal(matches(nertz, { decks: "7", players: "8", from: "8" }), false);
  for (let n = nertz.lo + 1; n <= nertz.hi; n++) {
    assert.equal(
      matches(nertz, { decks: "1", players: String(n), from: String(n) }),
      false,
      `one deck offered nertz at ${n} players`,
    );
  }
});

test("a game whose step map dips is judged at every seat, not the smallest", () => {
  // Synthetic, because no entry dips today -- which is exactly the point. The
  // schema types decks_by_players as an object of integers and nothing stops
  // {"4":2,"6":1}, so "check the smallest seat, the requirement only climbs" is
  // correct under an assumption no validator enforces. The loop needs no such
  // assumption, and this is what would catch its removal.
  // Seats 2-6 need 1, 2, 3, 1, 2. The seat that fits one deck inside the range
  // 3-6 is FIVE -- neither the smallest nor the largest -- so an implementation
  // that answers from either end gets this wrong in one direction or the other.
  const dips = facet({ lo: 2, hi: 6, d: 1, dn: [1, 2, 3, 1, 2] });
  assert.equal(matches(dips, { decks: "1", players: "6", from: "3" }), true, "seat 5 fits");
  assert.equal(matches(dips, { decks: "1", players: "4", from: "3" }), false, "3 and 4 do not");
});

test("a non-numeric player count refuses on purpose, not by an array miss", () => {
  // print.js calls readQuery with no `allowed` map -- unlike the index page, a
  // garbled value like "?players=abc" is never dropped upstream, so it reaches
  // this predicate as NaN. A game with a decks_by_players map used to be
  // refused only because `dn[NaN]` happens to be undefined; a game with no
  // map ignored the garbage entirely and answered from `d` alone.
  const slapjack = facets[games.findIndex((g) => g.id === "slapjack")]!; // has dn
  const hearts = facets[games.findIndex((g) => g.id === "hearts")]!; // has no dn
  assert.equal(matches(slapjack, { decks: "1", players: "abc" }), false);
  assert.equal(matches(hearts, { decks: "1", players: "abc" }), false);
});

test("a non-numeric deck count refuses rather than comparing false against everything", () => {
  const hearts = facets[games.findIndex((g) => g.id === "hearts")]!;
  assert.equal(matches(hearts, { decks: "abc" }), false);
});

test("print.js's own call path: a garbled players value drops every game, not just the mapped ones", () => {
  // Reproduces the measured regression: ?decks=1 alone matched 62 games, and
  // adding a garbled ?players dropped only the 10 with a decks_by_players map
  // because the rest never looked at the invalid value. Now nothing is
  // reachable through a query string this malformed -- refusing everything is
  // the safe reading of "the table size cannot be determined", stated on
  // purpose rather than falling out of an accidental array miss.
  const decksOnly = shown(readQuery("?decks=1"));
  const withGarbage = shown(readQuery("?players=abc&decks=1"));
  assert.ok(decksOnly.length > 0, "nothing exercises ?decks=1 to compare against");
  assert.deepEqual(withGarbage, []);
});
