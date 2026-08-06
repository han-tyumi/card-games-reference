# 0022. Two games may answer to one name

- **Status:** Accepted
- **Date:** 2026-08-06

## Context

[The handoff](../specs/2026-08-04-before-more-games-handoff.md) noted that
`slam` is an alias on both `speed` and `spit`, that the corpus validates clean,
and that whether a shared alias is a defect or legitimate should be a decision
rather than a silence.

Measured across the corpus: **292 names and aliases across 72 games, 291
distinct, and exactly one collision** — `Slam`, on Speed and on Spit. No alias
is another game's name. Both games really are called Slam; they are close
relatives, both shedding games, both easy.

Searching for it today already works. `slam` returns Speed (907), Spit (905) and
then Contract Bridge (1) — which is a third claimant of a sort, since a bridge
player calling for a small slam means something else entirely, and the word is
in that entry's scoring rather than its aliases. The two games that answer to the
name are the answer; the term of art is far below.

There is already a rule for the neighbouring case: an alias that is another
game's **name** is a hard failure, on the grounds that someone typing the exact
title of one game should not find a different game competing at the top. Nothing
covered alias against alias.

Collisions grow faster than the corpus does — labels grow linearly and pairs
quadratically — so a corpus three times this size will have more of them, and
the question is what should happen when it does.

## Considered options

- **Forbid it: make one game give the name up.** Rejected. Both are honestly
  called Slam, so whichever loses becomes unfindable by a name real people use.
  That is a worse failure than ambiguity: the reader who searches the name they
  know gets nothing, and has no way to tell that the game is here under another
  one.
- **Disambiguate in the data — "Slam (Speed)", "Slam (Spit)".** Rejected: it
  invents names nobody calls them, and the parenthetical would show up in the
  entry's own "Also known as" line as a name of the game, which it is not.
- **Keep both, say nothing.** Rejected: that is the silence the handoff
  objected to. The count is one today and nobody would notice it becoming
  fifteen.
- **Keep both, report the collisions, and test that the reader can resolve
  them.** Chosen.

## Decision

**A name two games answer to is legitimate and both keep it.** The reader
searching it gets both and does a little more looking to see which one they
meant, and the index card is what they do that looking with.

That makes two things load-bearing, so both are asserted against the real corpus
and the real search index rather than assumed:

1. **A search for a shared alias returns every game that answers to it**, each
   attributed to `other names` so the card can say *found in other names*, and
   with those games ranked above anything that merely mentions the word. A
   ranking that quietly kept the best claimant would look like a working search
   and would be precisely the failure this decision assumes away.
2. **Whether the cards can tell them apart is reported.** Speed and Spit differ
   in two of the four facts a card carries — 2-4 players against 2, and 5-15
   minutes against 10-25 — which is what makes "look a bit closer" an
   instruction rather than a hope. A pair whose cards read identically is named
   in the report as one a reader cannot resolve on the index.

Both tests derive the shared aliases from the corpus, so one added later is
covered without anyone remembering to extend them.

`npm run validate` reports the collisions and says so when there are none,
because a report that can come back empty has to say which empty it means.

The asymmetry with the alias-is-another-game's-name rule is deliberate. A name
has a primary claimant and an alias does not: neither Speed nor Spit is *the*
Slam, while there is exactly one game called Spit and a search for that word
should not have to fight another entry for the top of the list.

## Consequences

Nothing about the corpus changes. One line of reporting appears in
`npm run validate`, and the property the decision rests on is now defended by
tests instead of by nobody having broken it yet.

**Nothing here fails a build, including the unresolvable case.** Two entries
answering to one name whose cards read identically leaves the reader with a coin
flip — but there is no wording that fixes it, and two close relatives sharing a
name is a fact about card games rather than a defect in an entry. It gets its
own line in the report instead, naming the pair, and whoever reads that decides
whether they are really one game filed twice. There are zero such cases today,
and the conjunction is rare: it needs a shared alias *and* the same players,
time, difficulty and family.

This was a red build for one commit, which is the wrong shape for it: a check
that cannot be satisfied by editing anything is a demand rather than a rule, and
the corpus would have had to change to suit the tooling.

The reader still has to open one of the two to be sure. That is accepted rather
than solved: the card carries four facts, and no set of four facts distinguishes
two close relatives reliably. Showing which alias matched would not help either,
since for a shared alias it is the same word on both cards.

The report counts aliases only. A word that is a term of art in one game's prose
and a name for another — `slam` in Contract Bridge's scoring — is not a
collision to be managed, and counting it as one would put a permanent entry in a
report meant to name things somebody might act on.
