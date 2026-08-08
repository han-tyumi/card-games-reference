# Adding games: what one costs, and what bites

- **Status:** Open — written for whoever adds the next entries
- **Date:** 2026-08-06, updated 2026-08-08

Main is at **v0.8.0**. The corpus is **78 games**, `npm run check` exits 0 at
481 tests, and
[the before-more-games handoff](2026-08-04-before-more-games-handoff.md) is
closed: all four of the things that got more expensive with the corpus have been
measured and answered.

So the machinery is no longer the constraint. **The writing is.** This document
is what the first batch after that cost, and what went wrong while writing it,
so the next batch does not rediscover any of it.

## What an entry costs

Three entries were written, checked and stamped in one session. Each ran to
roughly 1,500 words of original prose across `setup`, `play` and
`goal_and_scoring`, plus a layout diagram or a scoring table where the game
called for one, three or four variants, and the tags and source records.

The originality pass is not the expensive part — it is minutes. The expensive
part is reading two sources properly and then writing rules that are correct,
in this project's voice, without leaning on the sentences you just read.

## The procedure that worked

1. **Read an existing entry in the same family first.** `texas-holdem.json` for
   a betting game, `blackjack.json` for a casino one. The shape of a good entry
   is not in the schema.
2. **Fetch two sources and pull *facts* out of them**, not prose. pagat.com and
   Wikipedia between them cover most of what is left. Note that pagat files
   casino games under `/banking/`, not `/poker/` — two of three URLs guessed
   from the poker path 404'd.
3. **Write the entry.** `npm run validate` after, which catches the schema and
   the cross-field rules immediately.
4. **Run the originality pass** — the `originality-pass` skill has the
   procedure, including the control that proves the sources are reachable
   before anything else.
5. **Judge every finding by eye**, then stamp only what you actually read.
6. **Delete `.sources/`.**
7. **Update the counts**, then `npm run build && npm run check`.

## What bites

Each of these cost real time in the first batch.

- **Markdown does not work in entry prose.** The site escapes text and parses
  only blank-line paragraphs and `- ` bullets, so `**bold**` ships to readers as
  literal asterisks. It renders as bold in `rendered/`, which makes it look
  fine in the one place nobody reads.
- **Tag semantics are enforced and easy to trip.** `quick` requires the range
  to top out at 30 minutes, `long-game` requires 60, `large-group` requires six
  seats, `two-player` requires the range to contain 2. The validator names the
  contradiction, so run it early rather than at the end.
- **Do not name another entry without checking it exists.** A variant in
  Caribbean Stud said five-card stud was in this collection. It is not — Seven
  Card Stud is. `ls packages/data/games/` is the whole check.
- **Counts live in five places and the tests hold all of them**: README's Status
  line, README's collection blurb, README's family table, CONTRIBUTING's ledger
  heading for the pass, and CONTRIBUTING's "N of N checks record which sources
  they had". Adding entries without touching these fails the build, which is the
  intended behaviour and not a surprise to debug.
- **`.sources/` is other people's copyrighted prose.** Gitignored, and deleted
  when the check is done. Deleting it means the next prose edit needs a re-fetch
  before you can re-stamp, so leave it until the entry is genuinely finished.
- **The stamper wants one file per attributed source name.** `--stamp` slugs
  each filename and matches it against `sources_consulted`; anything unmatched
  is a stray and it refuses the whole stamp. Four separate pagat pages had to be
  concatenated into one `pagat.txt`, and a file named for the document rather
  than the publisher had to be renamed. Name the file after the source as the
  entry attributes it.
- **Fix a fact in the prose and the `scoring_table` still has the old one.**
  This happened, and it survived a whole second read: a claim corrected in
  `goal_and_scoring` sat uncorrected in the table two screens below it. The
  tables exist to stop a fact drifting between two statements of it, and nothing
  checks an entry against its own table. Grep the entry for the claim you just
  changed.
- **A source can contradict itself, not just the other sources.** pagat's
  Schieber page and its Coiffeur page give different French-suit mappings for
  the same multipliers. Two sources agreeing is not the only bar; one source
  agreeing with itself is worth a glance too.
- **The URL warning above is not enough — use the A-Z index.** `sheeps.html`
  guessed from the game name is a 404; the page is `shep.html`. Every Jass page
  needed the index as well.

## What the originality tool does and does not do

Its tiers meant, in practice, exactly what
[0007](../decisions/0007-originality-is-checked-against-sources.md) says they
mean. From this batch:

| Finding | Verdict |
| --- | --- |
| Omaha: our statement of the two-and-three rule against pagat's | Left. The numbers are the rule, and "exactly" is the word doing the work in it. |
| Three Card Poker: a 40-word sentence of ours against a 7-word glossary line | False positive, the documented shape. |
| Caribbean Stud: five sentences in the source's order, 31% mean similarity | False positive — one pair was our prose against the page's own title. |

**And then the part worth knowing.** The tool found no copying worth acting on,
and the batch still shipped two claims that were wrong:

- that players in Caribbean Stud may not show each other their cards, and that a
  casino would void the hand — **neither source said so**;
- that its house edge is "about five per cent of each ante", where the source
  said 2.56% against a different denominator, making our number read as a
  contradiction of the source a reader would check first.

Both were caught by reading the fetched source text, not by the report.

**And then it happened again, in the same batch.** Reviewing the three entries
before merging them turned up three more claims their sources do not carry: a
house edge given as one number where the two sources give 2.01% and about 3.4%
against different denominators; a frequency for how often a Caribbean Stud
dealer fails to qualify, which neither source states at all; and an absolute —
that the hand bet cannot be placed without an ante — which pagat contradicts
outright. The originality report flagged none of the three, on either pass.

So: **the tool checks whether prose was copied. Nothing checks whether it is
true.** That is the job of whoever writes the entry, it is now step 4 of
CONTRIBUTING's "Adding a game", and the six errors behind that rule were all
found the same way — by rereading the fetched source against the finished entry,
once at writing time and once before merging. Budget for the second read. Six
for six says the first one is not enough.

**It also never compares our entries with each other.** It compares an entry
against its sources, and that is all — so a sentence copied from one of our own
entries into another is invisible to it, which is how `euchre` and `sueca` came
to carry the same twenty-word sentence for a year. The irony is that the tool
computes that comparison on every run, 5,302 of our own passage pairs, to
calibrate its bar; it keeps the numbers and throws away which pair produced
them. Measured exhaustively there are 394 cross-game pairs above the bar, but
the top of that list is the shared vocabulary the project has decided to keep,
and a hypothesis that multiplicity would separate the two was tested and failed.
Treat it as a reading list somebody has to sit down with, not a check to bolt on.

## Candidates, with the family counts at 78

| Family | Now | Missing, roughly in order of how conspicuous |
| --- | --- | --- |
| Casino | 5 | Faro, Casino War, Let It Ride, Pai Gow Poker |
| Rummy | 8 | Tonk, Three Thirteen, Kalooki |
| Bluffing | 8 | Razz, Chinese Poker, Badugi |
| Solitaire | 11 | Aces Up, Scorpion, Beleaguered Castle |
| Shedding | 13 | Zheng Shangyou, Pusoy Dos |
| Matching & collecting | 14 | Michigan/Newmarket, Pig, Authors |
| Trick-taking | 19 | **Bezique, Solo Whist** |

Doppelkopf, Sheepshead and Schieber Jass were added on 2026-08-08 and are the
reason trick-taking moved from 16 to 19. They cost about what this document
predicted — roughly 1,500 words each — and the regional variation did have to be
picked between and said out loud, in each entry's own prose rather than only in
`variants`. Bezique is the conspicuous remainder, and is worth doing while
`pinochle`, which descends from it, is fresh.

Do not read the counts as a target. The smallest family is not the most
important gap, and the section below on what a re-read of one inherited entry
turned up is a better guide to where the next hour goes.

## What not to do

- **Do not stamp an entry you did not read against its sources.** A stamp that
  certifies the tool's blind spot is worse than no stamp, because the validator
  reports an unstamped entry and cannot report a false one.
- **Do not add a game to balance a family table.** The counts are a description
  of the collection, not a target.
- **Do not skip the second read — and do not assume it is the last one.** The
  batch of 2026-08-08 found fourteen wrong statements on the second read and
  **five more on a third, after the pull request had been approved**. Then a
  re-read of one *inherited* entry, `sueca`, found three more that had been
  shipped since 2026-08-01. Budget three passes over anything you write, and
  treat an entry you did not write as unverified rather than as done.
- **Do not reword a term of art to clear a finding.** The poker hand ranks, "the
  right bower", a qualifier's exact wording — rewriting those makes the entry
  wrong, which is a worse outcome than a finding somebody has to read.
