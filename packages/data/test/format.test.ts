/**
 * The helpers that turn an entry's numbers into the words a reader sees.
 *
 * Every output format calls these, so a wrong plural or a missing "best with"
 * is wrong in the Markdown, the PDF and the site at once.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CATEGORY_ORDER,
  categoryLabel,
  durationLine,
  facts,
  gamesByCategory,
  playersLine,
} from "naibi";
import type { CardGame } from "naibi";

/** Only the fields the function under test reads; the rest would be noise. */
function game(fields: Partial<CardGame>): CardGame {
  return {
    name: "Test Game",
    aliases: [],
    category: "shedding",
    players: { min: 2, max: 4, ideal: 3 },
    decks: "One 52-card deck",
    duration_minutes: "20-30",
    difficulty: "easy",
    ...fields,
  } as CardGame;
}

test("a solitaire seats one player, singular", () => {
  assert.equal(playersLine(game({ players: { min: 1, max: 1, ideal: 1 } })), "1 player");
});

test("a fixed count says so without an ideal", () => {
  assert.equal(playersLine(game({ players: { min: 4, max: 4, ideal: 4 } })), "4 players");
});

test("a range names the best count", () => {
  assert.equal(
    playersLine(game({ players: { min: 3, max: 7, ideal: 4 } })),
    "3-7 players (best with 4)",
  );
});

test("an open-ended duration keeps its plus sign", () => {
  assert.equal(durationLine(game({ duration_minutes: "60+" })), "60+ minutes");
  assert.equal(durationLine(game({ duration_minutes: "20-45" })), "20-45 minutes");
});

test("the fact rows are in a fixed order, with aliases only when there are any", () => {
  const plain = facts(game({}));
  assert.deepEqual(
    plain.map(([label]) => label),
    ["Players", "Deck", "Time", "Difficulty", "Category"],
  );

  const aliased = facts(game({ aliases: ["Crazy Eights", "Switch"] }));
  assert.deepEqual(aliased[0], ["Also known as", "Crazy Eights, Switch"]);
  assert.equal(aliased.length, plain.length + 1);
});

test("difficulty is capitalised for display but not in the data", () => {
  const rows = Object.fromEntries(facts(game({ difficulty: "complex" })));
  assert.equal(rows["Difficulty"], "Complex");
});

test("known categories get their written label", () => {
  assert.equal(categoryLabel("trick-taking"), "Trick-taking");
  assert.equal(categoryLabel("rummy-type"), "Rummy family");
  assert.equal(categoryLabel("solitaire"), "Solitaire (1 player)");
});

test("an unknown category is title-cased rather than dropped", () => {
  assert.equal(categoryLabel("fishing-games"), "Fishing Games");
});

test("games group in the documented category order, skipping empty ones", () => {
  const grouped = gamesByCategory([
    game({ name: "B", category: "shedding" }),
    game({ name: "A", category: "solitaire" }),
    game({ name: "C", category: "shedding" }),
  ]);

  assert.deepEqual(
    grouped.map(([category]) => category),
    ["solitaire", "shedding"],
  );
  assert.deepEqual(grouped[1]?.[1].map((g) => g.name), ["B", "C"]);
});

test("a game with an unrecognised category is shown, not lost", () => {
  const grouped = gamesByCategory([
    game({ name: "Known", category: "casino" }),
    game({ name: "Strange", category: "fishing" as CardGame["category"] }),
  ]);

  assert.deepEqual(grouped.at(-1)?.[0], "other");
  assert.deepEqual(grouped.at(-1)?.[1].map((g) => g.name), ["Strange"]);
});

test("every category in the order has a label", () => {
  for (const category of CATEGORY_ORDER) {
    assert.notEqual(categoryLabel(category), "", `${category} has no label`);
  }
});
