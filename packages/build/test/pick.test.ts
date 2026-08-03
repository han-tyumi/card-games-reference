import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGames } from "naibi";
import { withDecksOnHand } from "../pick.ts";

const games = loadGames();
const has = (list: { id: string }[], id: string) => list.some((g) => g.id === id);

test("one deck and eight players does not offer a game that wants two packs", () => {
  // The picker filtered on standard_decks alone, which is the requirement at
  // the SMALLEST table. At eight players slapjack wants a second pack and was
  // offered anyway.
  assert.equal(has(withDecksOnHand(games, 1, 8), "slapjack"), false);
});

test("the same game is still offered at a table it fits", () => {
  assert.equal(has(withDecksOnHand(games, 1, 3), "slapjack"), true);
});

test("with no player count, the smallest table is judged", () => {
  // Nothing else is knowable: the reader has not said how many they are.
  assert.equal(has(withDecksOnHand(games, 1), "slapjack"), true);
});

test("a purpose-built pack is never offered for a count of standard decks", () => {
  assert.equal(has(withDecksOnHand(games, 8, 2), "koi-koi"), false);
});
