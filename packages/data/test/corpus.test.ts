/**
 * Properties that must hold across every entry in the corpus.
 *
 * The validator checks that entries are well formed. This checks that they can
 * actually be *drawn* and *read*: that every layout produces finite geometry,
 * every figure fits on a page, every shared figure reference resolves. A number
 * that comes out NaN here becomes an invisible card in the PDF, which is the
 * kind of thing nobody notices until it is printed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { blocks, buildDiagram, buildFigure, loadGames, loadSharedFigures } from "naibi";

const games = loadGames();

test("there are games to check", () => {
  assert.ok(games.length >= 30, `only ${games.length} games loaded`);
});

test("games arrive sorted by display name", () => {
  const sorted = [...games].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
  assert.deepEqual(games.map((g) => g.name), sorted.map((g) => g.name));
});

test("every layout produces finite, positive geometry", () => {
  for (const game of games) {
    if (!game.layout) continue;
    const diagram = buildDiagram(game.layout);

    assert.ok(Number.isFinite(diagram.width) && diagram.width > 0, `${game.id}: width`);
    assert.ok(Number.isFinite(diagram.height) && diagram.height > 0, `${game.id}: height`);
    assert.ok(diagram.piles.length > 0, `${game.id}: drew no piles`);

    for (const pile of diagram.piles) {
      for (const card of pile.cards) {
        assert.ok(Number.isFinite(card.x) && card.x >= 0, `${game.id}: card x`);
        assert.ok(Number.isFinite(card.y) && card.y >= 0, `${game.id}: card y`);
      }
    }
    for (const label of diagram.labels) {
      assert.ok(Number.isFinite(label.y), `${game.id}: label y`);
      // A caption whose baseline falls past the bottom of the diagram is drawn
      // over whatever comes next.
      assert.ok(label.y <= diagram.height, `${game.id}: label below the diagram`);
    }
  }
});

test("every figure produces finite geometry and fits the page", () => {
  // Wider than this and the PDF has to shrink it below readable size. Fourteen
  // cards is the schema's limit; this is the practical one.
  const MAX_WIDTH = 14 * 36 + 74;

  for (const game of games) {
    for (const [index, figure] of (game.figures ?? []).entries()) {
      const where = `${game.id} figure ${index + 1}`;
      const built = buildFigure(figure);

      assert.ok(Number.isFinite(built.width) && built.width > 0, `${where}: width`);
      assert.ok(Number.isFinite(built.height) && built.height > 0, `${where}: height`);
      assert.ok(built.cards.length > 0, `${where}: drew no cards`);
      assert.ok(built.width <= MAX_WIDTH, `${where}: ${built.width} units wide`);
    }
  }
});

test("every figure_refs id resolves, and resolves into the game", () => {
  const shared = loadSharedFigures();
  const ids = new Set(Object.keys(shared));
  assert.ok(ids.size > 0, "no shared figures defined");

  for (const game of games) {
    for (const ref of game.figure_refs ?? []) {
      assert.ok(ids.has(ref), `${game.id} references unknown figure "${ref}"`);
      assert.ok(
        game.figures?.some((f) => f.caption === shared[ref]?.caption),
        `${game.id} references "${ref}" but it was not spliced in`,
      );
    }
  }
});

test("every prose section parses into at least one block", () => {
  for (const game of games) {
    for (const key of ["setup", "play", "goal_and_scoring"] as const) {
      assert.ok(blocks(game[key]).length > 0, `${game.id}: ${key} parsed to nothing`);
    }
  }
});

test("no prose section ends mid-list", () => {
  // A section whose last block is a one-item list is usually a bullet that lost
  // its siblings to a bad paste.
  for (const game of games) {
    for (const key of ["setup", "play", "goal_and_scoring"] as const) {
      const last = blocks(game[key]).at(-1);
      if (last?.kind === "list") {
        assert.ok(last.items.length > 1, `${game.id}: ${key} ends in a one-item list`);
      }
    }
  }
});

test("a game whose prose calls for another deck says so as data", () => {
  // The boolean this replaces was never read by anything, so it could say
  // "yes, sometimes" for years without a filter noticing. This asserts the
  // other direction: prose promising a second pack must be backed by a map,
  // or the filter goes on offering the game to someone who cannot play it.
  // "More decks than the baseline, tied to a number of players." Both halves
  // are needed. Without the player count, contract-bridge's convenience second
  // pack and red-dog's casino house style match; without the floor of two, the
  // baseline "1 standard deck" in every entry matches. Durak and Hearts change
  // the PACK with the count rather than the number of decks, and are correctly
  // not caught. Verified against all 72 entries: exactly the 14 with a map.
  const MORE = "[2-9]|1[0-2]|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|second|third|another|more";
  const ANY = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";
  const promisesMoreDecks = new RegExp(
    `\\b(?:${MORE})\\s+(?:52-card |standard )?(?:packs?|decks?)\\b|\\b(?:packs?|decks?) per player\\b`,
    "i",
  );
  const tiedToPlayerCount = new RegExp(
    `\\b(?:${ANY})[- ](?:or more )?players?\\b|\\bper player\\b|\\bthan there are players\\b|\\b\\d+-player\\b`,
    "i",
  );
  const missing = games
    .filter((g) => promisesMoreDecks.test(g.decks) && tiedToPlayerCount.test(g.decks) && !g.equipment.decks_by_players)
    .map((g) => g.id);
  assert.deepEqual(missing, [], "prose promises more decks at a player count, with no decks_by_players");
});

test("every step map is keyed inside the game's player range", () => {
  const strays: string[] = [];
  for (const game of games) {
    for (const key of Object.keys(game.equipment.decks_by_players ?? {})) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < game.players.min || n > game.players.max) {
        strays.push(`${game.id}:${key}`);
      }
    }
  }
  assert.deepEqual(strays, [], "step map keyed outside the game's player range");
});
