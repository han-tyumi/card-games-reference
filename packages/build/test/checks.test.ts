/**
 * The validator's semantic rules.
 *
 * Each of these exists because something wrong got committed and was found by
 * reading the output: a deal table that stopped at five players in a game that
 * seats eight, a diagram whose zones disagreed with its repeat count, a game
 * needing a hanafuda pack that claimed to need no cards. A rule that is not
 * tested is a rule that quietly stops firing, so both directions are checked —
 * that a bad entry is caught, and that a good one is left alone.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Entry } from "../checks.ts";
import {
  checkDeal,
  checkEntry,
  checkEquipment,
  checkFigureRefs,
  checkFilename,
  checkLayout,
  checkPlayers,
  checkTagSemantics,
  crossFileProblems,
  durationBounds,
  sharedAliases,
} from "../checks.ts";

/** Asserts a rule fired, and that its message names the thing that is wrong. */
function complains(problems: string[], about: string | RegExp): void {
  assert.equal(problems.length > 0, true, "expected a problem, got none");
  const matches = problems.some((p) =>
    typeof about === "string" ? p.includes(about) : about.test(p),
  );
  assert.ok(matches, `no problem mentioned ${about}; got:\n  ${problems.join("\n  ")}`);
}

// --- durations ------------------------------------------------------------

test("duration bounds parse both forms and reject anything else", () => {
  assert.deepEqual(durationBounds("20-45"), [20, 45]);
  assert.deepEqual(durationBounds("60+"), [60, null]);
  assert.equal(durationBounds("about an hour"), null);
  assert.equal(durationBounds(45), null);
  assert.equal(durationBounds(undefined), null);
});

// --- tags versus the numbers beside them ----------------------------------

test('"solo" must mean one player, and one player must mean "solo"', () => {
  complains(
    checkTagSemantics({ players: { min: 1, max: 4, ideal: 2 }, tags: ["solo"] }),
    "seats up to 4",
  );
  complains(
    checkTagSemantics({ players: { min: 1, max: 1, ideal: 1 }, tags: [] }),
    "not tagged",
  );
  assert.deepEqual(
    checkTagSemantics({ players: { min: 1, max: 1, ideal: 1 }, tags: ["solo"] }),
    [],
  );
});

test("a solitaire that seats a table is a contradiction", () => {
  complains(
    checkTagSemantics({
      category: "solitaire",
      players: { min: 1, max: 2, ideal: 1 },
      tags: ["solo"],
    }),
    "solitaire",
  );
});

test("partnership needs four seats and large-group needs six", () => {
  complains(
    checkTagSemantics({ players: { min: 2, max: 3, ideal: 3 }, tags: ["partnership"] }),
    "partnership",
  );
  complains(
    checkTagSemantics({ players: { min: 2, max: 4, ideal: 4 }, tags: ["large-group"] }),
    "large-group",
  );
  assert.deepEqual(
    checkTagSemantics({ players: { min: 4, max: 8, ideal: 4 }, tags: ["partnership", "large-group"] }),
    [],
  );
});

test('"two-player" has to include two players', () => {
  complains(
    checkTagSemantics({ players: { min: 3, max: 6, ideal: 4 }, tags: ["two-player"] }),
    "two-player",
  );
  assert.deepEqual(
    checkTagSemantics({ players: { min: 2, max: 2, ideal: 2 }, tags: ["two-player"] }),
    [],
  );
});

test("the duration tags mean what the README says they mean", () => {
  complains(
    checkTagSemantics({ duration_minutes: "20-45", tags: ["quick"] }),
    "limit 30",
  );
  complains(
    checkTagSemantics({ duration_minutes: "30-45", tags: ["long-game"] }),
    "needs 60",
  );
  assert.deepEqual(checkTagSemantics({ duration_minutes: "10-20", tags: ["quick"] }), []);
  assert.deepEqual(
    checkTagSemantics({ duration_minutes: "60+", tags: ["long-game"] }),
    [],
    "an open-ended duration cannot be too short",
  );
});

test("a duration range has to ascend", () => {
  complains(checkTagSemantics({ duration_minutes: "45-20", tags: [] }), "ascending");
  complains(checkTagSemantics({ duration_minutes: "30-30", tags: [] }), "ascending");
});

// --- players --------------------------------------------------------------

test("player counts have to be internally consistent", () => {
  complains(checkPlayers({ players: { min: 5, max: 2, ideal: 3 } }), "greater than");
  complains(checkPlayers({ players: { min: 2, max: 4, ideal: 6 } }), "outside the range");
  assert.deepEqual(checkPlayers({ players: { min: 2, max: 4, ideal: 4 } }), []);
  assert.deepEqual(checkPlayers({}), []);
});

// --- deal tables ----------------------------------------------------------

const seats = (min: number, max: number) => ({ min, max, ideal: min });

test("a deal table has to cover every group that can play", () => {
  // The original defect: 500 Rummy seats 2 to 8 and its table stopped at 5, so
  // a table of six looked it up and found nothing.
  const problems = checkDeal({
    players: seats(2, 8),
    deal: [2, 3, 4, 5].map((players) => ({ players, hand: 7 })),
  });
  complains(problems, "no row for 6, 7, 8 players");
});

test("a complete deal table passes", () => {
  assert.deepEqual(
    checkDeal({
      players: seats(2, 4),
      deal: [2, 3, 4].map((players) => ({ players, hand: 7 })),
    }),
    [],
  );
});

test("a deal row for a count the game cannot seat is caught", () => {
  complains(
    checkDeal({
      players: seats(2, 3),
      deal: [{ players: 2, hand: 7 }, { players: 3, hand: 7 }, { players: 9, hand: 4 }],
    }),
    "outside the game's 2-3",
  );
});

test("a repeated deal row is caught", () => {
  complains(
    checkDeal({
      players: seats(2, 2),
      deal: [{ players: 2, hand: 7 }, { players: 2, hand: 8 }],
    }),
    "more than once",
  );
});

test("the missing-row message reads correctly for a single player", () => {
  const problems = checkDeal({ players: seats(1, 1), deal: [{ players: 2, hand: 7 }] });
  complains(problems, /no row for 1 player,/);
  complains(problems, /no row for 1 player, but/);
});

test("no deal table is not a problem; a table is optional", () => {
  assert.deepEqual(checkDeal({ players: seats(2, 6) }), []);
});

// --- equipment ------------------------------------------------------------

test("needing no standard deck means naming the pack you do need", () => {
  complains(checkEquipment({ equipment: { standard_decks: 0 } }), "special_deck");
  assert.deepEqual(
    checkEquipment({ equipment: { standard_decks: 0, special_deck: "A hanafuda pack" } }),
    [],
  );
  assert.deepEqual(checkEquipment({ equipment: { standard_decks: 1 } }), []);
});

// --- figures --------------------------------------------------------------

test("a figure reference that does not resolve is caught", () => {
  const shared = new Set(["poker-hands"]);
  assert.deepEqual(checkFigureRefs({ figure_refs: ["poker-hands"] }, shared), []);
  complains(checkFigureRefs({ figure_refs: ["pokerhands"] }, shared), '"pokerhands"');
  assert.deepEqual(checkFigureRefs({}, shared), []);
});

// --- layouts --------------------------------------------------------------

test("a per-pile card list has to match the number of piles", () => {
  complains(
    checkLayout({ layout: { rows: [[{ kind: "tableau", repeat: 7, cards: [1, 2, 3] }]] } }),
    "cards has 3 entries but repeat is 7",
  );
  assert.deepEqual(
    checkLayout({ layout: { rows: [[{ kind: "tableau", repeat: 3, cards: [1, 2, 3] }]] } }),
    [],
  );
  assert.deepEqual(
    checkLayout({ layout: { rows: [[{ kind: "tableau", repeat: 7, cards: 1 }]] } }),
    [],
    "one number for all of them is fine",
  );
});

test("a gap is a spacer and carries nothing", () => {
  complains(
    checkLayout({ layout: { rows: [[{ kind: "gap", label: "Empty" }]] } }),
    "takes no label",
  );
  assert.deepEqual(checkLayout({ layout: { rows: [[{ kind: "gap" }]] } }), []);
});

test("a diagram cannot overlap more rows than it has", () => {
  complains(
    checkLayout({ layout: { overlapping_rows: 7, rows: [[{ kind: "tableau" }]] } }),
    "only 1 rows",
  );
  assert.deepEqual(
    checkLayout({
      layout: { overlapping_rows: 2, rows: [[{ kind: "tableau" }], [{ kind: "tableau" }]] },
    }),
    [],
  );
});

test("no layout is not a problem", () => {
  assert.deepEqual(checkLayout({}), []);
});

// --- filenames and the whole corpus ---------------------------------------

test("the id has to match the filename it lives in", () => {
  complains(checkFilename("gin-rummy.json", { id: "gin" }), "does not match");
  assert.deepEqual(checkFilename("gin-rummy.json", { id: "gin-rummy" }), []);
});

test("checkEntry runs every rule and reports them together", () => {
  const problems = checkEntry(
    "bad.json",
    {
      id: "worse",
      players: { min: 1, max: 4, ideal: 9 },
      tags: ["solo"],
      equipment: { standard_decks: 0 },
    },
    new Set(),
  );

  complains(problems, "does not match");
  complains(problems, "outside the range");
  complains(problems, "seats up to 4");
  complains(problems, "special_deck");
});

test("two entries cannot claim one id or one name", () => {
  const [, second] = crossFileProblems([
    { file: "a.json", data: { id: "war", name: "War" } },
    { file: "b.json", data: { id: "war", name: "War" } },
  ]);

  complains(second ?? [], "duplicate id, also used by a.json");
  complains(second ?? [], "duplicate name, also used by a.json");
});

test("an alias cannot be another game's real name", () => {
  // Otherwise the two are indistinguishable in search, which is how "slap" used
  // to find the wrong game.
  const [first, second] = crossFileProblems([
    { file: "slapjack.json", data: { id: "slapjack", name: "Slapjack", aliases: ["Slaps"] } },
    {
      file: "egyptian-ratscrew.json",
      data: { id: "egyptian-ratscrew", name: "Egyptian Ratscrew", aliases: ["Slapjack"] },
    },
  ]);

  assert.deepEqual(first, []);
  complains(second ?? [], "is the name of another game (slapjack.json)");
});

test("a game may list its own name as an alias", () => {
  const [problems] = crossFileProblems([
    { file: "war.json", data: { id: "war", name: "War", aliases: ["war"] } },
  ]);
  assert.deepEqual(problems, []);
});

test("an alias colliding with a name defined later is still caught", () => {
  // The alias pass runs after every name is known, so file order cannot hide it.
  const [first] = crossFileProblems([
    { file: "a.json", data: { id: "a", name: "A", aliases: ["Zed"] } },
    { file: "z.json", data: { id: "z", name: "Zed" } },
  ]);
  complains(first ?? [], "is the name of another game (z.json)");
});

test("a clean corpus produces no problems at all", () => {
  const entries: { file: string; data: Entry }[] = [
    { file: "war.json", data: { id: "war", name: "War", aliases: ["Battle"] } },
    { file: "snap.json", data: { id: "snap", name: "Snap", aliases: [] } },
  ];
  assert.deepEqual(crossFileProblems(entries), [[], []]);
});

// --- names two entries answer to ------------------------------------------

const card = (over: Partial<Entry> = {}): Entry => ({
  players: { min: 2, max: 4 },
  duration_minutes: "10-20",
  difficulty: "easy",
  category: "shedding",
  ...over,
});

test("an alias two entries answer to is reported, not failed", () => {
  // Both games really are called it, so neither gives the name up -- decision
  // 0022. A collision is a thing to know about, and knowing needs it counted.
  const entries = [
    { file: "speed.json", data: card({ id: "speed", name: "Speed", aliases: ["Slam"] }) },
    { file: "spit.json", data: card({ id: "spit", name: "Spit", aliases: ["Slam"], players: { min: 2, max: 2 } }) },
  ];

  assert.deepEqual(
    crossFileProblems(entries).flat(),
    [],
    "a shared alias failed validation, which decision 0022 says it must not",
  );

  const shared = sharedAliases(entries);
  assert.equal(shared.length, 1);
  assert.equal(shared[0]!.alias, "Slam");
  assert.deepEqual(shared[0]!.files, ["speed.json", "spit.json"]);
});

test("a shared alias whose cards read alike is marked, and still not failed", () => {
  // The case a reader cannot resolve on the index: same name, and the four
  // facts a card prints are the same too, so only the name they were not
  // searching by separates them. There is no wording that fixes that, which is
  // why it is a line in the report rather than a red build -- someone reading
  // it decides whether the pair is one game filed twice.
  const twins = [
    { file: "a.json", data: card({ id: "a", name: "A", aliases: ["Slam"] }) },
    { file: "b.json", data: card({ id: "b", name: "B", aliases: ["Slam"] }) },
  ];
  assert.deepEqual(crossFileProblems(twins).flat(), []);
  assert.equal(sharedAliases(twins)[0]!.alike, true);

  // One differing fact is enough to tell them apart, and each of the four
  // counts: a marker that only watched players would call three of these alike.
  for (const different of [
    { players: { min: 3, max: 4 } },
    { duration_minutes: "30-60" },
    { difficulty: "medium" },
    { category: "trick-taking" },
  ]) {
    const pair = [
      { file: "a.json", data: card({ id: "a", name: "A", aliases: ["Slam"] }) },
      { file: "b.json", data: card({ id: "b", name: "B", aliases: ["Slam"], ...different }) },
    ];
    assert.equal(
      sharedAliases(pair)[0]!.alike,
      false,
      `${Object.keys(different)[0]} differing did not make the pair distinguishable`,
    );
  }
});

test("an alias only one entry carries is not a collision", () => {
  assert.deepEqual(
    sharedAliases([
      { file: "a.json", data: card({ id: "a", name: "A", aliases: ["Slam", "Spoons"] }) },
      { file: "b.json", data: card({ id: "b", name: "B", aliases: ["Snap"] }) },
    ]),
    [],
  );
});
