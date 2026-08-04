# What a game requires: the question the controls cannot ask

- **Status:** Proposed — nothing built
- **Date:** 2026-08-04

The index page serves three questions, in this order of how often they are asked:

1. **What is on hand.** Who is here, what pack is in the drawer, how long there
   is. "What can we play right now."
2. **Planning.** Who might turn up, how long an evening might run. Slightly
   ahead of now.
3. **Curiosity.** "What are all the games that need two or more decks?" Nobody
   is holding anything; they want to look at the corpus.

The first two are served. The third has only free-text search, and this document
is the measurement of why that is not enough — and of what a control would have
to decide before it could be built.

## What the controls answer today

| Control | Question it answers | Tier |
| --- | --- | --- |
| Players | how many are here | on hand |
| Decks on hand | what is in the drawer | on hand |
| Your deck (standard 52) | what that pack cannot do | on hand |
| Time | how long there is | on hand |
| Down to *(the floor)* | how few might turn up | planning |
| Difficulty (at most) | how much explaining there is time for | planning |
| Family | taste | neither |
| Search | anything in the prose | curiosity, sort of |

Every structured axis is phrased the same way: **what I have ≥ what it needs**.
That is right for tier 1 and it is why the page works. It also means the widest
setting on any axis is a no-op — `decks=6` offers all 72 games, because holding
six decks rules nothing out. There is no setting on any control that asks what a
game *needs*.

## The gap, measured

Search cannot stand in for it. The obvious query returns precisely the wrong set:

| query | games matched | of which actually need two decks |
| --- | --- | --- |
| `2 decks` | 6 | **0** |
| `two decks` | 1 | **0** |

The six are `rummy-500`, `bs`, `crazy-eights`, `palace`, `golf-multiplayer` and
`slapjack` — every one of which needs *one* deck at its smallest table. Their
deck lines read "…for 2 to 4 players; **2 decks** shuffled together for five or
more". The nine that need two outright say "**2 standard decks**", which the
query does not contain.

Prose and data can also disagree outright. `pinochle` declares
`standard_decks: 2` — a pinochle deck is two stripped packs — while its deck
line reads "1 pinochle deck (48 cards…)". A reader searching either number gets
the opposite of the truth. This is not a bug in the index; it is what indexing
prose is. The structured answer exists in `equipment`, and nothing reaches it.

## What the corpus can support

Sizes matter, because a bucket of two games does not earn a control. Out of 72:

| Question | Games |
| --- | --- |
| seats 6 or more | 36 |
| needs 2+ decks at some table | 19 |
| seats 8 or more | 19 |
| needs a special or named pack | 17 |
| needs more decks as the table grows | 14 |
| needs something besides cards | 10 |
| needs 2+ decks at its smallest table | 9 |
| uses jokers | 6 |
| needs 3+ decks at some table | 5 |

The deck and seat questions are comfortably large. Jokers at 6 and three-deck
games at 5 sit below the ten-game bar that already keeps equipment beyond the
deck out of the controls, and should not get chips of their own on this evidence
alone.

## The design question this turns on

**"Needs two decks" is not one number.** Ten games need one deck at their
smallest table and two at their largest:

```
rummy-500  1 at 2 players, 2 at 8      mau-mau           1 at 2, 2 at 8
bs         1 at 2 players, 2 at 10     palace            1 at 2, 2 at 6
crazy-eights 1 at 2, 2 at 7            president         1 at 3, 2 at 8
dou-dizhu  1 at 3, 2 at 4              golf-multiplayer  1 at 2, 2 at 6
egyptian-ratscrew 1 at 2, 2 at 8       slapjack          1 at 2, 2 at 8
```

So the answer to "what needs two or more decks" is **9** or **19** depending on
which table you mean, and the difference is larger than either of the small
buckets above. Any control here has to say which it means, and the existing
`matches()` already reads the per-seat requirement across the chosen range — so
the machinery to answer "at the table you asked for" exists.

That suggests the requires-axis is not a separate control at all but a *reading*
of the existing ones, which is the cheapest shape and the one to try first.

## Options, none chosen

1. **A direction toggle on the existing axes.** One control flips Decks and Your
   deck from "what I have" to "what it needs". `decks=2` then means "needs at
   least two" rather than "no more than two". Cheapest, keeps the chip rows as
   they are, and inherits the per-seat reading for free. Costs: a mode that is
   invisible in a screenshot, a URL that means two different things at the same
   parameter, and a print sheet header that has to say which way round it is.
2. **Separate chips.** A "Needs" row beside "On hand". Honest and stateless — no
   mode to be in the wrong one of — at the price of doubling the control surface
   on the axis with the most chips.
3. **Search operators.** `decks:2+`. Serves the curious without touching the
   controls, and is invisible to anyone who does not already know it exists,
   which is most people. Would want the placeholder to advertise it, and that
   box has already been measured to have 20px of spare room.
4. **Nothing; sort instead.** Let curiosity be served by ordering rather than
   filtering. Does not answer "what are all the games that…", which was the
   question.

## What would have to be decided first

- **Which table "requires" means** — smallest, largest, or the one the reader has
  already asked for. The third is the only one that agrees with the rest of the
  page, and the numbers above are the cost of getting it wrong.
- **Whether the axis reverses or duplicates**, which is options 1 and 2 and is a
  question about the URL as much as the screen.
- **Whether preparation reverses too.** "No jokers needed" is an exclusion; its
  mirror is "uses jokers", which is 6 games. Reversing an axis nobody can then
  usefully set is worse than leaving it.

## What would hold it

- **A reversed axis returns the complement it claims to.** For every setting, the
  "needs at least N" list and the "have at most N−1" list must not overlap, and
  together must cover every game with a requirement on that axis. This is the
  assertion that would catch a mode applied to one branch of `matches()` and not
  the other.
- **The seat-dependent count is the one the page then renders**, cross-checked
  against `plan()` for the same state — the same shape as the floor's option
  counts, and for the same reason.
- **The print sheet says which direction was asked for.** `describe()` produces
  one sentence for both the empty state and the sheet; a reversed axis that reads
  the same in that sentence is a filter lying on paper.
- **A control run at 320px.** Decision 0011, and this page has now twice shipped
  a control that did not fit.

## Not in scope

**"What can I play with what I have" stays the default.** Whatever is built here
is the third question, and it must not cost the first one a click.

**Equipment beyond the deck** — the cribbage board, the chips, the spoons — is
10 games, which the earlier design already judged too few to earn a control. That
judgement does not change because a new axis is being discussed.
