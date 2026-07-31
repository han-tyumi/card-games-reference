# Companion packages — planned, not built

Nothing here is implemented yet. This file records what these are meant to be, so
the data in `packages/data` gets designed with them in mind rather than
retrofitted later.

Each of these becomes a package under `packages/` when it is built, depending on
`naibi` rather than keeping its own copy of the rules.

**Out of scope for v1.** v1 is the rules data plus the build pipeline that turns
it into Markdown and PDF. These come after.

## A licensing note for whoever builds these

The rules text is CC BY-SA: copy it if you like, but your version stays open and
credits the project. There is a code equivalent worth considering when the
website package gets built.

MIT — what the build tooling uses — lets anyone take the code closed. That is
the right call for generic scripts nobody competes on. For the **website**, the
same reasoning that picked ShareAlike for the text points at **AGPL-3.0**: it is
the one common licence that reaches software people run as a service, so a
company standing up a modified copy of the site has to publish their changes.
Plain GPL does not cover that case, because running a website is not
distribution.

The trade-off is real, so decide it deliberately rather than by default: AGPL
deters some contributors and many companies ban it outright, which cuts both
ways when the goal is attracting help. MIT everywhere is the friendlier,
lower-friction option and is a perfectly defensible choice — the valuable thing
here is the rules corpus, and that is already protected by ShareAlike.

## Graphics and learning aids

The largest planned addition, and the one with the biggest pull on the data
format. The guiding principle is the same one the rest of the project runs on:
**describe it as data and render it, rather than drawing it by hand.**

A setup diagram for Klondike is really a description of piles — seven tableau
columns dealt 1 to 7, last card face up, four foundations, a stock and a waste.
Written that way it can be rendered to SVG for the web, to the PDF, and to a
mobile canvas from one definition, and it stays correct when someone fixes a
rule. Hand-drawn images do not survive to hundreds of games, and they drift
silently out of date.

That argues for an eventual `layout` field describing the table, and a renderer
package that consumes it. Hand-authored artwork stays reserved for the places
that genuinely need it.

**Card artwork carries licences too.** Some open card face sets are GPL, which
would force that licence onto anything that embeds them. Whatever set gets
picked should be public domain or permissively licensed, chosen deliberately
rather than grabbed.

## Score keeper

Games in this collection score in genuinely different shapes, and a generic
"add a number to a column" tracker handles none of them well:

- **Cribbage** wants a pegging board — two pegs per player, 121 points, and the
  scoring happens in small increments during play as well as at the show.
- **Hearts** and **Spades** want per-hand entry with running totals, plus the
  rules that make them interesting: shooting the moon flipping the score,
  sandbag penalties triggering every ten bags.
- **Pinochle** and **Canasta** want meld scores and trick/count scores tracked
  separately before they combine.
- **Euchre** wants nothing more than two counters to 10, and should not make
  you tap through a form to get there.

The likely design is a small per-game scoring descriptor in the game JSON that
the tool reads, rather than a hard-coded module per game.

## Randomizers and helpers

- **Dealer / first player picker** — settle who deals without hunting for a
  high card.
- **Game picker** — filter by who is actually at the table: player count, how
  long you have, which decks are on hand, how much rules explanation people
  will tolerate. The `players`, `duration_minutes`, `decks`, `difficulty`, and
  `tags` fields exist to make this a query rather than a guess.
- **Partnership shuffler** — random teams for the partnership games.
- **Virtual deck** — cut, shuffle, or draw when a card is missing or the deck
  is not to hand.

## Design constraints these should honor

- **Offline first.** The point of this project is a reference that works at a
  kitchen table with no signal.
- **Data-driven.** Tools read `games/*.json`. Game knowledge lives in the data,
  not scattered through tool code.
- **No lock-in.** The JSON stays readable and useful on its own, whether or not
  any of these tools ever ship.
