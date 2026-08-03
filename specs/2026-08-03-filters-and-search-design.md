# Filters and search: what the reader has, and what they can play

- **Status:** Proposed
- **Date:** 2026-08-03

The index page asks "what can we play right now". Five of its controls answer a
slightly different question from the one they appear to ask, and every fault
below was found by counting the corpus rather than by reading the code.

## What is actually wrong

| Finding | Measurement |
| --- | --- |
| Solitaire and Players=1 are the same filter | All 11 solitaire games are `1-1`; no 1-player game sits outside the family. Agreement is redundant, disagreement is always empty. |
| Players skips 7 | Chips are `1,2,3,4,5,6,8`. **22 games seat 7** and cannot be asked for. |
| Players stops at 8 | 4 games seat 9-10 and 2 seat 11-12 (`baccarat` and `spoons` at 12, `bs` and `texas-holdem` at 10). |
| Decks stops at 2 | Distinct deck counts are `0,1,2,3,6`. `hand-and-foot` needs 3 and `baccarat` 6. |
| The decks filter gives a false yes | 10 games declaring one deck are flagged `extra_deck_for_large_groups` and need a second near the top of their range. `matches()` never reads the flag, so "1 deck, 8 players" offers `bs`, `egyptian-ratscrew`, `mau-mau`, `rummy-500` and `slapjack`. |
| The pack is unsearchable | `records.ts` indexes name, aliases, tags and the three prose fields. `equipment.special_deck` is not among them, so "euchre deck", "piquet pack" and "skat pack" return nothing though those exact phrases are in the data. |

Two things were checked and are **not** faults, recorded so nobody re-opens
them. Difficulty stopping at "Medium" is correct, because the chip is a ceiling
and "at most complex" would equal "Any". The print sheet already names its
filters in words, in `print.js`'s `describe()`.

### One root cause under three of them

The family chips are built from `CATEGORY_ORDER`, with a comment saying it is
done that way "so a category added to the schema gets a chip instead of being
quietly unfilterable". Players, decks and time are hand-typed literals in
`build-web.ts`. They drifted exactly as that comment predicted. The fix is the
pattern already in the same file, applied to the groups that never got it.

## What changes

### 1. Players becomes a range over "supports", ranked by "ideal"

A two-handle slider. A game matches when its span **overlaps** the selected
range — not when it contains it. Overlap is what answers "we are six but one
might sit out": a range of 5-6 should offer games seating exactly 5 and games
seating exactly 6. Containment cannot express that, and asking whether a
2-player game belongs in a 2-8 span has several defensible answers, which is how
you know it is the wrong question.

`ideal` is used for **ordering, never for filtering**. Every game has one and it
always falls inside `min..max`, but no game is ideal at 7 and only two at each
of 6 and 8 — so filtering on it would empty the list at 7 while looking like it
was working. Instead, games whose `ideal` falls in the selected range sort
first and carry a "best with N" marker. Seven players then yields 22 playable
games with none falsely promoted; four yields 56 with the 37 best-fits on top.

The slider spans 1 to 12, derived. Note that correctness and expressiveness want
different bounds here: because a game is unreachable only when its **minimum**
exceeds the top of the slider, and the largest minimum in the corpus is 4, a
slider ending at 4 would already leave nothing unfilterable. It runs to 12 so
that twelve people can *say* twelve.

**Two stacked native `<input type="range">` controls, labelled "At least" and
"At most" — not one dual-thumb widget.** This matters more than it looks. The
chips being replaced are native radios, so they are keyboard- and
screen-reader-accessible for free, and the site has a test asserting every
focusable control declares its own focus ring. A dual-thumb slider has no native
element: it is two overlaid inputs plus hand-written ARIA, in a project that
deliberately has no framework to borrow it from (decision 0005). Two separate
native sliders keep every accessibility guarantee the radios had, cost nothing
to style, and still read as a range. The full span is the unset state, so it is
omitted from the URL and the page opens unfiltered.

### 2. Decks derives its thresholds, and reads the extra-deck rule

The chip values become the distinct non-zero deck counts: `1, 2, 3, 6`. Because
the filter is an "at most" ceiling, **only thresholds present in the data change
the answer** — a "4" chip would return a list identical to "3". Zero stays
excluded from every deck count, since a purpose-built pack is not something a
52-card deck can stand in for.

The false yes is fixed by making the requirement a function of the count rather
than a constant:

```
decksNeeded(game, n) = standard_decks + (extra_deck_above != null && n > extra_deck_above ? 1 : 0)
```

and a game matches when **some** seatable count in the selected range can be
played with the decks in hand — the same existential reading the players range
already uses:

```
∃ n ∈ [range.lo, range.hi] ∩ [game.min, game.max] : decksNeeded(game, n) ≤ decksHeld
```

This keeps `slapjack` for two players with one deck and drops it for eight,
which the current filter and both rejected alternatives get wrong in one
direction or the other.

### 3. A preparation axis, as capabilities rather than degrees

`special_deck` is doing two unrelated jobs. For `piquet` it is a setup
instruction — strip a 52 down to 32. For `koi-koi` it is an equipment barrier.
The schema already tells them apart through `standard_decks: 0`; the field name
does not, and the page surfaces neither. Measured:

| What you must do to your deck | Games |
| --- | --- |
| Nothing — a plain 52 | 50 |
| Add jokers | 5 |
| Strip cards from a standard deck | 16 |
| Obtain a different pack | 1 (`koi-koi`) |

This is **not** a ceiling, and that was the first draft's mistake. A ceiling
claims the states are degrees of one thing, so that accepting the strictest
accepts everything milder. These are different kinds of obstacle: someone whose
deck has no jokers can strip cards happily but cannot add jokers, so "willing to
strip" does not contain "can add jokers" in either direction. Modelled as a
ceiling, that reader gets a list containing games they cannot play — the same
false yes this document exists to remove.

Two independent capability checkboxes instead — *I have jokers* and *I can strip
a deck* — with a game shown when its requirements are a subset of what is
ticked. `five-hundred`, needing both a stripped pack and a joker, requires both.
`koi-koi` requires a capability no checkbox offers, so it appears only when the
control is untouched, which is the same treatment `standard_decks: 0` already
gets from the deck count. Requirements are derived from `equipment`, so they
cannot drift.

This is deliberately **not** a reason to drop games from the corpus. Restricting
to standard decks would remove exactly one entry, because sixteen of the
seventeen "special deck" games are built by stripping a standard one, and the
filter already excludes the seventeenth correctly.

### 4. Family accepts more than one value

Family is browsing rather than constraint, so multiple selections combine with
OR. It stays an exact match per value.

### 5. Search indexes the pack, and says what it covers

`searchRecords` gains `decks` and `equipment.special_deck` as a low-weighted
field, so someone holding a 32-card pack can find the five games that use one.
The placeholder changes from "Search every rule" — which undersells an index
already covering names, aliases, families and tags — to name those too.

### 6. The empty state explains itself

One already exists — "Nothing matches." with a Clear filters button. It gains
the reason: which filters produced the empty list, and for the
solitaire-versus-players case a specific sentence, because "no solitaire game
seats more than one" is a fact about the corpus rather than a mistake by the
reader. The button stays.

### 7. Ranking has a stated precedence

`plan()` already sorts by search score when a query is present, and `ideal` now
wants to sort too. Search score wins, with `ideal`-in-range breaking ties; with
no query, games ideal within the range come first and source order holds inside
each group. Stated here because two sorts arriving in the same function with no
declared winner is how one of them silently stops working.

## The schema change

`equipment.extra_deck_for_large_groups: boolean` becomes
`equipment.extra_deck_above: integer | null` — the player count above which a
further deck is needed. Fourteen entries carry the flag today and each needs a
real number.

Two things make this cheaper than it looks. `proseFingerprint` covers only
`setup`, `play` and `goal_and_scoring`, so **changing equipment does not
invalidate any of the 72 `checked` records**. And the number is a fact about the
game, so it comes from the sources the entry already attributes — it is not a
figure anyone may estimate. An entry whose sources do not state a threshold
keeps `null` and is treated as needing no extra deck, which is the honest
reading of "nobody wrote it down" and matches how unstamped checks are handled
elsewhere.

**A known limit, stated rather than hidden:** one threshold can only express one
extra deck. A game spanning 2 to 10 might want a third pack at the very top, and
`extra_deck_above` cannot say so. The boolean it replaces could not say so
either and could not say *when* either, so this is strictly more truthful than
today — but if a source turns out to specify two steps, the field wants to
become a list of thresholds rather than gain a second boolean.

## Derivation, and the claims that get tests

Generated values are derived; claims get tests. The chip and slider bounds are
generated output, so they come from the corpus. These are the claims:

- **Every game is reachable by some setting of every control.** Names no
  literal, so it cannot go stale, and it catches a future entry that the
  derivation rule mishandles however the values were produced.
- **The derived player span stays at or under 16 seats.** This is the one place
  a static assertion belongs: deriving a slider from data means one outlier can
  wreck it, and a 60-player entry would stretch the control useless for the 2-6
  bulk where nearly everything lives. Sixteen is a judgement, not a measurement —
  it is four above the current maximum, which leaves room for ordinary growth and
  fails on an outlier. The test names the number so a person decides whether the
  control should change, rather than the page quietly reshaping itself.
- **The deck thresholds equal the distinct non-zero deck counts in the corpus.**
- **A purpose-built pack never matches any deck count.** Existing test, kept.
- **A flagged game is excluded above its threshold and kept below it** — the
  `slapjack` case, both directions.
- **A game seating exactly 5 matches the range 5-6.** Overlap, stated as a test
  so it cannot quietly become containment.
- **`ideal` never removes a game.** The result count for a range is identical
  whether or not any game is ideal within it. This is what stops the ranking
  from becoming a filter by accident.
- **URLs round-trip**, including ranges and multi-valued families, and existing
  single-value `players=5` links still parse.
- **A game is findable by its pack** — "euchre deck" returns `euchre`.
- **Preparation is a subset test, not a ceiling.** Ticking "I can strip a deck"
  alone never returns a game that needs jokers. This is the assertion that would
  have caught the first draft's modelling error.
- **A game needing a pack nobody can improvise is offered only when the control
  is untouched** — `koi-koi`, matching how `standard_decks: 0` already behaves.

## Not in scope

Time chips have the same hand-typed literals and should get the same derivation,
but the thresholds there are a judgement about useful buckets rather than a
property of the data, so they are left alone rather than guessed at. Equipment
beyond the deck — the cribbage board, the chips, the spoons — is not filterable
here; ten games declare something, which is too few to earn a control and enough
to be worth a line on the card.
