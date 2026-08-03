# Naibi — phase 2 of the filters work

## Where things stand (verified, not assumed)

`main` is at **v0.3.2**, tagged, released, booklet attached. Everything from the
previous session is merged: the originality records closed at **72/72**, and the
decks-by-player-count change — schema, shared reading, CLI picker, website
filter — all four tasks reviewed, plus an eleven-finding whole-branch fix wave.

The gate is `npm run check`; it exits 0 at `main` and runs 373 tests.

Two documents carry the design and are the input to this phase:

- [`specs/2026-08-03-filters-and-search-design.md`](2026-08-03-filters-and-search-design.md)
  — **Status: Proposed.** Every number in it was measured against the corpus.
- [`specs/2026-08-03-decks-by-players-plan.md`](2026-08-03-decks-by-players-plan.md)
  — phase 1, done. Useful as a worked example of the plan shape that survived
  execution.

## What phase 2 is

Everything in the design document that phase 1 did not ship:

1. **The players control** — a derived chip row `1`-`12`, plus an optional floor
   inside a collapsed `<details>`. Filter by overlap, rank by coverage.
2. **Derived deck chips** — `1, 2, 3, 6` instead of the hand-typed `1, 2`.
3. **The preparation axis** — two capability checkboxes (*I have jokers*, *I can
   strip a deck*), matched by subset, not a ceiling.
4. **Multi-select family**, OR within the group.
5. **Search** — index `equipment.special_deck` and `decks`; fix the placeholder,
   which says "every rule" while the index also covers names, aliases, families
   and tags.
6. **The empty state** explains which filters produced it.

## Two decisions the human has already made — do not re-open

**The control is a chip row, not a slider.** Three controls were tried and
rejected in conversation, each on a measured reason, and the rejections are
recorded in the design document's section 1. The constraint that killed them:
the most common input on the page is an exact headcount and it must cost one
click. Do not reintroduce a two-thumb slider.

**A range filters by overlap and ranks by coverage.** Not a mode toggle. The
reasoning is that containment is a strict subset of overlap, so making the
reader choose costs them games either way.

## Still open, and genuinely the human's call

- **The deck chips stay derived from `standard_decks`** (`1, 2, 3, 6`), not from
  the `decks_by_players` maps — otherwise `nertz` contributes chips up to 8 and
  nobody owns eight decks. The cost: someone holding eight cannot say so, and is
  under-offered `nertz` at seven and eight players. Recorded in the design as an
  edge *chosen*, not solved. Fails in the safe direction.
- **Time chips** have the identical hand-typed-literal problem the deck chips
  had, and are deliberately out of scope: their thresholds are a judgement about
  useful buckets rather than a property of the data, so deriving them would mean
  inventing a rule.

## Conventions that cost time to learn

- **`npm install` first.** `node_modules` starts empty in a fresh container.
- **`npm run check` is the whole gate.** An `&&` chain — if the test stage runs,
  everything before it passed.
- **`docs/` is generated and gated.** `npm run web` deletes and rewrites it.
  Never hand-edit, never put source material there — which is why these specs
  live in `specs/` rather than under `docs/`.
- **`packages/web/assets/*.js` ships to the browser and cannot import `naibi`.**
  Precompute in `records.ts` at build time and let the browser do a lookup. This
  is how `Facet.dn` works, and it is what keeps a rule from existing twice.
- **`noUncheckedIndexedAccess` is on.** Indexing an array yields `T | undefined`;
  the typecheck will make you handle it. That is a feature — it caught a real
  hole in phase 1's matcher.
- **Editing an entry's `setup`, `play` or `goal_and_scoring` invalidates its
  `checked` record.** Those are complete at 72/72; do not disturb them. Changing
  `equipment` does not — `proseFingerprint` covers only the three prose fields.
- **Conventional-commit prefixes decide releases.** A bare subject counts as a
  patch and will cut one; `docs:` and `chore:` do not.
- **The git proxy refuses ref deletion** with a disconnect while allowing normal
  pushes. Delete merged branches in the GitHub UI; do not burn time retrying.

## The trap this project keeps falling into

Three separate times in the last session, a check reported success while not
actually checking anything:

- A new test file reported a passing run **with zero assertions executed**,
  because importing the module ran `main()` and `process.exit()` before any
  `test()` callback fired. Fixed with the entry-point guard the four sibling
  scripts already had.
- `git log --format='%G?'` reported `N` — "no signature" — for commits that
  **were** signed, because `gpg.ssh.allowedSignersFile` is unset in the
  container. A control commit run to test signing was then checked with the same
  broken instrument and inherited the same blind spot.
- A CI watcher polled an endpoint it could not reach and only grepped for
  success strings, so a dead poller and a running job looked identical.

All three are one shape: **a check that cannot distinguish "clean" from "did not
run".** Phase 2 is full of opportunities to repeat it, because a DOM control
that renders is not a control that works. When something comes back green,
break it on purpose and confirm it can come back red.

## Phase 2 needs eyes, not just tests

Phase 1 was data and logic, where tests were sufficient proof. Phase 2 is not.
A chip row that filters correctly can still be unusable; a `<details>` that
opens can still be invisible; a focus ring can pass its test and be
unreadable against the accent colour.

Chromium and Playwright are preinstalled (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`;
do not run `playwright install`). Drive the built site and look at it. There is
a `run` skill for this.

## First move

`npm install`, then `npm run check`, and confirm it exits 0 before changing
anything. Then read the design document — the whole of section 1, including the
rejected alternatives, because their reasons are the constraints.
