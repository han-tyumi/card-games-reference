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

import { CATEGORY_ORDER, categoryLabel, loadGames } from "naibi";
import {
  DIFFICULTY,
  MULTI,
  PARAMS,
  PREP,
  PREP_OWN_PACK,
  countLabel,
  describe,
  emptyReason,
  floorOptions,
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
  p: 0,
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

/**
 * What the page's controls offer, as app.js reads them out of the DOM.
 *
 * The multi-select groups carry no "" value: a checkbox group says "any" by
 * having nothing ticked, so there is no chip to represent it.
 */
const counts = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));
const allowedChips = (): Record<string, Set<string>> => ({
  category: new Set(CATEGORY_ORDER),
  players: new Set(["", ...counts(12)]),
  from: new Set(counts(12)),
  decks: new Set(["", "1", "2", "3", "6"]),
  minutes: new Set(["", "15", "30", "60"]),
  difficulty: new Set(["", "simple", "easy", "medium"]),
  prep: new Set(["jokers", "strip"]),
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
  assert.deepEqual(readQuery("?players=13", allowedChips()), {});
  assert.deepEqual(readQuery("?prep=sleeving", allowedChips()), {});
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

test("two families show both and nothing else", () => {
  // Family is browsing rather than constraint, so values combine with OR.
  // Every other group narrows as you add to it; this one widens, and the
  // failure to look for is the same as the single-value case magnified -- a
  // whole family missing from a list that says it is showing it.
  for (const a of CATEGORY_ORDER) {
    for (const b of CATEGORY_ORDER) {
      if (a >= b) continue;
      const expected = games
        .filter((g) => g.category === a || g.category === b)
        .map((g) => g.name);
      assert.deepEqual(
        shown({ category: `${a},${b}` }).sort(),
        expected.sort(),
        `${a},${b} does not show exactly those two families`,
      );
    }
  }
});

test("adding a family to the selection can only widen the list", () => {
  for (const a of CATEGORY_ORDER) {
    for (const b of CATEGORY_ORDER) {
      if (a === b) continue;
      assert.ok(
        shown({ category: `${a},${b}` }).length >= shown({ category: a }).length,
        `${a} shrank when ${b} was added`,
      );
    }
  }
});

test("a family list round-trips through the URL", () => {
  const state = { category: "solitaire,trick-taking", players: "6", from: "4", prep: "jokers" };
  assert.deepEqual(readQuery(writeQuery(state), allowedChips()), state);
});

test("a stale family in a list is dropped without dropping the rest", () => {
  // The whole reason readQuery validates token by token. Checking the joined
  // string against `allowed` would match nothing and silently drop the filter
  // entirely -- a control that stops working rather than one that errors.
  assert.deepEqual(readQuery("?category=trumps,solitaire", allowedChips()), {
    category: "solitaire",
  });
  assert.deepEqual(readQuery("?category=trumps,nonsense", allowedChips()), {});
  assert.deepEqual(readQuery("?prep=sleeving,jokers", allowedChips()), { prep: "jokers" });
});

test("a repeated value in a list collapses rather than doubling", () => {
  // Otherwise writeQuery(readQuery(s)) grows on every round trip.
  const once = readQuery("?category=solitaire,solitaire", allowedChips());
  assert.deepEqual(once, { category: "solitaire" });
  assert.deepEqual(readQuery(writeQuery(once), allowedChips()), once);
});

test("every family is linkable in a pair, not just alone", () => {
  const [first, ...rest] = CATEGORY_ORDER;
  for (const category of rest) {
    const state = { category: `${first},${category}` };
    assert.deepEqual(readQuery(writeQuery(state), allowedChips()), state, `${category} pair`);
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

// --- ranking ---------------------------------------------------------------

test("ideal and coverage order the list, they never shorten it", () => {
  // The claim that stops a ranking becoming a filter by accident. `ideal` would
  // be a terrible gate -- no game in the corpus is ideal at 7, so filtering on
  // it would empty the list there while looking like it was working -- and
  // coverage would hide the twenty titles overlap exists to keep.
  for (let hi = 1; hi <= 12; hi++) {
    for (const from of ["", "1", String(Math.max(1, hi - 2))]) {
      const state = { players: String(hi), from };
      const survivors = facets.map((f, i) => (matches(f, state) ? i : -1)).filter((i) => i >= 0);
      const { order } = plan(facets, state, null);
      assert.deepEqual(
        [...order].sort((a, b) => a - b),
        survivors,
        `players=${hi} from=${from || "(none)"} changed WHICH games show, not just their order`,
      );
    }
  }
});

test("a game covering the whole range sorts above one that merely overlaps it", () => {
  // And coverage outranks ideal: the covering game here is ideal outside the
  // range and still comes first, because "we can definitely play this whatever
  // happens" beats "this is at its best at a number we might not reach".
  const covering = facet({ lo: 2, hi: 8, i: 2 });
  const partial = facet({ lo: 5, hi: 5, i: 5 });
  const { order } = plan([partial, covering], { players: "6", from: "4" }, null);
  assert.deepEqual(order, [1, 0]);
});

test("ideal breaks ties inside a coverage group", () => {
  // Neither of these covers 4-6, so coverage cannot separate them and only
  // `ideal` is left. The game at its best inside the range comes first even
  // though it was declared second.
  const outside = facet({ lo: 3, hi: 5, i: 3 });
  const inside = facet({ lo: 5, hi: 5, i: 5 });
  assert.deepEqual(plan([outside, inside], { players: "6", from: "4" }, null).order, [1, 0]);

  // The same two with nothing asked: source order, because a ranking that
  // engages before the reader chooses is a filter that starts engaged.
  assert.deepEqual(plan([outside, inside], {}, null).order, [0, 1]);
});

test("with a query, score wins and coverage breaks its ties", () => {
  const covering = facet({ lo: 2, hi: 8, i: 4 });
  const partial = facet({ lo: 5, hi: 5, i: 5 });
  const list = [partial, covering, facet({ lo: 4, hi: 6, i: 5 })];

  // Different scores: the score decides, whatever the coverage.
  const byScore = new Map([
    [0, { s: 9, m: 0 }],
    [1, { s: 1, m: 0 }],
    [2, { s: 5, m: 0 }],
  ]);
  assert.deepEqual(plan(list, { q: "x", players: "6", from: "4" }, byScore).order, [0, 2, 1]);

  // Equal scores: coverage separates them and the partial one sinks.
  const tied = new Map([
    [0, { s: 4, m: 0 }],
    [1, { s: 4, m: 0 }],
    [2, { s: 4, m: 0 }],
  ]);
  assert.deepEqual(plan(list, { q: "x", players: "6", from: "4" }, tied).order, [1, 2, 0]);
});

test("with no range chosen, nothing reorders", () => {
  // A filter that starts engaged hides games from a reader who never touched
  // it, and so does a ranking. Until a count is chosen the page is in source
  // order, which is what the index has always shown.
  const list = [facet({ lo: 5, hi: 5, i: 5 }), facet({ lo: 2, hi: 8, i: 2 })];
  assert.deepEqual(plan(list, {}, null).order, [0, 1]);
  assert.deepEqual(plan(facets, {}, null).order, facets.map((_, i) => i));
});

test("only covering games are badged, and the badge names the range", () => {
  const covering = facet({ lo: 2, hi: 8, i: 4 });
  const partial = facet({ lo: 5, hi: 5, i: 5 });
  const { order, marks } = plan([partial, covering], { players: "6", from: "4" }, null);
  assert.equal(order.length, 2, "the badge is not a filter");
  assert.equal(marks.get(1), "plays with any of 4-6");
  assert.equal(marks.get(0), undefined, "a game that only overlaps was badged as covering");
});

test("an exact count badges nothing, because every match would carry it", () => {
  // At one count, coverage and overlap are the same set: the badge would be on
  // every card and would say nothing at all.
  const { order, marks } = plan(facets, { players: "4" }, null);
  assert.ok(order.length > 0, "nothing to badge, so this proves nothing");
  assert.equal(marks.size, 0);
  assert.equal(plan(facets, { players: "4", from: "4" }, null).marks.size, 0);
});

test("nothing is badged before a count is chosen", () => {
  assert.equal(plan(facets, {}, null).marks.size, 0);
  assert.equal(plan(facets, { decks: "1" }, null).marks.size, 0);
});

test("every badged game really does seat every count in the range", () => {
  // Against the corpus, so the badge cannot become a decoration that survives
  // the rule it describes.
  const { marks } = plan(facets, { players: "6", from: "3" }, null);
  assert.ok(marks.size > 0, "nothing was badged, so this proves nothing");
  for (const [i] of marks) {
    for (let n = 3; n <= 6; n++) {
      const game = games[i]!;
      assert.ok(
        game.players.min <= n && n <= game.players.max,
        `${game.id} is badged as covering 3-6 but cannot seat ${n}`,
      );
    }
  }
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

// --- the empty state -------------------------------------------------------

const FAMILIES = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, categoryLabel(c)]));

test("the empty state names every filter that is set", () => {
  const state = {
    players: "6",
    from: "4",
    decks: "1",
    prep: "jokers",
    minutes: "30",
    difficulty: "easy",
    category: "casino",
    q: "bower",
  };
  const said = emptyReason(state, FAMILIES);
  for (const fragment of ["4-6 players", "1 deck", "jokers", "30 minutes", "easy", "Casino", "bower"]) {
    assert.ok(said.includes(fragment), `the reason does not mention ${fragment}: ${said}`);
  }
});

test("a filter that is not set is not mentioned", () => {
  // The point is telling the reader which control to reach for. A sentence
  // listing controls they never touched sends them to the wrong one.
  const said = emptyReason({ decks: "6" }, FAMILIES);
  assert.equal(said, "Nothing matches 6 decks.");
});

test("a range is said as a count when it is one, and as a span when it is not", () => {
  // A collapsed range is the ordinary case -- it is what every chip produces
  // before the floor is touched -- so "4-4 players" would be the common
  // reading, not the rare one.
  assert.deepEqual(describe({ players: "1" }, FAMILIES), ["1 player"]);
  assert.deepEqual(describe({ players: "5" }, FAMILIES), ["5 players"]);
  assert.deepEqual(describe({ players: "6", from: "6" }, FAMILIES), ["6 players"]);
  assert.deepEqual(describe({ players: "6", from: "4" }, FAMILIES), ["4-6 players"]);
  assert.deepEqual(describe({ decks: "1" }, FAMILIES), ["1 deck"]);
  assert.deepEqual(describe({ decks: "2" }, FAMILIES), ["2 decks"]);
});

test("several families read as a choice, not as a narrowing", () => {
  // Every other group narrows as you add to it, so a comma would read wrong.
  const said = emptyReason({ category: "casino,bluffing", decks: "6" }, FAMILIES);
  assert.ok(said.includes("Casino or Bluffing"), said);
});

test("the sentence names families by label, not by id", () => {
  const said = emptyReason({ category: "rummy-type", players: "12" }, FAMILIES);
  assert.ok(said.includes(categoryLabel("rummy-type")), said);
  assert.ok(!said.includes("rummy-type"), `the raw id leaked into the sentence: ${said}`);
});

test("solitaire above one player is explained as a fact, not a typo", () => {
  // Not the reader's mistake: all eleven solitaire games are one-player and no
  // one-player game sits outside the family, so the two controls agreeing is
  // redundant and disagreeing is always empty. Nothing on the page says so.
  const solitaire = games.filter((g) => g.category === "solitaire");
  assert.ok(solitaire.length > 0);
  assert.ok(
    solitaire.every((g) => g.players.min === 1 && g.players.max === 1),
    "a solitaire game now seats more than one, so this sentence has become a lie",
  );

  const said = emptyReason({ category: "solitaire", players: "4" }, FAMILIES);
  assert.ok(/exactly one/.test(said), said);
  assert.deepEqual(shown({ category: "solitaire", players: "4" }), [], "the premise is wrong");
});

test("a floor reaching one makes solitaire reachable again, and says nothing special", () => {
  const state = { category: "solitaire", players: "4", from: "1" };
  assert.ok(shown(state).length > 0, "solitaire is unreachable from a range including one");
  assert.ok(!/exactly one/.test(emptyReason(state, FAMILIES)));
});

test("solitaire plus another family gets the ordinary sentence", () => {
  // The list is no longer solitaire's fault alone once something else is
  // ticked, and blaming it would send the reader to the wrong control.
  const said = emptyReason({ category: "solitaire,casino", players: "4" }, FAMILIES);
  assert.ok(!/exactly one/.test(said), said);
  assert.ok(said.includes("4 players"), said);
});

test("no single chip value can empty the list on its own", () => {
  // Worth stating rather than discovering: it is why the sweep below has to
  // use pairs, and it is the design's "every game is reachable by some setting
  // of every control" seen from the other side.
  const chips = allowedChips();
  for (const name of PARAMS) {
    for (const value of chips[name] ?? []) {
      if (!value) continue;
      assert.ok(
        plan(facets, { [name]: value }, null).order.length > 0,
        `${name}=${value} empties the list by itself`,
      );
    }
  }
});

test("every pair of filters that empties the list names a real cause", () => {
  // Driven from the controls rather than from a handful of examples, so a
  // control added without a phrase is caught here rather than shipping a
  // sentence that omits the very thing that did it.
  const chips = allowedChips();
  const values = PARAMS.flatMap((name) =>
    [...(chips[name] ?? [])].filter(Boolean).map((value) => [name, value] as const),
  );

  let checked = 0;
  for (const [aName, aValue] of values) {
    for (const [bName, bValue] of values) {
      if (aName === bName) continue;
      const state = { [aName]: aValue, [bName]: bValue };
      if (plan(facets, state, null).order.length > 0) continue;
      checked++;
      const said = emptyReason(state, FAMILIES);
      assert.notEqual(
        said,
        "Nothing matches.",
        `${aName}=${aValue} + ${bName}=${bValue} emptied the list silently`,
      );
      // And the sentence has to name at least one of the two that did it,
      // rather than being merely non-empty.
      const named = describe(state, FAMILIES).length;
      assert.ok(named > 0, `${aName}=${aValue} + ${bName}=${bValue} described nothing`);
    }
  }
  assert.ok(checked > 20, `only ${checked} pairs empty the list, so this barely proves anything`);
});

test("with nothing set at all, the sentence does not pretend to a reason", () => {
  assert.equal(emptyReason({}, FAMILIES), "Nothing matches.");
});

test("describe is the same list the reason is built from", () => {
  // print.js prints these fragments beside a count; the index joins them into
  // a sentence. One function, so a printed sheet and an empty index cannot
  // disagree about what was asked for.
  const state = { players: "5", decks: "2", q: "bower" };
  for (const fragment of describe(state, FAMILIES)) {
    assert.ok(emptyReason(state, FAMILIES).includes(fragment), fragment);
  }
});

// --- the floor -------------------------------------------------------------

test("the floor offers every value at or below the count, and no more", () => {
  for (let count = 1; count <= 12; count++) {
    const options = floorOptions(facets, { players: String(count) }, null);
    assert.deepEqual(
      options.map((o) => o.value),
      counts(count),
      `a party of ${count} was offered the wrong floors`,
    );
  }
});

test("no count chosen means no options", () => {
  // The control has nothing to be below, and the page hides it.
  assert.deepEqual(floorOptions(facets, {}, null), []);
  assert.deepEqual(floorOptions(facets, { decks: "1" }, null), []);
});

test("an option's count is the number of games that floor actually shows", () => {
  // Cross-checked against plan() for the same state rather than against a
  // literal, so the number on the option cannot promise a different list from
  // the one the page then renders.
  const states: Record<string, string>[] = [
    { players: "6" },
    { players: "8", decks: "1" },
    { players: "4" },
  ];
  for (const state of states) {
    for (const option of floorOptions(facets, state, null)) {
      const { order } = plan(facets, { ...state, from: option.value }, null);
      assert.equal(option.count, order.length, `floor ${option.value} of ${state.players}`);
      assert.ok(option.label.includes(String(option.count)), "the label hides its own count");
      assert.ok(option.label.startsWith(option.value), "the label does not lead with the count");
    }
  }
});

test("the counts rise as the floor falls, because a wider range can only add games", () => {
  const options = floorOptions(facets, { players: "8" }, null);
  for (let i = 1; i < options.length; i++) {
    assert.ok(
      options[i - 1]!.count >= options[i]!.count,
      `dropping the floor from ${options[i]!.value} to ${options[i - 1]!.value} lost games`,
    );
  }
});

test("the cliff the control exists to show is real", () => {
  // A table of six has no way to discover that dropping to four widens the
  // list substantially. If it ever stops being worth saying, this fails and
  // somebody decides, rather than the control quietly costing a click for
  // nothing.
  const options = floorOptions(facets, { players: "6" }, null);
  const atSix = options.find((o) => o.value === "6")!.count;
  const atFour = options.find((o) => o.value === "4")!.count;
  assert.ok(atFour > atSix, "widening 6 down to 4 no longer changes the list");
});

test("the option counts respect the other chips", () => {
  // Not the whole corpus filtered by players alone: the number offered has to
  // be the number the reader will get, with everything else they have set.
  const plain = floorOptions(facets, { players: "6" }, null);
  const narrowed = floorOptions(facets, { players: "6", difficulty: "simple" }, null);
  assert.equal(plain.length, narrowed.length);
  assert.ok(
    narrowed.some((o, i) => o.count < plain[i]!.count),
    "adding a difficulty ceiling changed none of the floor's counts",
  );
});

test("the option for the count itself is the unwidened list", () => {
  const options = floorOptions(facets, { players: "5" }, null);
  const top = options.at(-1)!;
  assert.equal(top.value, "5");
  assert.equal(top.count, plan(facets, { players: "5" }, null).order.length);
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

// --- what the reader can do to a deck -------------------------------------

/** What an entry's own equipment says it asks of a deck. */
const ownPack = (g: (typeof games)[number]) => g.equipment.standard_decks === 0;
const needsJokers = (g: (typeof games)[number]) => !ownPack(g) && g.equipment.jokers > 0;
const needsStrip = (g: (typeof games)[number]) => !ownPack(g) && Boolean(g.equipment.special_deck);

test("preparation is a subset test, not a ceiling", () => {
  // The assertion that would have caught the design's first draft. A ceiling
  // claims these are degrees of one thing, so that accepting the strictest
  // accepts everything milder -- but someone whose deck has no jokers can strip
  // cards happily and still cannot add jokers. Ticking one must never hand back
  // a game needing the other.
  const stripOnly = shown({ prep: "strip" });
  for (const game of games.filter(needsJokers)) {
    assert.ok(!stripOnly.includes(game.name), `${game.id} needs jokers and was offered anyway`);
  }
  const jokersOnly = shown({ prep: "jokers" });
  for (const game of games.filter(needsStrip)) {
    assert.ok(!jokersOnly.includes(game.name), `${game.id} needs stripping and was offered anyway`);
  }
});

test("a game needing both capabilities requires both to be ticked", () => {
  // five-hundred: a 43-card pack built by stripping, plus a joker.
  const five = facets[games.findIndex((g) => g.id === "five-hundred")]!;
  assert.equal(five.p, PREP.jokers! | PREP.strip!, "five-hundred no longer needs both");
  assert.equal(matches(five, { prep: "jokers" }), false);
  assert.equal(matches(five, { prep: "strip" }), false);
  assert.equal(matches(five, { prep: "jokers,strip" }), true);
  assert.equal(matches(five, {}), true, "still browsable untouched");
});

test("a pack nobody can improvise is offered only when the control is untouched", () => {
  // koi-koi needs a hanafuda pack, which no checkbox offers and no 52 becomes.
  // The same treatment standard_decks: 0 already gets from the deck count.
  const koi = facets[games.findIndex((g) => g.id === "koi-koi")]!;
  assert.equal(koi.p, PREP_OWN_PACK);
  assert.equal(matches(koi, {}), true);
  for (const ticked of ["jokers", "strip", "jokers,strip"]) {
    assert.equal(matches(koi, { prep: ticked }), false, `offered under "${ticked}"`);
  }
});

test("an untouched control is not a filter", () => {
  assert.equal(shown({ prep: "" }).length, games.length);
  assert.equal(shown({}).length, games.length);
});

test("what each ticked combination offers is decided by the entry's own equipment", () => {
  // Expectations read off `equipment`, not off `p`, so this checks the
  // derivation rather than restating it.
  const cases: [string, (g: (typeof games)[number]) => boolean][] = [
    ["jokers", (g) => !ownPack(g) && !needsStrip(g)],
    ["strip", (g) => !ownPack(g) && !needsJokers(g)],
    ["jokers,strip", (g) => !ownPack(g)],
  ];
  for (const [ticked, playable] of cases) {
    const list = shown({ prep: ticked });
    for (const game of games) {
      assert.equal(list.includes(game.name), playable(game), `${game.id} under "${ticked}"`);
    }
  }
});

test("the preparation axis partitions the whole corpus, with every state populated", () => {
  // The design's four rows, which are exclusive: a game needing both a strip
  // and a joker is counted under strip. Derived rather than pinned to
  // literals, so growth is not a failure. The sizes when this was written:
  // 50 plain, 5 jokers alone, 16 stripped, 1 own pack.
  const buckets = [
    games.filter((g) => !ownPack(g) && !needsJokers(g) && !needsStrip(g)),
    games.filter((g) => needsJokers(g) && !needsStrip(g)),
    games.filter(needsStrip),
    games.filter(ownPack),
  ];
  for (const bucket of buckets) assert.ok(bucket.length > 0, "a preparation state has no games");
  assert.equal(
    buckets.reduce((n, b) => n + b.length, 0),
    games.length,
    "the four states do not partition the corpus -- a game is in two or none",
  );

  // Everything a reader with both capabilities can play is everything that
  // does not need a pack they cannot make.
  assert.equal(shown({ prep: "jokers,strip" }).length, games.length - buckets[3]!.length);
});

test("ticking everything on offer still refuses what no box covers", () => {
  // The counter-intuitive one, and it is correct: ticking both boxes says what
  // the reader can do, and koi-koi is not among it. Untouched says nothing at
  // all, so it shows everything. Fewer games with both ticked than with neither
  // is the honest answer, not an off-by-one.
  assert.ok(shown({ prep: "jokers,strip" }).length < shown({}).length);
});

test("a capability no checkbox offers cannot be smuggled in through the URL", () => {
  // PREP is the whole vocabulary. An unknown token contributes nothing rather
  // than being parsed as a number, so ?prep=4 cannot unlock the own-pack bit.
  const koi = facets[games.findIndex((g) => g.id === "koi-koi")]!;
  assert.equal(matches(koi, { prep: "4" }), false);
  assert.equal(matches(koi, { prep: "own-pack" }), false);
  assert.equal(matches(koi, { prep: "jokers,strip,4" }), false);
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
