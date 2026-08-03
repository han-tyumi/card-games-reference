/**
 * The picker's filter and its deck label, pulled out of main() so they can run
 * without touching process.argv.
 *
 * main() reads process.argv directly for everything else, which is exactly why
 * the deck filter went wrong for a release without anyone noticing: there was
 * nothing here to run it against. withDecksOnHand and deckLabel are the two
 * pieces of that logic that need a game and a table size rather than the
 * command line, so both are extracted and tested on their own.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGames } from "naibi";
import { deckLabel, withDecksOnHand } from "../pick.ts";

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

// --- the printed deck count ------------------------------------------------

test("the deck count printed is the one needed at the table asked for", () => {
  // The filter went through decksNeeded; the printed column still read
  // standard_decks directly, so the display kept saying "1 deck" for a table
  // the filter itself now knew needed two.
  const bs = games.find((g) => g.id === "bs")!;
  assert.equal(deckLabel(bs, 5), "1 deck", "five still fits one pack");
  assert.equal(deckLabel(bs, 8), "2 decks", "eight is past bs's own six-player step");
});

test("with no player count given, the minimum table is printed", () => {
  const bs = games.find((g) => g.id === "bs")!;
  assert.equal(deckLabel(bs), "1 deck");
});

test("a special deck that also scales says both, not just the pack name", () => {
  // special_deck ?? count short-circuited before the count was ever computed,
  // so mau-mau printed its pack name and never told the reader the count
  // doubles at six or more.
  const mauMau = games.find((g) => g.id === "mau-mau")!;
  assert.match(deckLabel(mauMau, 8), /German pack/);
  assert.match(deckLabel(mauMau, 8), /2 decks/);
  assert.doesNotMatch(deckLabel(mauMau, 3), /2 decks/);
});

test("a special deck with no scaling still prints just the pack name", () => {
  const koiKoi = games.find((g) => g.id === "koi-koi")!;
  assert.equal(deckLabel(koiKoi, 2), koiKoi.equipment.special_deck);
});
