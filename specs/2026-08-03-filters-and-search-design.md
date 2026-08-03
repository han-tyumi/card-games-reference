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
| Decks stops at 2 | Distinct deck counts are `0,1,2,3,6`. `baccarat` needs 6 and `hand-and-foot` 3, so neither is reachable by any chip. Three more — `contract-rummy`, `indian-rummy`, `nertz` — fit a chip at their smallest table but need more than two decks by their largest, so a chip answers for part of their range only. Five games in total that the chips cannot ask for. |
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

### 1. Players: a headcount chip, widened only when asked

A row of chips for the count, derived `1` to `12`. One click finishes the most
common input on the page — "we are five" — and that is the whole design
constraint the earlier drafts kept losing.

Three controls were tried and rejected against it, each for a measured reason:

- **A two-thumb slider.** The general control, but it spends its entire
  interaction budget on a number the reader already knows exactly, and on a
  mouse it asks them to drag a ~25px thumb onto a precise tick. It also has no
  native element, so it costs hand-written ARIA, `pointer-events` juggling on
  thumb pseudo-elements, restacking when the thumbs coincide, and per-engine
  thumb styling.
- **A "someone can sit out" checkbox.** Fixed depth, wildly uneven value: it
  gains a party of five **19 games** and a party of six **one**, with nothing in
  the control to say which. The corpus clusters at maxima of 4 and 6, so the
  payoff is at irregular cliffs, not a fixed offset.
- **Two symmetric bounds.** Makes "we are five" a two-step operation — set the
  lower, set the upper — for the most frequent input there is.

**The range is anchored at the top, because both reasons a table shrinks reduce
from a number you know.** No-shows and sitting-out are the same input: you can
always name the largest group who might turn up. So the chip is that number, and
one optional control widens downward.

```
Players   [Any] 1 2 3 4 [5] 6 7 8 9 10 11 12
          ▸ Might you be fewer?
```

The widening control lives inside a native `<details>`, collapsed. It is a
`<select>` offering only values at or below the chosen count, defaulting to the
count itself, so it does nothing until touched and **no invalid combination is
reachable** — raising the count leaves a lower floor alone, lowering the count
below the floor clamps it. There is no push rule for a reader to learn, which
two free bounds would have required.

`<details>` rather than a scripted toggle: it is native, keyboard-operable, and
works with JavaScript off, matching every other control here. **It must open on
load when the URL carries a floor** — a shared link that applies a filter from a
collapsed panel is this document's own "says yes when the answer is no" in a new
costume.

Options carry live counts, because the cliff is otherwise invisible: a table of
six has no way to discover that dropping to four takes them from 36 games to 56.

### The range filters by overlap and ranks by coverage

A game matches when its span **overlaps** the requested range. For 4-6, that is
56 games; the 36 that play at *every* count in 4-6 are a strict subset.

Neither set is the right filter on its own, and making the reader choose is a
false choice. Containment as a gate hides 20 titles — `belote`, `canasta`,
`contract-bridge` — that are perfect if four turn up, or that a party of six can
play by benching two. Overlap alone leaves the safe-whatever-happens games
unmarked.

So: **filter on overlap, rank by coverage.** Games covering the whole range sort
first and say so; partial ones follow, and the card already prints each game's
own player range, so no extra explanation is needed. This is the same rule
`ideal` gets, and for the same reason — a real signal that makes a terrible
gate.

That also keeps the control neutral about *why* the number varies. "As few as"
says nothing about no-shows versus benching, and the two want opposite readings
of the same result: with uncertain turnout, "plays any 4-6" is what you can
commit to; with benching, the partial group is available too. The reader maps it
to their own situation; the tool does not guess.

### `ideal` orders, never filters

Every game has one and it always falls inside `min..max`, but no game is ideal at
7 and only two at each of 6 and 8 — filtering on it would empty the list at 7
while looking like it was working. Games whose `ideal` falls in the range sort
first within their coverage group and carry a "best with N" marker.

The chips span 1 to 12, derived. Correctness and expressiveness want different
bounds: a game is unreachable only when its **minimum** exceeds the top, and the
largest minimum in the corpus is 4, so a row ending at 4 would already leave
nothing unfilterable. It runs to 12 so that twelve people can *say* twelve.

The page opens with no count selected, because a filter that starts engaged
hides games from a reader who never touched it. Four would otherwise be the
tempting default: the most accommodated count at 56 games, and the most common
`ideal` at 37.

### 2. Decks derives its thresholds, and reads the extra-deck rule

The chip values become the distinct non-zero deck counts: `1, 2, 3, 6`. Because
the filter is an "at most" ceiling, **only thresholds present in the data change
the answer** — a "4" chip would return a list identical to "3". Zero stays
excluded from every deck count, since a purpose-built pack is not something a
52-card deck can stand in for.

The false yes is fixed by making the requirement a function of the count rather
than a constant:

```
decksNeeded(game, n) = decks_by_players[largest key ≤ n] ?? standard_decks
```

and a game matches when **some** seatable count in the requested range can be
played with the decks in hand — the same overlap reading the players control
uses, so the two chips agree about what "in range" means:

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
`equipment.decks_by_players: {integer: integer}` — how many decks are
needed from each player count upward. Fourteen entries carry the flag today and
each needs real numbers.

> **As shipped:** the schema types this `{ "type": "object", "minProperties": 1 }`,
> not `{integer: integer} | null`, so the field is **omitted** rather than set to
> a literal `null`. A `null` fails schema validation. The rest of this section
> predates that decision; read "keeps `null`" below as "omits the field".

Two things make this cheaper than it looks. `proseFingerprint` covers only
`setup`, `play` and `goal_and_scoring`, so **changing equipment does not
invalidate any of the 72 `checked` records**. And the number is a fact about the
game, so it comes from the sources the entry already attributes — it is not a
figure anyone may estimate. An entry whose sources do not state a threshold
omits the field and is treated as needing no extra deck, which is the honest
reading of "nobody wrote it down" and matches how unstamped checks are handled
elsewhere.

**Twelve of the fourteen already state the step in their own prose**, so the
numbers come from text that has been read against sources and stamped rather
than from anybody's estimate. Written as the map, and read as "from this many
players, this many decks":

| Entry | `decks_by_players` | The sentence it comes from |
| --- | --- | --- |
| `dou-dizhu` | `{"4": 2}` | "the four-player version wants two decks" |
| `contract-rummy` | `{"5": 3}` | "3 decks plus jokers for 5 or more" |
| `golf-multiplayer` | `{"5": 2}` | "2 decks shuffled together for five or six" |
| `palace` | `{"5": 2}` | "at five or more the stock runs dry" |
| `rummy-500` | `{"5": 2}` | "from five players up, shuffle two packs" |
| `bs` | `{"6": 2}` | "from six up, shuffle two packs together" |
| `crazy-eights` | `{"6": 2}` | "with six or seven, shuffle two packs" |
| `mau-mau` | `{"6": 2}` | "from six players upwards" |
| `slapjack` | `{"6": 2}` | "2 decks shuffled together for six or more" |
| `egyptian-ratscrew` | `{"7": 2}` | "add a second deck above six players" |
| `indian-rummy` | `{"7": 3}` | "seven players or more want a third deck" |
| `president` | `{"8": 2}` | "add a second pack once you get past about seven" |

**The other two have no threshold at all — they have a formula**, which the
first draft missed. `hand-and-foot` needs "one deck more than there are
players" and `nertz` "one standard deck per player", so their requirement climbs
with every seat rather than stepping once.

Rather than a second field for the formula case, **one field covers both
shapes**: a step map from player count to decks needed.

```json
"decks_by_players": { "6": 2 }                                          // bs
"decks_by_players": { "2":2, "3":3, "4":4, "5":5, "6":6, "7":7, "8":8 }  // nertz
```

```
decksNeeded(game, n) = value for the largest key ≤ n, else standard_decks
```

A formula *string* with placeholders was considered and rejected. It is code
living in data: it needs a parser, every consumer needs the same parser — the
site, the booklet and the validator — which is the "two generators both need it"
drift this project keeps fighting, and JSON Schema cannot check it, so
`"player + 1"` with the `s` missing would validate and fail later. A step map is
inert data, validates as an object of integers, and states plainly what is
needed at each size.

It also removes a limitation the earlier draft accepted as permanent: a single
threshold could only ever express a single extra deck, so a game wanting a third
pack at ten players was inexpressible. One step, five steps and a per-player
formula are now the same mechanism.

**A consequence, chosen rather than solved:** the deck chips derive from the
distinct `standard_decks` values (`1, 2, 3, 6`) and *not* from the maps, because
`nertz` would otherwise contribute chips up to 8 and nobody owns eight decks.
Someone who does own eight cannot say so and tops out at `6`, which under-offers
`nertz` at seven and eight players. That fails in the safe direction — hiding a
game the reader could play rather than offering one they cannot — which is the
direction this filter is required to fail in.

`standard_decks` itself is **not** wrong for these two, and an earlier draft of
this document said it was. The schema already defines it as "how many ordinary
52-card decks you must own to play **at the minimum player count**", so
`hand-and-foot` recording 3 for its two-player game is exactly right under that
definition, as is `nertz` recording 2. No entry needs correcting. What is wrong
is only the reading: `matches()` treats a minimum-count requirement as the
requirement at every count, which is the same bug for these two as the ignored
boolean is for the other twelve. `decks_by_players` supplies the counts the
minimum cannot.

`extra_deck_for_large_groups` is removed rather than kept alongside: a boolean
that says neither how many nor when, next to a map that says both, is two
records of one fact waiting to disagree.

## Derivation, and the claims that get tests

Generated values are derived; claims get tests. The chip values are generated
output, so they come from the corpus. These are the claims:

- **Every game is reachable by some setting of every control.** Names no
  literal, so it cannot go stale, and it catches a future entry that the
  derivation rule mishandles however the values were produced.
- **The derived player span stays at or under 16 seats.** This is the one place
  a static assertion belongs: deriving the row from data means one outlier can
  wreck it, and a 60-player entry would give the page a chip row useless for the
  2-6 bulk where nearly everything lives. Sixteen is a judgement, not a measurement —
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
- **The range cannot invert**, however the two thumbs are driven.
- **Coinciding thumbs mean an exact count**, and the count label says so.
- **The two thumbs carry distinct accessible names** in the built HTML, so a
  screen reader does not announce one control twice. Assertable against the
  generated page, like the existing focus-ring test.
- **A per-player game's requirement climbs with the count** — `nertz` needs 8
  decks at 8 players, and one deck held never offers it above one player.

## Not in scope

Time chips have the same hand-typed literals and should get the same derivation,
but the thresholds there are a judgement about useful buckets rather than a
property of the data, so they are left alone rather than guessed at. Equipment
beyond the deck — the cribbage board, the chips, the spoons — is not filterable
here; ten games declare something, which is too few to earn a control and enough
to be worth a line on the card.
