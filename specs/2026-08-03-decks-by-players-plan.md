# Decks by player count — Implementation Plan (phase 1 of 2)

- **Status:** Done — shipped in v0.3.2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "can I play this with the decks I own?" answerable at every player
count, in one shared function both the site and the command-line picker use.

**Architecture:** `equipment.extra_deck_for_large_groups` (a boolean nothing
reads) is replaced by `equipment.decks_by_players`, a step map from player count
to decks needed. A single `decksNeeded(game, players)` in `packages/data`
becomes the only place that reading exists, and both consumers are rewired to
call it.

**Tech Stack:** Node 22.18+ running TypeScript directly, no build step. JSON
Schema for the corpus, `json2ts` for generated types, `node --test`.

## Global Constraints

- `npm run check` is the whole gate and must exit 0 before any commit.
- `packages/data` is the only source of truth; anything two generators both need
  goes in a shared module rather than being written twice.
- Never hand-edit `docs/` or `rendered/` — they are generated and gated.
- `packages/data/schema/game.schema.json` is the single source of truth for
  shape; run `npm run types` after changing it.
- Design reference: `specs/2026-08-03-filters-and-search-design.md`.

**Phase 2 (the web controls — range slider, capability checkboxes, multi-select
family, search index) is a separate plan and is not in scope here.** This phase
ships a correct data model and two fixed filters on its own.

---

### Task 1: Replace the boolean with a step map in the schema and the corpus

**Files:**
- Modify: `packages/data/schema/game.schema.json` (the `equipment` object)
- Modify: all 72 files in `packages/data/games/`
- Test: `packages/data/test/corpus.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `equipment.decks_by_players?: Record<string, number>` — optional;
  keys are player counts as decimal strings, values are decks needed from that
  count upward. `equipment.extra_deck_for_large_groups` no longer exists.

- [ ] **Step 1: Write the failing test**

Add to `packages/data/test/corpus.test.ts`:

```ts
test("a game whose prose calls for another deck says so as data", () => {
  // The boolean this replaces was never read by anything, so it could say
  // "yes, sometimes" for years without a filter noticing. This asserts the
  // other direction: prose promising a second pack must be backed by a map,
  // or the filter goes on offering the game to someone who cannot play it.
  const promises = /\b(two|three|second|third|another|more) (?:52-card |standard )?(?:packs?|decks?)\b/i;
  const missing = games
    .filter((g) => promises.test(g.decks) && !g.equipment.decks_by_players)
    .map((g) => g.id);
  assert.deepEqual(missing, [], "prose calls for another deck with no decks_by_players");
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test packages/data/test/corpus.test.ts`
Expected: FAIL — `decks_by_players` does not exist yet, so every game whose
prose promises a second pack is listed.

- [ ] **Step 3: Change the schema**

In `packages/data/schema/game.schema.json`, inside `properties.equipment`:
remove `"extra_deck_for_large_groups"` from the `required` array and delete its
property block. Then add:

```json
"decks_by_players": {
  "description": "How many decks are needed from a given player count upward, e.g. {\"6\": 2} for a game that wants a second pack from six players. Read as: the value for the largest key at or below the table size, falling back to standard_decks. Omit when the requirement never changes. Use it for per-player games too -- Nertz needs one deck each, so every count gets an entry.",
  "type": "object",
  "propertyNames": { "pattern": "^[1-9][0-9]?$" },
  "additionalProperties": { "type": "integer", "minimum": 1, "maximum": 12 },
  "minProperties": 1
}
```

- [ ] **Step 4: Migrate the corpus**

Run this once, then delete it — it is a migration, not a tool:

```bash
node --input-type=module -e '
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const DIR = "packages/data/games";
const MAPS = {
  "dou-dizhu": {4:2}, "contract-rummy": {5:3}, "golf-multiplayer": {5:2},
  "palace": {5:2}, "rummy-500": {5:2}, "bs": {6:2}, "crazy-eights": {6:2},
  "mau-mau": {6:2}, "slapjack": {6:2}, "egyptian-ratscrew": {7:2},
  "indian-rummy": {7:3}, "president": {8:2},
  "hand-and-foot": {2:3,3:4,4:5,5:6,6:7},
  "nertz": {2:2,3:3,4:4,5:5,6:6,7:7,8:8},
};
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const path = `${DIR}/${file}`;
  const game = JSON.parse(readFileSync(path, "utf8"));
  delete game.equipment.extra_deck_for_large_groups;
  const map = MAPS[game.id];
  if (map) game.equipment.decks_by_players = map;
  writeFileSync(path, `${JSON.stringify(game, null, 2)}\n`);
}
console.log("migrated");
'
```

- [ ] **Step 5: Regenerate the types**

Run: `npm run types`
Expected: `packages/data/src/types.ts` (or wherever `json2ts` writes) loses
`extra_deck_for_large_groups` and gains optional `decks_by_players`.

- [ ] **Step 6: Run the gate**

Run: `npm run check`
Expected: exit 0. If `render`/`web`/`pdf` `--check` fail, the equipment change
reached a generated page — run `npm run build` and inspect the diff before
committing it.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Replace the extra-deck boolean with a map of decks by player count

The boolean said that a bigger table wants another pack, never how many or
from where, so nothing could act on it and nothing did. The map says both,
and covers the two games whose requirement climbs with every seat rather
than stepping once: hand-and-foot needs a deck more than there are players,
nertz one each.

Twelve of the fourteen numbers were already stated in the entries' own
prose, which has been read against sources and stamped, so they are recorded
rather than estimated."
```

---

### Task 2: One shared reading of "how many decks does this need"

**Files:**
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/test/corpus.test.ts`

**Interfaces:**
- Consumes: `equipment.decks_by_players` from Task 1.
- Produces:
  - `decksNeeded(game: CardGame, players: number): number`
  - `playableWith(game: CardGame, players: number, decksHeld: number): boolean`

- [ ] **Step 1: Write the failing test**

Add to `packages/data/test/corpus.test.ts`:

```ts
test("a step map raises the requirement from its key upward", () => {
  const bs = games.find((g) => g.id === "bs")!;
  assert.equal(decksNeeded(bs, 5), 1, "five players still fit one pack");
  assert.equal(decksNeeded(bs, 6), 2, "six is where the second pack starts");
  assert.equal(decksNeeded(bs, 10), 2, "and it stays at two above that");
});

test("a per-player game climbs with every seat", () => {
  const nertz = games.find((g) => g.id === "nertz")!;
  assert.equal(decksNeeded(nertz, 2), 2);
  assert.equal(decksNeeded(nertz, 8), 8, "everyone plays their own deck");
});

test("a game with no map needs the same packs at every count", () => {
  const hearts = games.find((g) => g.id === "hearts")!;
  assert.equal(decksNeeded(hearts, 3), hearts.equipment.standard_decks);
  assert.equal(decksNeeded(hearts, 6), hearts.equipment.standard_decks);
});

test("a purpose-built pack is never playable from standard decks", () => {
  // standard_decks 0 means a pack ordinary cards cannot stand in for, so no
  // number of decks held may answer yes. This was a real defect in the picker
  // before it was one on the site.
  const koiKoi = games.find((g) => g.id === "koi-koi")!;
  assert.equal(playableWith(koiKoi, 2, 8), false);
});

test("the decks a table needs are the decks it is asked for", () => {
  const slapjack = games.find((g) => g.id === "slapjack")!;
  assert.equal(playableWith(slapjack, 2, 1), true, "two players, one pack");
  assert.equal(playableWith(slapjack, 8, 1), false, "eight players want two");
  assert.equal(playableWith(slapjack, 8, 2), true);
});
```

Add `decksNeeded` and `playableWith` to that file's existing import from
`naibi`.

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test packages/data/test/corpus.test.ts`
Expected: FAIL — `decksNeeded is not a function`.

- [ ] **Step 3: Implement both, in `packages/data/src/index.ts`**

```ts
/**
 * How many standard decks a game needs at a given table size.
 *
 * `standard_decks` is the requirement at the *minimum* player count, which is
 * what the schema has always said it was — so on its own it understates every
 * game that wants another pack as the table grows. `decks_by_players` supplies
 * the counts it cannot, and this is the only place that reading exists: the
 * site and the picker both ask here, because two copies of it drifted once
 * already.
 *
 * Keys are sorted rather than trusted in insertion order, so a hand-edited
 * entry cannot change the answer by listing its steps out of order.
 */
export function decksNeeded(game: CardGame, players: number): number {
  const steps = game.equipment.decks_by_players;
  if (!steps) return game.equipment.standard_decks;

  let needed = game.equipment.standard_decks;
  for (const key of Object.keys(steps).sort((a, b) => Number(a) - Number(b))) {
    if (players >= Number(key)) needed = steps[key]!;
  }
  return needed;
}

/**
 * Can a reader holding this many decks play this game at this table size?
 *
 * A purpose-built pack (`standard_decks: 0`) is never yes, however many decks
 * are held — hanafuda is not something a 52-card deck stands in for. The way
 * this function fails badly is by saying yes when the answer is no, which
 * looks like a working filter until someone reaches for a deck they do not own.
 */
export function playableWith(game: CardGame, players: number, decksHeld: number): boolean {
  if (game.equipment.standard_decks === 0) return false;
  return decksNeeded(game, players) <= decksHeld;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test packages/data/test/corpus.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gate**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/index.ts packages/data/test/corpus.test.ts
git commit -m "Read the deck requirement in one place, at the count being asked

standard_decks is the requirement at the minimum player count, so on its own
it understates every game that wants another pack as the table fills. Both
the site and the picker had their own copy of the wrong reading; this is the
only copy of the right one."
```

---

### Task 3: Fix the picker, which has the same false yes

**Files:**
- Modify: `packages/build/pick.ts:91-98`
- Test: `packages/build/test/pick.test.ts` (create if absent)

**Interfaces:**
- Consumes: `playableWith(game, players, decksHeld)` from Task 2.
- Produces: `withDecksOnHand(games: readonly CardGame[], decks: number,
  players?: number): CardGame[]`, exported from `packages/build/pick.ts`.

**Why the filter must be extracted first.** All of the picker's filtering is
inline inside `main()`, reading `process.argv` directly, so nothing can test it.
A test that only asserts on `playableWith` would pass the moment Task 2 landed
and would not notice `pick.ts` regressing at all — a test that does not cover
its own change. One small extraction makes the picker's behaviour testable
without restructuring `main()`.

- [ ] **Step 1: Write the failing test**

Create `packages/build/test/pick.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test packages/build/test/pick.test.ts`
Expected: FAIL — `withDecksOnHand` is not exported from `pick.ts`.

Also confirm the bug is live at the command line:
Run: `npm run pick -- --players 8 --decks 1`
Expected before the fix: `slapjack` appears in the output.

- [ ] **Step 3: Extract the filter and rewire it**

In `packages/build/pick.ts`, add `playableWith` to the existing `naibi` import
and add this above `main()`:

```ts
/**
 * The games a reader holding `decks` packs can play, at `players` if they said.
 *
 * Extracted from `main` so it can be tested: everything else here reads
 * `process.argv`, which is why the deck filter went wrong unnoticed. A
 * purpose-built pack (`standard_decks: 0`) is never playable from ordinary
 * decks however many are held, and without a player count the smallest table
 * is the only thing knowable.
 */
export function withDecksOnHand(
  games: readonly CardGame[],
  decks: number,
  players?: number,
): CardGame[] {
  return games.filter((game) =>
    players === undefined
      ? game.equipment.standard_decks > 0 && game.equipment.standard_decks <= decks
      : playableWith(game, players, decks),
  );
}
```

> **Record, not instruction:** this two-branch version is what actually landed
> first, but it re-implemented `playableWith`'s own `standard_decks === 0` rule
> in the one file told not to re-derive deck logic. "Fix round 1" (commit
> `7928879`) replaced it with the single line below, because judging a game at
> its own `players.min` calls `playableWith` correctly by construction — the
> no-count branch does not need its own copy of a rule `playableWith` already
> enforces:
>
> ```ts
> return games.filter((game) => playableWith(game, players ?? game.players.min, decks));
> ```
>
> What shipped is the single-line version. The two-branch code above is left as
> written because this document describes what was built, in the order it was
> built, not what should be built next.

Then replace the `--decks` filter body in `main()` (currently lines 91-98):

```ts
  if (decks !== undefined) {
    games = withDecksOnHand(games, decks, players);
    reasons.push(`${decks} deck${decks === 1 ? "" : "s"}`);
  }
```

- [ ] **Step 4: Confirm the bug is gone**

Run: `npm run pick -- --players 8 --decks 1`
Expected: `slapjack`, `bs`, `egyptian-ratscrew`, `mau-mau` and `rummy-500` are
no longer listed.

Run: `npm run pick -- --players 3 --decks 1`
Expected: `slapjack` is listed again.

- [ ] **Step 5: Run the gate**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/build/pick.ts packages/build/test/pick.test.ts
git commit -m "Stop the picker offering games that want a deck you did not say you had

--players 8 --decks 1 listed five games that all want a second pack at that
size. It filtered on standard_decks, which is the requirement at the
smallest table."
```

---

### Task 4: Fix the same false yes on the site

**Files:**
- Modify: `packages/web/records.ts` (the `Facet` type and `facetsFor`)
- Modify: `packages/web/assets/facets.js` (the `Facet` typedef and `matches`)
- Test: `packages/web/test/facets.test.ts`

**Interfaces:**
- Consumes: `decksNeeded(game, players)` from Task 2, called at build time.
- Produces: `Facet.dn: number[] | null` — decks needed at each seat from `lo`
  upward, or null when the requirement never changes. Phase 2's players range
  consumes it unchanged.

**Why a precomputed array rather than the map itself.** `facets.js` ships to the
browser and cannot import `naibi`, so shipping the raw map would put a second
copy of the step-evaluation rule in the browser — the exact duplication Task 2
exists to remove, and the one this project has already been bitten by. Instead
`facetsFor` runs `decksNeeded` at build time, once per seat, and the browser
does an array lookup with no rule in it at all.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/test/facets.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test packages/web/test/facets.test.ts`
Expected: FAIL — the first assertion returns `true`, which is the bug.

- [ ] **Step 3: Precompute the requirement per seat, at build time**

In `packages/web/records.ts`, add `decksNeeded` to the existing `naibi` import,
then add to the `Facet` type:

```ts
  /**
   * Decks needed at each seat from `lo` upward, or null when the requirement
   * never changes. Precomputed because the browser must not carry a second
   * copy of the rule that reads the step map.
   */
  dn: number[] | null;
```

and inside `facetsFor`'s returned object, after `d`:

```ts
      dn: game.equipment.decks_by_players
        ? Array.from({ length: game.players.max - game.players.min + 1 }, (_, i) =>
            decksNeeded(game, game.players.min + i),
          )
        : null,
```

- [ ] **Step 4: Read it in the matcher**

In `packages/web/assets/facets.js`, add to the `Facet` typedef:

```js
 * @property {number[] | null} dn decks needed at each seat from `lo` upward
```

and replace the `criteria.decks` block in `matches`:

```js
  // A game needing its own pack is unreachable for someone holding a 52-card
  // deck, so "0 decks <= 1 deck" must NOT read as playable. This was a real
  // defect in the command-line picker before it was one here.
  //
  // The requirement is read at the player count the reader gave, because `d`
  // is what the game needs at its SMALLEST table: slapjack is one pack at
  // three players and two at eight, and answering from `d` alone offered it
  // to someone with one deck and eight friends. `dn` is computed at build
  // time so the rule behind it lives in one place, which is not this file.
  if (criteria.decks) {
    if (facet.d === 0) return false;
    const held = Number(criteria.decks);
    // Falls back to the smallest table when no count was given, because
    // nothing else is knowable then. The players chip is checked above, so a
    // count outside the range has already returned; the clamp is here so an
    // out-of-range index can never read as undefined, which would compare
    // false and pass a game that should have been refused.
    const at = criteria.players ? Number(criteria.players) : facet.lo;
    const seat = Math.min(Math.max(at, facet.lo), facet.hi) - facet.lo;
    if ((facet.dn ? facet.dn[seat] : facet.d) > held) return false;
  }
```

- [ ] **Step 5: Run the tests**

Run: `node --test packages/web/test/facets.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gate**

Run: `npm run check`
Expected: exit 0. `docs/` changes because the embedded facet JSON gained `dn`;
run `npm run build` and commit the regenerated site with the change.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Judge the deck chip at the player count the reader gave

\"One deck\" and \"eight players\" is one question, and slapjack is a yes to
each of them separately and a no to both. The chip read standard_decks,
which is what a game needs at its smallest table, so five games were offered
to a reader who had said they had one pack."
```

---

## Self-review notes

**Spec coverage for this phase.** The step map, its evaluation rule, the removal
of the boolean, the twelve recorded thresholds, the two per-player games, and
the requirement that the reading live in one shared place are all covered by
Tasks 1-4. Everything else in the design document — the players range slider,
`ideal` ranking, capability checkboxes, multi-select family, the search index
and placeholder, the empty state — is phase 2 and deliberately absent.

**One thing this phase leaves half-answered, by choice.** `matches` falls back
to the game's minimum player count when the reader has set a deck chip but no
player count. That is the only honest reading available — they have not said how
many they are — but it means the deck chip alone still under-reports for a large
table. Phase 2's range makes the count almost always present, which is when this
stops mattering; it is written down here rather than left for someone to
rediscover.

**Deferred deliberately:** the deck chip values stay the hand-typed `1, 2` in
this phase. Deriving them is phase 2's work, and doing it here would mean
shipping a chip set the range slider is about to change again.
