# Filters and search — Implementation Plan (phase 2 of 2)

- **Status:** Done — shipped in v0.3.3, with the branch previews added along the way

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship everything in
[`2026-08-03-filters-and-search-design.md`](2026-08-03-filters-and-search-design.md)
that phase 1 did not — the players range, derived deck chips, the preparation
axis, multi-select family, the pack in the search index, and an empty state that
says what emptied it.

**Architecture:** `packages/web/assets/facets.js` already owns every decision the
index page makes that is not the DOM, and it stays that way: the range, the
overlap test, the coverage ranking, the option list for the floor and the
sentence in the empty state are all functions there, tested against the real
corpus. `records.ts` precomputes per-game facts at build time because
`assets/*.js` ships to the browser and cannot import `naibi`. `app.js` gains
nodes to move about and no rules.

**Tech Stack:** Node 22.18+ running TypeScript directly, no build step.
`node --test`. Chromium + Playwright, preinstalled, for the half of this phase
that tests cannot see.

## Global Constraints

- `npm run check` is the whole gate and must exit 0 before any commit. It is an
  `&&` chain: if the test stage ran, everything before it passed.
- `packages/web/assets/*.js` ships to the browser and **cannot import `naibi`**.
  Anything derived from the corpus is precomputed in `records.ts`.
- Never hand-edit `docs/` or `rendered/` — generated and gated. `npm run web`
  deletes `docs/` and rewrites it.
- `noUncheckedIndexedAccess` is on. Indexing an array yields `T | undefined`.
- Do not touch any entry's `setup`, `play` or `goal_and_scoring`; the 72 `checked`
  records are complete and `proseFingerprint` covers exactly those three fields.
- Search `FIELDS` bits are baked into every published index. A new field takes
  the next free bit (128); nothing is renumbered.
- Design reference: `specs/2026-08-03-filters-and-search-design.md`.

## Decisions taken before this plan was written

Three points the design document leaves open or answers in language that
predates its own later sections. Settled with the human, recorded here so they
are not re-litigated mid-implementation:

- **Ranking precedence is score → coverage → ideal → source order.** Design §7
  predates the coverage rule and never says where coverage sits; without this,
  a card badged "plays with any of 4-6" could sort below one that does not, in
  the same list. With no query the first term drops out and coverage leads.
- **Deck chips stay derived from `standard_decks` (`1, 2, 3, 6`)**, and time
  chips stay out of scope. Both as recorded in the design; both fail in the safe
  direction.
- **The CLI picker is untouched.** `--players 5` already means the range 5-5
  under the new model, so it keeps working with no change and nothing drifts.

## What is not in scope

Time chips (thresholds are a judgement, not a property of the data). Equipment
beyond the deck. Any change to `packages/build/pick.ts`. Any change to an
entry's prose.

---

### Task 1: A players range that filters by overlap

**Files:**
- Modify: `packages/web/assets/facets.js`
- Modify: `packages/web/records.ts`
- Test: `packages/web/test/facets.test.ts`

**Interfaces:**
- Produces: `playerRange(criteria) -> {lo, hi} | null` — the single place the
  range is derived and clamped. `null` when no count is set **or** the value
  does not parse.
- Consumes: `criteria.players` (the headcount, top of range) and `criteria.from`
  (the optional floor).
- `Facet` gains `i: number`, the game's `players.ideal`, for task 4.

**Semantics:**

```
range   = players ? { lo: clamp(from ?? players, 1, players), hi: players } : null
matches = range ? facet.lo <= range.hi && facet.hi >= range.lo : true
```

Clamping inside `playerRange` is the whole of "the range cannot invert" — a
floor above the count becomes the count, and there is no other path to a range.

An existing `?players=5` link parses to `{lo:5, hi:5}`, which is the exact-count
filter it has always meant. That is why no migration is needed.

Garbled input keeps today's behaviour exactly: `?players=abc` leaves the players
filter inert (it is already dropped by `allowed` on the index; only the print
sheet can see it), while the deck branch below refuses outright. Changing that
is not this phase's business.

- [ ] **Step 1: Write the failing tests**

```ts
test("a game seating exactly 5 matches the range 5-6", () => {
  // Overlap, stated as a test so it cannot quietly become containment. The
  // design rejects containment as a gate because it hides 20 titles that a
  // party of six can play by benching two.
  assert.equal(matches(facet({ lo: 5, hi: 5 }), { players: "6", from: "5" }), true);
});

test("a range and a bare count agree when the floor is the count", () => { ... });
test("an existing single-value players link still means exactly that count", () => { ... });
test("a floor above the count is clamped, not inverted", () => {
  assert.deepEqual(playerRange({ players: "4", from: "9" }), { lo: 4, hi: 4 });
});
test("no reachable combination of chip and floor produces an inverted range", () => {
  // Every pair the controls can produce, not a sampled few.
});
```

- [ ] **Step 2: Confirm each new test can fail** — invert the comparison in
  `matches`, run, see red, restore. A test that cannot come back red has not
  been shown to be running. (Three times last session a check reported success
  while checking nothing.)
- [ ] **Step 3: Implement** — `playerRange`, the overlap branch, `i` on `Facet`.
- [ ] **Step 4: `npm run check`**
- [ ] **Step 5: Commit** — `Filter players by overlap with a range, not an exact count`

---

### Task 2: The deck requirement is read across the whole range

**Files:**
- Modify: `packages/web/assets/facets.js`
- Test: `packages/web/test/facets.test.ts`

**Interfaces:** no new export; the `criteria.decks` branch of `matches` changes.

**Semantics:** the design's formula, literally —

```
∃ n ∈ [range.lo, range.hi] ∩ [facet.lo, facet.hi] : decksNeeded(n) ≤ held
```

Implemented as a loop over the intersection rather than as "check the smallest
n", **because the step map is not required to be monotonic**. `decks_by_players`
is an object of integers; nothing in the schema stops `{"4":2,"6":1}`. Taking
the minimum seat would be correct only under an assumption no validator
enforces, and the intersection is at most twelve wide.

With no range set the intersection is `[facet.lo, facet.lo]` — one iteration,
which is today's behaviour unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
test("a flagged game is offered below its threshold and refused above it", () => {
  // slapjack: one pack at three players, two at six. Both directions.
});
test("one deck and a range spanning the threshold still offers the game", () => {
  // 4-6 players with one deck keeps slapjack: four is playable, six is not,
  // and the reader can seat four.
});
test("a per-player game's requirement climbs with the count", () => {
  // nertz needs 8 decks at 8 players; one deck held never offers it above one.
});
test("a game whose step map dips is judged at every seat, not the smallest", () => {
  // Synthetic dn, because the corpus has no non-monotonic entry -- which is
  // exactly why the loop must not assume there never will be one.
});
```

- [ ] **Step 2: Confirm each can fail** — replace the loop with `needed(lo)`,
  see the dipping-map test go red, restore.
- [ ] **Step 3: Implement**
- [ ] **Step 4: `npm run check`**
- [ ] **Step 5: Commit** — `Read the deck requirement at every seat in range, not just the smallest`

---

### Task 3: Preparation as capabilities, matched by subset

**Files:**
- Modify: `packages/web/records.ts`, `packages/web/assets/facets.js`
- Test: `packages/web/test/facets.test.ts`

**Interfaces:**
- `Facet` gains `p: number`, a bitmask of what must be done to a deck:
  `1` add jokers, `2` strip cards, `4` obtain a different pack.
- `export const PREP = { jokers: 1, strip: 2 }` — the two the checkboxes offer.
  There is deliberately no token for `4`.
- `criteria.prep` is a comma-separated list of `PREP` keys; absent or empty
  means **untouched**, which is no constraint at all.

**Derivation, in `records.ts`, from `equipment` alone so it cannot drift:**

```
standard_decks === 0        -> 4   (and only 4: a hanafuda pack is not a stripped 52)
otherwise: special_deck     -> |2
           jokers > 0       -> |1
```

Measured: 50 games at `0`, 5 at `1`, 16 at `2`, `five-hundred` at `3` (it needs
both), `koi-koi` at `4`.

**The test is `(facet.p & ~held) === 0`, not `p <= held`.** A ceiling claims
these are degrees of one thing; they are not, and a ceiling hands someone with
no jokers a list of games needing jokers. `koi-koi` carries a bit no checkbox
can set, so it appears only while the control is untouched — the same treatment
`standard_decks: 0` already gets from the deck count.

- [ ] **Step 1: Write the failing tests**

```ts
test("preparation is a subset test, not a ceiling", () => {
  // Ticking "I can strip a deck" alone never returns a game needing jokers.
  // This is the assertion that would have caught the design's first draft.
});
test("a game needing both capabilities requires both to be ticked", () => {
  // five-hundred: a stripped pack AND a joker.
});
test("a pack nobody can improvise is offered only when the control is untouched", () => {
  // koi-koi, both directions.
});
test("every game's preparation bits come from its equipment", () => {
  // Whole corpus, derived vs re-derived from the entry. Names no literal.
});
test("the four preparation states are the sizes the design measured", () => {
  // 50 / 5 / 16 / 1. A number changing here is an entry changing, not a bug,
  // but it should be a decision rather than a surprise.
});
```

- [ ] **Step 2: Confirm each can fail** — swap the subset test for `p <= held`;
  the first test must go red.
- [ ] **Step 3: Implement**
- [ ] **Step 4: `npm run check`**
- [ ] **Step 5: Commit** — `Filter on what the reader can do to a deck, by subset`

---

### Task 4: Multi-select family, and the URL that carries it

**Files:**
- Modify: `packages/web/assets/facets.js`
- Test: `packages/web/test/facets.test.ts`

**Interfaces:**
- `export const MULTI = new Set(["category", "prep"])` — the params holding a
  list. `PARAMS` gains `from` and `prep`.
- `readQuery` validates a multi-valued param **per token** against `allowed`,
  keeping the survivors in the order given and dropping the param when none
  survive. `writeQuery` joins with `,`.

Family stays an exact match per value and combines with OR, because it is
browsing rather than constraint.

- [ ] **Step 1: Write the failing tests**

```ts
test("two families show both and nothing else", () => { ... });
test("a family list round-trips through the URL", () => { ... });
test("a stale family in a list is dropped without dropping the rest", () => { ... });
test("an existing single-family link still selects that family", () => { ... });
test("every family is linkable, singly and in pairs", () => { ... });
```

- [ ] **Step 2: Confirm each can fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: `npm run check`**
- [ ] **Step 5: Commit** — `Let the family chips select more than one family`

---

### Task 5: Ranking by coverage, and the badge that says so

**Files:**
- Modify: `packages/web/assets/facets.js`
- Test: `packages/web/test/facets.test.ts`

**Interfaces:**
- `plan()` returns `{order, count, marks}`; `marks` is a
  `Map<number, string>` from list index to badge text. `print.js` destructures
  `{order}` and is unaffected.
- Precedence, stable-sorted so source order holds inside every group:

```
state.q && hits ?  score ↓ · coverage ↓ · ideal ↓ · source
                :            coverage ↓ · ideal ↓ · source
```

- `coverage` is `facet.lo <= range.lo && facet.hi >= range.hi` — 1 or 0.
- `ideal` is `range.lo <= facet.i <= range.hi` — 1 or 0.
- Both are 0 when no range is set, so nothing reorders until a count is chosen.
- **The badge appears only when `range.hi > range.lo`.** At a single count,
  coverage and overlap are the same set and every card would carry it, which
  says nothing. Text: `plays with any of 4-6`.

The wording lives here rather than in `app.js` so it is testable, which is
already why `countLabel` is here.

- [ ] **Step 1: Write the failing tests**

```ts
test("`ideal` never removes a game", () => {
  // The result COUNT for a range is identical however ideal is distributed.
  // This is what stops the ranking becoming a filter by accident.
});
test("coverage never removes a game either", () => { ... });
test("a game covering the whole range sorts above one that overlaps it", () => { ... });
test("with a query, score still wins, and coverage breaks its ties", () => { ... });
test("source order survives inside a ranking group", () => { ... });
test("an exact count badges nothing, because every match would carry it", () => { ... });
test("only covering games are badged, and the badge names the range", () => { ... });
```

- [ ] **Step 2: Confirm each can fail** — drop `coverage` from the comparator
  and watch the ordering tests go red; make coverage a filter and watch the
  "never removes" tests go red.
- [ ] **Step 3: Implement**
- [ ] **Step 4: `npm run check`**
- [ ] **Step 5: Commit** — `Rank by coverage and ideal, and say which games cover the range`

---

### Task 6: The floor's options, with live counts

**Files:**
- Modify: `packages/web/assets/facets.js`
- Test: `packages/web/test/facets.test.ts`

**Interfaces:**
- `floorOptions(facets, state, hits) -> {value: string, label: string, count: number}[]`
  — one entry per value from `1` to the chosen count, each labelled with how
  many games that floor would show **under the rest of the current state**, so
  the number on the option is the number the reader will get.
- Empty array when no count is chosen; the control has nothing to be below.

Counts are computed by calling `plan()` with the candidate floor, so the option
cannot promise a different list from the one the page renders. Twelve calls over
72 facets per keystroke is nothing.

The cliff is otherwise invisible: at six, dropping the floor to four goes from
36 games to 56, and there is no way to discover that without being told.

- [ ] **Step 1: Write the failing tests**

```ts
test("the floor offers every value at or below the count, and no more", () => { ... });
test("an option's count is the number of games that floor actually shows", () => {
  // Cross-checked against plan() for the same state, not against a literal.
});
test("the counts fall as the floor rises", () => {
  // Monotonic by construction -- a wider range can only overlap more games.
});
test("the option counts respect the other chips", () => {
  // With "1 deck" set, the floor's numbers are the filtered numbers.
});
test("no count chosen means no options", () => { ... });
```

- [ ] **Step 2: Confirm each can fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: `npm run check`**
- [ ] **Step 5: Commit** — `Offer the range floor with the counts it would produce`

---

### Task 7: The empty state explains itself

**Files:**
- Modify: `packages/web/assets/facets.js`
- Test: `packages/web/test/facets.test.ts`

**Interfaces:**
- `emptyReason(state, families) -> string` — one sentence naming the filters
  that are set. `families` maps a category id to its label.
- The solitaire case gets its own sentence: when `solitaire` is the only family
  selected and the range excludes 1, the list is empty because of a fact about
  the corpus rather than a mistake by the reader. Measured: all 11 solitaire
  games are `1-1`, and no 1-player game sits outside the family.

The Clear filters button stays.

- [ ] **Step 1: Write the failing tests**

```ts
test("the empty state names every filter that is set", () => { ... });
test("solitaire above one player is explained as a fact, not a typo", () => { ... });
test("solitaire plus another family gets the ordinary sentence", () => {
  // The list is not solitaire's fault alone once something else is ticked.
});
test("the sentence names families by label, not by id", () => { ... });
test("every state that empties the list produces a sentence naming a real cause", () => {
  // Drive it from the corpus: for each single filter value, if it empties the
  // list, the sentence must mention that filter.
});
```

- [ ] **Step 2: Confirm each can fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: `npm run check`**
- [ ] **Step 5: Commit** — `Say which filters emptied the list`

---

### Task 8: Search indexes the pack, and the placeholder says what it covers

**Files:**
- Modify: `packages/web/assets/search.js`, `packages/web/records.ts`,
  `packages/web/build-web.ts`
- Test: `packages/web/test/search.test.ts`, `packages/web/test/site.test.ts`

**Interfaces:**
- `FIELDS` gains `{ key: "pack", bit: 128, weight: 3, label: "the deck" }`.
  Bit 128 is the next free one; nothing is renumbered, because the bits are
  baked into every published index.
- `SearchRecord` gains `pack: string`, built from `game.decks` and
  `equipment.special_deck`.

Weight 3 sits above prose (1-2) and below aliases (5): "euchre deck" should find
Euchre, but a game merely mentioning a euchre deck in its variants should not
outrank one named after it.

The placeholder stops saying "every rule" when the index also covers names,
aliases, families and tags.

- [ ] **Step 1: Write the failing tests**

```ts
test("a game is findable by its pack", () => {
  // "euchre deck" -> euchre; "piquet pack" -> piquet; "skat pack" -> skat.
  // All three phrases are verbatim in the data and returned nothing before.
});
test("a pack match does not outrank a name match", () => { ... });
test("the placeholder does not undersell the index", () => {
  // It named "every rule" while indexing names, aliases, families and tags.
});
test("a phrase that is in no entry returns nothing", () => {
  // The control. Search for invented words; if results come back, the tool is
  // not doing what it looks like it is doing and none of the above is evidence.
});
```

- [ ] **Step 2: Confirm each can fail** — the control test especially: it is
  worthless unless a deliberately broken index makes it red.
- [ ] **Step 3: Implement**
- [ ] **Step 4: `npm run check`**
- [ ] **Step 5: Commit** — `Index the pack, and stop underselling the search box`

---

### Task 9: The page — derived chips, the floor, and two checkbox groups

**Files:**
- Modify: `packages/web/build-web.ts`, `packages/web/assets/app.js`,
  `packages/web/assets/style.css`
- Test: `packages/web/test/site.test.ts`

**Interfaces:**
- `chipGroup(name, label, options, type)` — `"radio"` keeps an "Any" chip and
  exactly one selection; `"checkbox"` has no "Any" chip, because none-ticked
  already means any and a checkbox called "Any" would need scripting to behave.
- Players chips: derived `1`-`12` from the corpus, not typed.
- Deck chips: derived distinct non-zero `standard_decks` — `1, 2, 3, 6`.
- The floor:

```html
<details class="floor" id="floor" hidden>
  <summary>Might you be fewer?</summary>
  <label for="from">As few as</label>
  <select id="from" name="from">…1-12…</select>
</details>
```

  Hidden while no count is chosen. Options pruned to the count and relabelled
  with live counts by `app.js`. **`open` on load whenever the URL carries a
  floor** — a shared link that filters from a collapsed panel is this project's
  own "says yes when the answer is no" in a new costume.

- Group headings become `<span class="facetlabel" id="...">` with
  `role="group" aria-labelledby` on the chips, so the two new multi-select
  groups are announced as groups. A `<label>` with no `for` labels nothing;
  that is what is there today and it is worth fixing while adding two more.

**Existing tests that must change, and why:**
- `each filter is one labelled group` — 5 groups becomes 6, and its
  `<div class="facet">…</div></div>` regex cannot see the `<details>` now
  nested in the Players group. Rewrite it to parse groups properly rather than
  loosening the assertion.
- `every family in the corpus has a chip to filter by` — the expected values
  lose the leading `""`, since a checkbox group has no "Any".
- `a family chip does not repeat the heading it sits under` — heading element
  changed.

- [ ] **Step 1: Write the failing tests**

```ts
test("the players chips are derived, not typed", () => {
  // 1..12, and every count the corpus can seat has a chip.
});
test("every game is reachable by some setting of every control", () => {
  // Names no literal, so it cannot go stale, and it catches a future entry the
  // derivation mishandles however the values were produced.
});
test("the derived player span stays at or under 16 seats", () => {
  // The one place a static assertion belongs. Four above today's maximum: room
  // for ordinary growth, red on an outlier that would wreck the chip row.
});
test("the deck chips equal the distinct non-zero deck counts in the corpus", () => { ... });
test("the floor control is a native details, and starts closed and hidden", () => { ... });
test("the floor select carries its own accessible name", () => {
  // Distinct from the chip group's, so a screen reader does not announce one
  // control twice.
});
test("every chip group is announced as a group", () => { ... });
test("the preparation checkboxes are checkboxes, and offer no 'Any'", () => { ... });
test("every focusable control has an author-declared focus ring", () => {
  // Existing test -- confirm it covers select and summary, and extend if not.
});
```

- [ ] **Step 2: Confirm each can fail**
- [ ] **Step 3: Implement** — including `app.js`: rebuild the floor's options on
  every apply, open the `<details>` when a floor arrives in the URL, handle
  checkboxes in the state sync and in Clear filters, and render `marks` onto the
  cards.
- [ ] **Step 4: `npm run check`**
- [ ] **Step 5: Commit** — `Derive every chip row, and add the floor and the preparation checkboxes`

---

### Task 10: The print sheet says the new filters in words

**Files:**
- Modify: `packages/web/assets/print.js`, `packages/web/build-web.ts`
- Test: `packages/web/test/site.test.ts`

`describe()` already names the filters on a printed sheet. It must learn the
range ("4-6 players"), a family list, and the preparation boxes, or a sheet
printed from a phase-2 filter claims to be something it is not.

The index page also needs the family labels JSON that the print sheet already
embeds, for task 7's empty sentence.

- [ ] **Step 1: Write the failing tests**

```ts
test("a printed sheet names a range, not just a count", () => { ... });
test("a printed sheet names every family selected", () => { ... });
test("a printed sheet says what was assumed about the reader's deck", () => { ... });
test("every filter the index offers can be said in words", () => {
  // Drive it from PARAMS, so a control added without a phrase fails here
  // rather than printing a sheet that quietly understates itself.
});
```

- [ ] **Step 2: Confirm each can fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: `npm run check`**
- [ ] **Step 5: Commit** — `Say the new filters in words on the printed sheet`

---

### Task 11: Look at it

**Files:** none committed beyond a scratch driver script.

Phase 1 was data and logic, where tests were sufficient proof. This is not. A
chip row that filters correctly can still be unusable; a `<details>` that opens
can still be invisible; a focus ring can pass its test and be unreadable against
the accent colour. Chromium and Playwright are preinstalled
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; do not run `playwright install`).

- [ ] **Step 1: Serve `docs/` and drive it** — there is a `run` skill for this.
- [ ] **Step 2: Walk the whole control surface and look at every screenshot**
  - the chip row at 320px, 768px and desktop — 13 players chips wrap to how many
    rows on a phone, and does the row still read as one control
  - the floor closed, open, and reopened from a URL carrying one
  - the option labels: do the live counts fit, and is the cliff legible
  - both colour schemes, since chips invert their text in dark mode
  - keyboard only: tab through every group, operate the `<details>`, read the
    focus ring against the accent on both schemes
  - the coverage badge on a card, and the empty state's sentence
- [ ] **Step 3: Break something on purpose and confirm the driver sees it** — a
  poller that only greps for success strings cannot tell a dead run from a
  passing one. Change a filter to return nothing and confirm the screenshots
  change.
- [ ] **Step 4: Fix what looking found**, with a test for anything a test can
  hold, and say plainly what was judged by eye and therefore rests on judgement.
- [ ] **Step 5: Commit** — one commit per fix, named for the fix.

---

### Task 12: Bring the design document in line with what shipped

**Files:** Modify `specs/2026-08-03-filters-and-search-design.md`

Three of its test claims describe the **rejected** two-thumb slider and survived
the rewrite that replaced it with the chip row:

- "The range cannot invert, however the two thumbs are driven"
- "Coinciding thumbs mean an exact count, and the count label says so"
- "The two thumbs carry distinct accessible names in the built HTML"

Rewrite them against the control that shipped, record the ranking precedence
settled above in §7, and move **Status: Proposed** to **Accepted**.

- [ ] **Step 1: Rewrite the three stale claims and §7**
- [ ] **Step 2: Check every remaining claim in the list has a test that exists**
- [ ] **Step 3: `npm run check`**
- [ ] **Step 4: Commit** — `docs: bring the filters design in line with what phase 2 shipped`

---

## Self-review notes

**Placeholders:** none. Every task names its files, its interface and its
commit.

**Internal consistency:** tasks 1-7 all edit `facets.js` and are ordered so each
builds on the last — range, then the deck reading that uses it, then the
independent axes, then the ranking that reads the range, then the two functions
that report on the result. Task 9 is the only one that can invalidate an earlier
task's test, and it says which three and why.

**Ambiguity:** the one real ambiguity in the design — where coverage sits in the
ranking when a query is present — is settled at the top of this plan rather than
left to whoever writes task 5.

**Scope:** twelve tasks in one plan is more than phase 1's four, but they are one
feature and share one module; splitting them would mean shipping a chip row
whose page has no chips. Tasks 11 and 12 are not implementation and could be
dropped without breaking anything, which is exactly why they are written down —
they are the two most likely to be skipped and the two this project has paid
for skipping.

**The trap:** every task has an explicit step for confirming its new tests can
come back red. Three times last session a check reported success while checking
nothing — a test file whose assertions never ran, a signature check with a blind
spot, a poller that could not reach what it polled. All three are one shape: a
check that cannot distinguish "clean" from "did not run".
