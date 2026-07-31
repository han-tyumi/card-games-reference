# Companion tools — planned, not built

Nothing in this directory is implemented yet. It exists to mark the space and to
record what these tools are meant to be, so the data format in `games/` can be
designed with them in mind rather than retrofitted later.

**Out of scope for v1.** v1 is the rules data plus the build pipeline that turns
it into Markdown and PDF. These come after.

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
