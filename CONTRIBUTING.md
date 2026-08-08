# Contributing to Naibi

Everything about working on this project: how an entry is shaped, what belongs
here, how the prose is written and checked, and what has to pass before a change
lands.

This is a **live document** — it describes how things are now, and it gets edited
when they change. The reasoning behind the decisions it rests on is in
[`decisions/`](decisions/README.md), which works the opposite way: those records
are written once and superseded rather than edited, because what was believed at
the time is the useful part.

## Contributing

New games and corrections are both welcome. Corrections especially — card game
rules vary by region and by kitchen table, and getting the commonly played
version right matters more than covering every variation.

### Adding a game

1. Create `packages/data/games/<slug>.json`. The filename must match the `id` field.
2. Research the rules from **two or three independent sources** so you notice
   where they disagree. Then write the entry in your own words, per the
   copyright rules above.
3. Aim for entries someone could actually play from with a deck in hand and no
   other reference. The details people argue about are the ones worth nailing
   down: who leads first, is the ace high or low, what happens on a tie, what
   happens when the stock runs out.
4. **State only what a source you actually read supports.** The originality
   check compares your wording against those sources; nothing anywhere compares
   your *facts* against them, and a confident sentence nobody can back is the
   one failure the tooling will never report. Three entries written in one
   sitting carried two of them — a table rule neither source mentioned, and a
   house edge quoted against a different denominator from the source's, which
   made our number read as a contradiction of the first page a reader would
   check. Where two sources give different figures, say so and say why, rather
   than picking the one you like.
5. Describe the **most widely played modern version** in the main text. Put
   notable alternatives in `variants` — two to five is right for this project.
   Exhaustive regional coverage is explicitly not the goal.
6. Check the wording against your sources **now, while the entry is fresh**, not
   in a sweep at the end of a batch — that is how the last one went, and it was
   painful. Put the source text in `.sources/<slug>/` (gitignored) and run
   `npm run originality -- --game <slug>`. A run that says it checked nothing
   still exits 0, so read what it reports rather than its exit code. Then
   `npm run originality -- --stamp <date> <slug>`, naming only what you read.
   The `originality-pass` skill has the fetch recipe and the network control it
   insists on first.
7. Update the README's `**Status:**` count, its collection blurb and its family
   table. Three tests in `packages/build/test/docs.test.ts` fail until you do.
8. Run `npm run build`, and commit everything it regenerates: `rendered/`,
   `docs/` **and `rendered/naibi.pdf`**. All three are gated — the booklet
   joined them once the font it embeds was vendored into the repository, which
   is what made it reproducible off one machine. See
   [0013](decisions/0013-vendor-the-fonts-and-gate-the-booklet.md).
9. `npm run check`.

Prose fields accept a light Markdown convention: blank lines separate
paragraphs, and lines starting with `- ` become bullets. Both the Markdown and
the PDF renderer understand these. Nothing else — no headings, bold, or tables.

### Which games belong here?

The long-term aim is broad coverage, but the promise to a reader is narrower and
more useful: **if it is in Naibi, you can probably play it tonight.** The test is
not where a game comes from, it is what it needs on the table.

- **Anything playable with an ordinary pack belongs**, including games that strip
  it. Briscola, Scopa and Sueca use a 40-card Italian deck and Mus a Spanish one,
  but both are a standard pack with the 8s, 9s and 10s taken out — so they are no
  harder to reach than Euchre, which does the same thing. These are not exotic;
  they are Tuesday.
- **Games needing a pack of their own are a different tier.** Hanafuda cannot be
  approximated with 52 cards. Such games carry `equipment.standard_decks: 0`, and
  the picker hides them unless you pass `--special`, because recommending a game
  the reader cannot play is the one thing it must never do.
- **That tier stays small and deliberate.** Koi-Koi is here because it is a great
  game and because it proves the format generalises. Tarot games, ganjifa and
  commercial decks are all legitimate card games, and each needs its own argument
  rather than arriving by default — otherwise the collection slowly fills with
  entries nobody can act on.

Geography is not the line. Cards left Mamluk Egypt, reached Florence in 1377, and
kept going; hanafuda exists precisely because Portuguese traders carried western
cards to Japan. A reference named after that journey should follow it. It should
just be honest about what each stop requires.

### Is it a variant, or its own game?

The long-term goal is broad coverage, which makes this the question that decides
whether the collection stays navigable. The working rule:

**If you already know the parent game, could you sit down and play this one after
a sentence of explanation?** If yes, it is a variant. If you would need the rules
explained again, it is its own game.

That resolves most cases:

- **Variant** — changes a parameter: hand size, target score, which cards are
  wild, whether an optional move is allowed. Draw-three Klondike is Klondike.
- **Its own game** — changes the goal or the core mechanic. Hearts and Spades are
  both trick-taking with one deck, but avoiding tricks and bidding for tricks are
  different games, not two settings of one.
- **Its own game** — needs a different deck or a different table layout. Spit and
  Speed are close cousins with the same feel, and they are separate entries
  because the layouts differ.

Two rules of thumb for the awkward middle:

- **Follow the players, not the taxonomy.** If two groups would each say "that's
  not how you play it" rather than "that's a house rule," they are different
  games. Naming follows use.
- **When genuinely torn, prefer a variant.** A variant is easy to promote to its
  own entry later; splitting hairs into thirty near-identical files is hard to
  walk back, and it makes searching worse for the person who just wants to play.

Where a name is ambiguous across regions, say so in the prose rather than in
`aliases` — see the note on aliases above.

### Prose, lists, tables and figures each do one job

Every fact should appear **once**, in whichever medium presents it best. The
failure to avoid is writing a table out as a sentence and then printing the
table underneath it, which is how a page gets long without getting clearer.

| Use | For |
| --- | --- |
| **Prose** | The rule, the reasoning, conditions, and anything with a "because" in it |
| **A list** | Three or more parallel items that have no order or ranking between them |
| **A table** | Anything with the same shape repeated: a value per card, a hand size per player count |
| **A figure** | Spatial or ordinal facts — where things sit, what beats what, what a valid combination looks like |

So Oh Hell's prose keeps the *rule* — divide 52 by the number of players and
round down — because that generalises to any table, while the deal table carries
the worked answers. Canasta's prose says card values rise with rank and the
table lists them. Neither says "see the table below": the prose has to read
correctly on its own, since consumers of the data may render it alone.

Where prose already lists values cleanly and no table exists, that is fine. The
test is not "could this be a table" but "does a table answer the question
faster".

### Style

- Plain and direct. Second person where it reads naturally.
- No filler — skip the "this beloved classic has entertained families for
  generations" opening and get to the rules.
- Numbers must be exact. "Deal seven cards each" beats "deal a few cards each."
- If sources genuinely disagree on something significant, pick the most common
  version for the main text and note the alternative as a variant.

### Checklist before opening a PR

- [ ] `npm run check` passes (validation, types and tests)
- [ ] Behaviour you changed has a test; a bug you fixed has one naming it
- [ ] `rendered/`, `docs/` and the booklet regenerated and committed
- [ ] `npm run originality -- --game <slug>` run against real source text, its
      findings read, and the entry stamped
- [ ] `sources_consulted` lists what you actually checked, by name
- [ ] Could a stranger play the game from your entry alone?

## The data format

Each entry carries both the prose a player reads and the facets an app needs to
filter on:

```json
{
  "id": "hearts",
  "name": "Hearts",
  "aliases": ["Black Lady"],
  "category": "trick-taking",
  "players": { "min": 3, "max": 6, "ideal": 4 },
  "decks": "1 standard deck (52 cards)",
  "equipment": {
    "standard_decks": 1,
    "jokers": 0,
    "special_deck": null,
    "other": []
  },
  "setup": "Deal the full 52-card deck out evenly, one card at a time; at three or five players, remove enough low cards first that the deal comes out even. Whoever holds the two of clubs leads it to open the first trick.",
  "play": "Players follow suit if they can. A player with none of the suit led may play anything, including a heart or the queen of spades. The trick's highest card of the suit led wins it and its winner leads the next one, continuing until every card has been played.",
  "goal_and_scoring": "Each heart taken is worth one penalty point and the queen of spades is worth thirteen. Hands are replayed until somebody reaches 100 points; whoever has the fewest points at that point wins.",
  "background": "Hearts descends from a family of European trick-avoidance games and became a fixture of American card rooms in the twentieth century, well before it shipped as a default game on early Windows PCs.",
  "variants": [
    { "name": "Jack of Diamonds", "description": "The jack of diamonds is worth ten bonus points instead of a penalty, rewarding a player willing to risk holding it." },
    { "name": "Omnibus Hearts", "description": "The ten of clubs is added as a second bonus card, worth minus ten points to whoever takes it in a trick." }
  ],
  "difficulty": "easy",
  "duration_minutes": "30-60",
  "tags": ["classic", "strategy", "family-friendly"],
  "sources_consulted": ["Pagat", "Bicycle Cards"]
}
```

A few conventions worth knowing:

- `background` is optional and holds where the game came from and anything else
  that is not a rule. It renders **after** the variants, because someone with a
  deck in hand wants the deal rather than the eighteenth century. The test for
  what belongs there is whether it changes what a reader does at the table:
  Koi-Koi's warning that no Western pack will substitute, and Dou Dizhu's one
  player against the other two, are orientation and stay in `setup`; where a
  game was invented does not and goes here. `setup` is defined as how the table
  starts, and it was quietly carrying history because there was nowhere else to
  put it.
- `category` is the game's **core mechanic**, not its mood. `casino` means
  banked gambling games; a fishing/capture game like Casino (the game) is
  `matching-collecting`.
- `players.ideal` is a single number — the best count to play at. Ranges belong
  in the prose.
- `difficulty` rates **how much you must learn before a first game**, not how
  hard the game is to master. Cribbage is `medium` because the scoring takes
  explaining; Go Fish is `simple`.
- `tags` come from a fixed vocabulary defined in the schema, so filtering stays
  consistent across the collection. Adding a tag means adding it to the schema.
- `decks` and `equipment` say the same thing twice on purpose: `decks` is the
  sentence a player reads, `equipment` is the version software can filter on.
  `standard_decks` counts the packs you must **own** to play at the game's
  **minimum** player count — Euchre is 1 and Pinochle is 2, because their
  stripped decks get built from ordinary ones. It is not the requirement at
  every table: a game that wants more decks as the table grows says so with
  `decks_by_players` instead of a bigger `standard_decks`, because the field
  means the smallest table or it means nothing consistent.
- `decks_by_players` is how many decks a game needs from a given player count
  upward, e.g. `{"6": 2}` for a game that wants a second pack from six players
  on. It is read as the value for the largest key at or below the table size,
  falling back to `standard_decks` when the table is smaller than every key.
  Add it whenever the requirement climbs with the table — Nertz needs one deck
  per player, so every count from its minimum up gets an entry — and omit it
  otherwise. The field it replaced was a boolean saying a big group wanted a
  second pack, without saying how many or from what count, so nothing could
  ever filter on it.
- `aliases` never contains another game's real name. Where two games genuinely
  share a name — Speed and Spit swap names regionally, and Canfield means
  different games on different continents — the prose explains the clash instead,
  so a search for one name cannot silently return the other.

### Figures, and the one field that decides how they are drawn

A figure draws a few cards to make a point prose makes badly: what beats what,
what a legal combination looks like, what an illegal one looks like.

```json
"figures": [
  {
    "kind": "meld",
    "caption": "A run must be one suit and consecutive.",
    "rows": [
      { "label": "Valid run",
        "cards": [{ "face": "5♥" }, { "face": "6♥" }, { "face": "7♥" }] },
      { "label": "Not a run: two suits", "valid": false,
        "cards": [{ "face": "5♥" }, { "face": "6♠" }, { "face": "7♥" }] }
    ]
  }
]
```

`kind` belongs to the whole figure and decides its geometry, not just its
description. It is the one thing here worth getting right:

- **`ranking`** — every row is an order. A row **may be wrapped** onto more
  lines to fit a narrow column, because an order survives wrapping the way a
  sentence does.
- **`meld`** — a row is one combination. It is **never** split, because a
  straight flush over two lines stops looking like a straight flush. Such a
  figure overflows instead, and the page scrolls it sideways.

Choose by what would be lost if a row were broken, not by what the figure is
called. A chart of poker hands in order of power is `meld`, because each *row*
is a hand: that is why the shared poker figures are tagged that way despite
being a ranking in the ordinary sense. Tag a combination `ranking` and it gets
broken apart into something the game does not contain; tag a long order `meld`
and it runs off the side of a phone. Both validate and both render.

The budget is `MAX_FIGURE_WIDTH`, 240 units — about six cards on a line — in
[`packages/data/src/figure.ts`](packages/data/src/figure.ts), derived from
WCAG's 320px reflow target in
[0011](decisions/0011-target-320-css-pixels.md). Three melds in the corpus
exceed it on purpose and the test beside them freezes that list, so a fourth has
to be argued for rather than arriving unnoticed.

`valid: false` marks a counter-example: those cards get a dashed outline and the
row label turns red. Keep `label` short — around twenty characters — because
only one line's height is reserved above the row and a longer one is drawn over
the cards. `cards[].note` is a small caption under one card, like "Right bower".

### Figures shared between games

Poker hand rankings are the same in Hold'em, Five Card Draw and Seven Card Stud.
Repeating them in each entry means an error has to be corrected three times, and
sooner or later it gets corrected in two.

Such figures live once in `packages/data/shared/figures.json`, and a game names
the ones it wants:

```json
"figure_refs": ["poker-hands-strongest", "poker-hands-middle"]
```

`loadGames()` splices the real figure in, so **the source is shared but the
output is not**: every poker page shows the rankings in full, and no consumer of
the data has to know the indirection exists. `npm run validate` rejects a
reference to an id that does not exist, since a dangling ref would silently drop
a figure the entry believes it has.

The unit is the *figure*, not the category. `bluffing` holds BS, Mus and Truco
alongside the poker games, and none of those three use poker hands — a
category-wide figure would attach hand rankings to games that have no hands.
Share a figure when the figure is genuinely the same, not when the games seem
related.

### Setup diagrams are generated, not drawn

Games that benefit from a picture carry an optional `layout` describing the
starting table as data. The diagram is drawn from it:

```json
"layout": {
  "rows": [
    [ { "kind": "stock", "label": "Stock", "cards": 24, "face": "down" },
      { "kind": "waste", "label": "Waste", "cards": 0 },
      { "kind": "gap" },
      { "kind": "foundation", "label": "Foundations", "repeat": 4, "cards": 0 } ],
    [ { "kind": "tableau", "label": "Tableau", "repeat": 7,
        "cards": [1, 2, 3, 4, 5, 6, 7], "face": "last-up" } ]
  ]
}
```

That is the whole of Klondike's diagram. `cards: 0` draws an empty slot, a
`tableau` fans out while other kinds stack squarely, unless a zone sets `fan`
itself, as rummy-500's discard pile does, and `last-up` means face
down with the top card turned.

Rows are **centred**, which is how shapes emerge without anyone specifying
coordinates: Pyramid is rows of 1 to 7, and Kings in the Corner is `gap`/pile/
`gap` rows forming a cross.

Two things follow from generating rather than drawing them:

- **A diagram cannot go stale.** Correct a rule and the picture updates with it.
  A hand-drawn image quietly keeps showing the old rule.
- **One description, every medium.** `layout.ts` computes the geometry once;
  the SVG renderer and the PDF renderer both consume it. PDFKit cannot read
  SVG, so the PDF genuinely draws its own — sharing the geometry is what stops
  the two from disagreeing. The apps can use the same data again later.

`layout` is **optional and often correctly omitted**. Sixteen of the thirty v1
games have one. Pure trick-taking games do not: "everyone holds a hand and
tricks go to the middle" is the same picture every time and teaches nobody
anything. Add one where the arrangement is genuinely worth seeing.

Some tags carry a defined meaning rather than a vibe, and `npm run validate`
enforces them so a filter never lies to the user:

| Tag | Means |
| --- | --- |
| `solo` | Exactly 1 player — and every 1-player game must carry it |
| `two-player` | The range includes 2 |
| `partnership` | Seats at least 4 |
| `large-group` | Seats at least 6 |
| `quick` | Finishes within 30 minutes |
| `long-game` | Can run 60 minutes or more |

## Copyright: how this project handles it

**This is the rule that matters most here, so it is stated plainly.**

The **rules** of a card game — turn order, scoring, what moves are legal — are
facts about how a game works. Facts are not copyrightable, and anyone is free to
describe them in their own words. That is what makes this project possible.

The **specific wording** used by pagat.com, Wikipedia, Bicycle, published
rulebooks, and every other source *is* copyrighted. Copying it is infringement,
and so is taking a sentence and swapping a few words around.

So, concretely:

1. **Research is for facts, not for text.** Sources are consulted to confirm what
   the correct and commonly-played rules are — deal sizes, scoring values, edge
   cases. Then they are closed.
2. **Every word here is written from scratch,** organized the way this project
   wants (setup / play / goal & scoring), not mirroring any one source's
   structure or section order.
3. **No sentence is ever copied or lightly reworded.** Rewriting someone else's
   sentence with synonyms is still derived from their expression.
4. **Standard game terminology is fine and expected.** "Follow suit," "trick,"
   "right bower," "deadwood," "foundation," "going out" — these are the shared
   vocabulary of card games, not anyone's property. Use the real terms.
5. **`sources_consulted` records what was checked**, by name. It is good practice
   and honest attribution. It is *not* a copyright shield — recording a source
   does not make copied wording acceptable, and original wording is required
   whether or not a source is listed.

If you ever find text in this repository that reads like it came from somewhere
else, please open an issue. It will be rewritten.

### What has actually been checked

Every entry in the collection has been compared against source text with the
sources open, across four passes. Earlier work counted search-engine hits, which
the section below explains does not work, so those passes are not evidence of
anything and are not counted here.

**36 entries, checked 2026-08-01** — pagat and Wikipedia, fetched and read
side by side with our prose, and every one of the 37 attributes both. Ten
others that this pass covered attributed only one of the two, which meant
nobody could say what the pass had actually had for them; they were re-read on
2026-08-03 and carry that date now. The pass covered 60 entries on the day; the ones
since re-read against further sources carry a later date, so the count above is
what still rests on this pass alone. At a bar of 80% shared structure or 8
identical consecutive words: **39 of the 60 flagged, 36 verbatim runs**. Rewritten:
**26 passages across 19 entries**. The problems were structural rather than
lexical — Pinochle carried eighteen consecutive words identical to pagat's,
Hearts eleven, Spades ten, and one trick-taking formula had propagated into five
separate entries.

Twelve entries were first checked on 2026-08-02, each one immediately after it
was written rather than in a sweep at the end. **9 of the 12 were flagged: 26
verbatim runs and 5 whole-passage order findings.** All were rewritten and the
re-run came back clear of them. Two more entries had passages rewritten on
reading rather than on a flag — one had reproduced a source's worked examples,
the other had walked a source's strategy list in its order. The order findings
were the interesting ones and four of the five were `setup` sections, which
reach for the source's sequence because dealing a game has a natural order; each
was reorganised rather than reworded. Those twelve carry 2026-08-03 now — they
were re-read to record which sources a check actually had, and are the third
group below.

**31 entries, checked 2026-08-03**, in three groups, after `dou-dizhu`,
`mau-mau` and `piquet` were re-read on 2026-08-05 and carry that date now. The
groups are described below as the pass ran, so those three still appear in
them. The first twelve are the ones the 2026-08-01 pass had only
one source for, re-read one at a time against a second and a third rather than
in a sweep: `accordion`, `beggar-my-neighbour`, `forty-thieves`, `freecell`,
`golf-multiplayer`, `klondike`, `koi-koi`, `mau-mau`, `pyramid`, `speed`,
`spider`, `tripeaks`. **4 of the 12 were rewritten, 5 passages in all: 3
verbatim runs, 1 passage scoring 86% in order, and 1 whole-passage order
finding.** The order finding was a `setup` section again, which is now five of
six across two passes.

The other ten are `blackjack`, `clock`, `durak`, `egyptian-ratscrew`, `golf`,
`hand-and-foot`, `spades`, `tien-len`, `whist` and `yukon` — the entries the
2026-08-01 pass covered but attributed only one of its two sources, so that
whether they ever had two was unknown rather than merely unrecorded. Each was
re-read against two it does attribute. **6 of the 10 were flagged, 9 verbatim
runs in all**, every one rewritten; four more passages went on a READ finding
rather than a verbatim one. Two sources had to be replaced after fetching:
Britannica returned 403 and officialgamerules.org an empty 202, and MathWorld's
Clock Solitaire page turned out to be a probability note with no rules in it —
a page can return 200 and still be no use as a source. Spades kept two `setup`
and `goal_and_scoring` order findings against Bicycle: the shared sequence is
pack, then ranking, then trump, then the deal, which is the order Bicycle's own
headings impose and the order a reader needs to sit down and play. Reorganising
ours to break it would have put the pack after the deal — a worse entry bought
with a better score.

The last twelve are the batch written on 2026-08-02 and the twelve of the first
group above, re-read together to close the last of the missing source records:
`accordion`, `baccarat`, `beggar-my-neighbour`, `canfield`, `dou-dizhu`,
`fan-tan`, `five-hundred`, `forty-thieves`, `freecell`, `golf-multiplayer`,
`indian-rummy`, `klondike`, `koi-koi`, `mau-mau`, `piquet`, `pitch`, `pyramid`,
`red-dog`, `speed`, `spider`, `tarneeb`, `teen-patti`, `tripeaks`,
`twenty-nine` — 24 entries in all, each fetched fresh and read against two of
the sources it attributes, Mau-Mau against three. **12 of the 24 were flagged
and none was rewritten.** All four verbatim findings were noun phrases already
on the kept list below — "the top card of the draw pile" in `koi-koi`, "the top
card of the discard pile" and "face up on the discard pile" in
`golf-multiplayer` — and in each the source sentence they matched was stating a
different rule from ours, which is what a collision on the name of a thing looks
like. The order findings were `setup` and `goal_and_scoring` sections against
the sequence the games themselves impose, judged the way Spades was and left.

**4 entries, checked 2026-08-05** — `conquian`, `dou-dizhu`, `mau-mau` and
`piquet`, the four that carry a `background`. That field joined the fingerprint
that day, having until then been prose that shipped to readers and was never
compared against anything: the originality tool did not read it, so no earlier
pass could have shown anyone a finding in it. Each was re-read against two
sources it attributes — pagat and Wikipedia, except Mau-Mau, which has no pagat
page and was read against Wikipedia and Game Rules.

**Nothing was flagged in a `background` at all, and nothing was rewritten.** The
findings were elsewhere and all were judged and left: a `bomb` definition in
`dou-dizhu` that has no other phrasing, a `setup` order finding in `conquian`
and another in `piquet` — six of seven order findings across all passes are now
`setup` sections — and a `goal_and_scoring` alignment in `conquian` whose paired
sentences turned out to be about unrelated things, which is what the order
heuristic looks like when it fires on noise.

This is the one pass stamped by an agent rather than a person. It did the
fetching, the reading and the judging; `checked` has no field for that, so it is
recorded here. A clean result is still only a clean result: the tool cannot
certify prose original, and two sources per entry is its floor, not a thorough
search.

**1 entry, checked 2026-08-06** — `omaha`, written for this collection rather than inherited, and read against pagat and Wikipedia before it shipped. The one
finding was the sentence stating the rule the game turns on: exactly two cards
from your hand and exactly three from the board. It was left. The numbers are
the rule and "exactly" is doing the work in it — the sentence after it exists to
say the count is neither a maximum nor a minimum — and what the source puts
around that clause, the showdown framing and who takes the pot, is not what our
entry says. Three Card Poker's one finding was a forty-word sentence of ours
aligned against a seven-word glossary line, which is what a false positive looks
like here. Caribbean Stud's was five sentences in the source's order at 31%
average similarity, one of them paired with the page's own title.

What the pass caught in those two was not copying but two claims of ours that
the sources did not support: a rule about players not showing each other their
cards, and a house edge quoted against a different denominator from the one the
source used. Both were rewritten to what could be shown. Finding those is not
what this tool is for, and it found them anyway — read the sources rather than
only the report. Stamped by an agent, on the same terms as the pass above.

**5 entries, checked 2026-08-07**, in two groups. The first two are
`three-card-poker` and `caribbean-stud`, re-read after a review of the day's own
work found three claims in them that
their sources did not carry. Two were figures: a house edge stated as one number
where the two sources give 2.01% and about 3.4% against different denominators,
and a frequency for how often a Caribbean Stud dealer fails to qualify, which
neither source states at all. The third was an absolute — that the hand bet
cannot be placed without an ante — which pagat contradicts outright, noting that
some tables allow it and that taking the option costs the player. None of the
three was a copying finding, and the originality report flagged none of them:
the only findings on the re-run were the same two false positives as before.
That is twice now that reading the sources has caught what comparing against
them cannot.

The other three are `doppelkopf`, `sheepshead` and `schieber-jass`, written for
this collection and read against **three** sources apiece before they shipped:
pagat and Wikipedia in every case, plus the Deutscher Doppelkopf-Verband's
tournament rules, sheepshead.org's basic rules, and German Wikipedia
respectively. **All three were flagged. Nine passages carried 13 REUSE findings
between them, and every one was rewritten**; the re-run came back clear.

Most of that was one sentence. The clause naming what wins a trick — highest
trump, else highest card of the suit led — collided with four separate source
files at once, and the same sentence had been written into all three new entries
because it is the sentence every trick-taking game needs. `belote` and `skat`
were already carrying near-identical versions of it, which nothing checks,
because the tool compares an entry against its sources and never against the
rest of the corpus. That is the failure the 2026-08-01 pass named — one
trick-taking formula propagating into five entries — arriving again from a
direction no report covers. The three were given genuinely different sentences
rather than one shared one, which cleared the findings as well.

What was left was judged and kept: a short conditional of the source's sitting
inside a longer sentence of ours, and a ranking of ours aligned against an
eight-handed partnership rule it has nothing to do with. One ORDER finding
disappeared for an instructive reason. It rested on five sentence pairs, two of
which matched our prose against **the source page's own title**, and merging
pagat's four pages into the one file the check attributes them to made it go
away. An ORDER score on a short passage against a page with chrome in it is
measuring the chrome.

**And then the part this section exists for.** The tool found no copying worth
keeping, and the second read — the fetched sources open beside the finished
entries — found **fourteen statements that were wrong** at that point, and cut back a further
set of claims that no source carried: a prevalence nobody had counted, an
immigration date nobody had written down, a house rule called standard on no
authority. A sample of the fourteen, because the shape of them is the useful
part:

- Doppelkopf's suit solo had the declared suit's trumps **above** the queens and
  jacks. They go below: the ranking was stated backwards.
- Schieber Jass said 34 points go missing when there is no trump suit. It is 32,
  and the arithmetic is two subtractions long. Nobody had done it.
- Sheepshead said no trump may be played to a fail lead, which is the opposite
  of the rule, and explained a lone picker's score as the picker's and partner's
  columns combined, which is 3 where the schedule says 4.
- Doppelkopf credited the 40-point trick with giving the game its name. The name
  is from the doubled pack, as that entry's own `background` said two paragraphs
  later.
- Sheepshead's setup diagram seated the pick order the wrong way round the
  table. Either order validates and either one draws, which is the whole problem
  with a picture generated from data nobody re-read.

Not one of them was a copying finding, and the report flagged not one of them.
The three entries had been written from notes rather than from open pages, and
they were still wrong in fourteen places.

**Then a third read, with the pull request already approved, found five more.**
Two of them are worth naming because they are the kind that survives a careful
second pass. Doppelkopf's `scoring_table` still carried the claim about the
game's name that the second read had corrected in its prose — a fix applied in
one of the two places that stated it, which is exactly the drift the tables in
this project exist to prevent. And Schieber Jass never mentioned that most Swiss
tables now move the 11 points from the ace to the six in Undenufe, which would
have had a reader counting a whole contract wrong. The other three were an
entry giving two different answers to one situation, a list of four announced
targets that named two, and a scoring schedule that is the five-handed one and
did not say so in an entry that seats three to five.

So the second read is not the last one either. Nineteen corrections across three
entries, none of them a copying finding, none of them flagged. Stamped by an
agent, on the same terms as the two passes above.

**1 entry, checked 2026-08-08** — `sueca`, opened for one reason and rewritten
for four. The reason was a corpus-internal duplicate: its sentence for what wins
a trick stood one article away from `euchre`'s, twenty words identical. Nothing
here checks for that. `npm run originality` compares an entry against its
sources and never against the rest of the collection — and it computes exactly
that comparison anyway, 5,302 of our own pairs per run, to calibrate the bar,
then keeps the numbers and discards which pair produced them.

Measuring it exhaustively found **394 cross-game passage pairs at or above the
bar**, which sounds worse than it is. The top of that list is the vocabulary
this project has already decided to keep: the ace-ten card values across
`belote`, `skat` and `doppelkopf`, the rummy stock-and-discard sentence across
five entries. A hypothesis that multiplicity would separate a propagated formula
from shared vocabulary was tested and **failed** — the legitimate phrases are the
most multiple of all. Six entries state the trick-winning rule and five state it
in visibly different sentences; only `euchre` and `sueca` were one sentence used
twice. So a corpus-internal report is a reading list needing 394 judgements, not
a gate, and it is not built.

**Re-reading `sueca` to earn the re-stamp then found three claims its sources do
not carry**, none of them related to the duplicate that opened it:

- The deal combined two sources' incompatible halves — dealing in a single block
  of ten, from the dealer's right — and called the result Portuguese custom. One
  source pairs the block deal with the dealer's *left*; the other calls that
  pairing Brazilian. Neither states the combination the entry had.
- The revoke penalty was inverted. The entry made a four-game rubber the rule
  "most groups" use and demoted to a "milder convention" the two-game penalty
  that is the only one either source states.
- The 60-all tie was written as a dead hand. One source states, and the other
  lists, a carry-over that makes the next deal worth an extra game.

That entry came from the 2026-08-01 pass. It is one entry, so it proves nothing
about the other 35 — but it is the first inherited entry anybody has re-read
with the sources open since, and it had three. Worth a pass of its own before
the next batch of new games.

**78 of 78 checks record which sources they had**, in `checked.sources`. They
come from three different places and are not equally strong. 38 were logged as
they were made — the 31 from the 2026-08-03 passes, plus the 2026-08-06,
2026-08-07 and 2026-08-08 entries: the tool writes the files it actually compared against,
matched back to the attributed names, and refuses to stamp a source it cannot
match or a check with fewer than two. Another 36 are 2026-08-01 entries whose
own `sources_consulted` names both of the two that pass read, so that record is
reconstructed from the pass description and corroborated by the entry rather
than logged at the time.

The remaining 4 are the 2026-08-05 pass, the first set stamped by an
agent rather than a person. `background` joined the fingerprint that day, so the
four entries carrying it had prose that had never been compared against a
source; they were re-read against two sources each and re-stamped. Nothing was
rewritten — every finding was a term of art or the formulaic order of a setup —
and that judgement was the agent's. `checked` has no field for who did the
reading, which is why it is written here instead.

No check now carries a date and a fingerprint with no source count beside it.
That gap was closed by re-reading rather than by guessing — a check whose source
count nobody wrote down is not a check with one source, and the two were never
allowed to read alike. Checks made from here on record their sources as they are
made. `npm test` holds both counts to the corpus.

Two of the four would not have been found by adding sources alone. FreeCell's
came out of the Solitaire Laboratory FAQ, which is served hard-wrapped at about
70 columns; the checker splits on newlines, so every sentence in that source was
reaching the comparison in fragments and the seven-word run only appeared once
the file was unwrapped. Forty Thieves' order finding went the other way and was
an artefact: the pairs it had aligned were a play site's navigation, not its
prose, and trimming the page to its rules text cleared the finding rather than
confirming it. **Prepare the source text before trusting the comparison** —
unwrap it, and cut the chrome.

**Eleven verbatim runs were kept deliberately.** They are the vocabulary of the
games and not anyone's prose: the poker hand ranks in ascending order, "right
bower (the jack of the trump suit)", Skat's German multiplier list, "two cards
face down and one face up", the Snap shout, "deal N cards to each player, one at
a time", "the top card of the discard pile", "the top card of the draw pile",
"face up on the discard pile". Rewording those would make the entries wrong.
The last three are noun phrases with no second form, and each was checked for
shared structure around it before being left: a collision on the name of a
thing is not a collision on how the rule was explained.

**What the pass does not establish**, and none of it should be glossed over:

- Paraphrase that swaps the vocabulary scores like independent writing. Measured
  on fixtures: a sentence rebuilt from a source's clause order scored 0.15,
  an honest rewrite of the same rule 0.12. Structural reuse is caught; thorough
  rewording is not.
- No entry rests on a single source, and every check now records which sources
  it had. What none of these passes could do is use every source those entries
  name. pagat carries few solitaires and has no Mau-Mau page at all — the
  re-read confirmed that again, 404 at both spellings. officialgamerules.org
  answers 202 with an empty body, gamerules.com has no Speed page, and
  gambiter.com returns a byte-identical 8 KB page for unrelated URLs, so a run
  that trusted status codes would have recorded three sources it never read.
  Several entries still list further sources in `sources_consulted` that were
  never pulled.
- The 2026-08-02 batch was first checked with **two** sources for 9 of its 12
  entries and then re-checked with a third added to every one of them. That
  second pass is the strongest evidence here for why the range in the steps
  above says two or three: the third source found **3 more verbatim runs and 2
  more order findings that two sources had missed**, in `pitch`, `five-hundred`
  and `dou-dizhu`. All were rewritten. Nothing about those passages had looked
  wrong against pagat and Wikipedia, because the wording they converged on came
  from neither.
- 64 lower-tier candidates were sampled, not read exhaustively.

So: checked with the sources in hand, with those limits — not certified. An
entry edited after its `checked` date has not been checked in its current form
at all, and `npm run validate` will say so.

### Checking wording against a source

`npm run originality` compares an entry's prose against source text placed in
`.sources/<game-id>/*.txt` — a gitignored directory, because it holds someone
else's copyrighted prose for the length of a check and nothing more.

It does not search for phrases, and it does not use a fixed threshold. Both were
tried and both were measured failing; the numbers and the reasoning are in
[decision 0007](decisions/0007-originality-is-checked-against-sources.md).

The output is a reading list, not a verdict. Paraphrase that swaps the
vocabulary scores like independent writing, so nothing here can certify an entry
clean — only find the ones worth reading beside their source.

**Moving prose between fields does not need re-reading, but prove it.** The
fingerprint covers `setup`, `play`, `goal_and_scoring` and `background`, so
lifting a paragraph out of one and into another trips the check without a word
having changed. The rule exists to catch rewording, not relocation — so where a move is
purely mechanical, verify it and keep the original date. Verify means: the
paragraphs of the old field, sorted, are exactly the paragraphs of the two new
fields, sorted; the moved text appears verbatim in the original; and the other
prose fields are untouched. Re-stamp with the date the words were actually read,
not the date they were moved, or the record starts claiming a check that never
happened.

When you have read an entry against its sources, record it:

```sh
npm run originality -- --stamp 2026-08-01 durak whist
```

That writes a date and a fingerprint of the prose you read. Edit the entry
afterwards and `npm run validate` reports it as changed since it was checked,
rather than leaving the date claiming cover it no longer has. Stamp only what
you actually read — the tool will not stamp on your behalf, because certifying
what it failed to flag would be certifying its own blind spot.

### Check your own wording before opening a PR

This is not a hypothetical risk, and good intentions are not enough to avoid it.
When the v1 entries were audited, several passages had drifted close enough to a
source's wording to need rewriting — despite having been written by someone
working from notes rather than copying. The pattern was consistent and worth
knowing about:

- **It happens in procedural detail, not in overviews.** Every match was a
  sentence explaining a specific mechanic — how a penalty is paid, how a card
  exchange works, what happens when a pile empties, how a failed bid is scored.
  Prose about the feel of a game never matched; prose about the exact sequence
  of a rule did.
- **The cause is clause order, not vocabulary.** These were not copy-pastes.
  They were sentences that walked through a rule in the same order as the source,
  with different words in the slots. That is still derived from someone else's
  expression.
- **The narrower the rule, the higher the risk.** When a rule has one natural
  order to explain it in, everyone lands near the same sentence. Those passages
  need deliberate restructuring, not just resynonymising.

So before opening a PR, put the source text you actually used in
`.sources/<slug>/` and run `npm run originality -- --game <slug>`. Read each
flag beside the passage it came from. Where one is real, keep the rule identical
and change the expression: different clause order, different framing, different
sentence boundaries.

**Do not check this with a search engine.** Quoting is not honoured, so a hit
list is not evidence and "no results" cannot be observed at all — a control
search built from invented words returned ten results, which is how every
earlier pass in this project came to be worthless. That is what
[0007](decisions/0007-originality-is-checked-against-sources.md) records, and
why the tool reads source text instead.

## Running the checks

### Tests

```sh
npm test                      # everything
node --test packages/data     # one package
node --test --test-name-pattern="overlapping"
```

`node --test` runs the `.ts` files directly, like everything else here — no
runner, no config, no dependency.

Two things are tested, and they are not the same thing:

- **`npm run validate` checks the data.** Every entry against the schema, plus
  the rules a schema cannot express. It is what stops a bad entry being
  committed.
- **`npm test` checks the code.** The geometry behind every diagram, the prose
  parser, the search ranking, the validator's own rules, the PDF's structure,
  and the generated site — every internal link, the offline precache, the
  manifest, and the filter chips.

Both `rendered/` and `docs/` are generated output that is *committed*, so both
have a `--check` mode that rebuilds and compares. `docs/` is what readers are
served, which makes a stale copy the published rules disagreeing with the source
they came from — not a cosmetic problem.

The code tests exist because of how the bugs in this repo have actually been
found: by looking at output. A pyramid drawn with its rows apart, two captions
printed on top of one another, a search for "canast" leading with the wrong
game — none of that throws, and none of it shows up in a type error. So each of
those is now a test that names the thing that went wrong, and geometry and
ranking are asserted against the real corpus rather than against fixtures that
agree with the code by construction.

Two more, needed only when the schema itself changes:

```sh
npm run types      # regenerate schema/game.types.ts from the schema
npm run typecheck  # tsc --noEmit, twice: once for the .ts, once for the browser assets
```

### Types come from the schema

`packages/data/schema/game.schema.json` is the single source of truth.
`npm run types` generates `packages/data/schema/game.types.ts` from it, so the `CardGame` type — including the
literal unions for `category`, `difficulty`, and `tags` — is never hand-written
and cannot drift from what the validator enforces. The website and app can
import that type directly rather than redeclaring it.

The browser assets under `packages/web/assets/` are the one place types are
written in comments. They stay plain `.js` because `docs/` ships them to the
browser byte for byte and there is no build step to strip types with, so they are
typed with JSDoc and checked by a second config, `tsconfig.web.json` — which is
why `npm run typecheck` runs `tsc` twice. Annotate new code there the same way;
see [decision 0014](decisions/0014-type-check-the-browser-assets-in-place.md).

### If you work on this with Claude

`.claude/` carries two things, both checked in so that anyone working on the
repository gets them rather than having to know about them:

- **`skills/originality-pass/`** — the fetch recipe and the network control for
  checking an entry's wording against its sources, which step 5 above depends on.
- **`settings.json`** — names the [Superpowers](https://github.com/obra/superpowers)
  plugin and the official marketplace it comes from. It is a general skills
  library rather than anything specific to card games, and nothing here requires
  it; it is named because it is the toolkit this project has been built with.
  Claude Code asks before trusting a plugin, so it does not install itself behind
  your back, and deleting the file is the whole of opting out.

**`enabledPlugins` does not install anything.** Since Claude Code v2.1.195 a
plugin that only a project's `settings.json` enables, and that comes from an
external source, does not load until someone installs it — the prompt to do so
needs a person to answer. In a terminal you get that prompt. In a Claude Code
cloud session nobody can answer it, so the plugin is quietly absent, and
`claude plugin list` reports nothing installed while the marketplace sits cloned
on disk. Note that this contradicts the cloud-environments page, which claims
plugins declared this way are installed at session start; the behaviour above is
what actually happens.

To have it in cloud sessions, install it from the environment's **setup script**,
which is the one hook point that runs before Claude Code launches:

```sh
claude plugin marketplace add anthropics/claude-plugins-official || true
claude plugin install superpowers@claude-plugins-official || true
```

Both commands are idempotent, and from a cold container the pair takes about
five seconds. The `|| true` matters: a setup script that exits non-zero fails the
session.

Installing part-way through a session does eventually work, so a `SessionStart`
hook is not useless — but the skills appear at some unannounced later point
rather than at the prompt. Measured once: forty minutes, with nothing on disk
changing in between, so the delay is Claude Code re-reading what was already
installed rather than anything the session did. Prefer the setup script, which is
the only hook point that runs before Claude Code launches and therefore the only
one that has the skills present from the first turn.

Neither of the two is needed to contribute — the checks are plain `npm` scripts
and the guide above is written for a person.

## Cutting a release

You do not cut one. Everything — the version, the notes, the booklet, the tag —
happens in `.github/workflows/release.yml`, so what gets published is built by
the job that verified it rather than uploaded from whoever's laptop tagged it.

The version lives in exactly one place, `packages/data/package.json`, and is read
from there by everything that needs it. What the numbers mean, and why the
project is on `0.x`, is at the top of [CHANGELOG.md](CHANGELOG.md).

Releases cut themselves. A push to main that earns one gets one, built by the
job that verified it; a push of nothing but housekeeping gets nothing.

What decides is the **commit subject**, which now carries a conventional prefix:

| Prefix | Earns | For |
| --- | --- | --- |
| `feat:` | a minor | anything additive: new entries, new optional schema fields, new exports |
| `fix:`, `perf:` | a patch | corrections that break nothing |
| any prefix with `!` | a major | a breaking change to the schema or the exports |
| `chore:`, `docs:`, `ci:`, `test:`, `build:`, `refactor:`, `style:` | nothing | housekeeping, which must not move the version |

Write the subject the way this repository already writes them — the prefix is a
prefix, not a replacement. `fix: stop the booklet's cover reading the clock` is
the same subject it always was.

Two rules keep the number honest, both of them tested. The largest bump in a
batch wins, so one breaking change among a hundred fixes is still a major. And a
subject with **no** recognisable prefix counts as a patch rather than being
dropped: dropping it would mean a batch of sloppily-labelled work releasing
nothing and explaining nothing.

`npm run release -- --auto` is what the workflow runs, and you can run it too:

```sh
npm run release -- --auto --dry-run   # what would happen, writing nothing
npm run release -- minor              # override the decision, if it read the room wrong
```

It bumps `packages/data/package.json` — the only manifest that carries a
version, the other three being `private` and pinned at `0.0.0` so no meaning can
be read into them — moves the notes under `## [X.Y.Z] — YYYY-MM-DD`, repoints
the compare links, rebuilds the booklet because the version is printed on its
cover, runs the whole gate, and commits.

**The changelog is not surrendered to the generator.** Anything you write in
`## [Unreleased]` wins over the generated list of subjects, because an entry
written by a person summarises many commits at once and a generator can only
list them. Write one when a release deserves better than a list; leave it empty
and the subjects will do.

The workflow runs on **Validate succeeding**, not on the push, so a release is
never built from a commit that failed its own gate. **Actions → Release → Run
workflow** forces one by hand, which needs no terminal and so works from a
phone.

The README and the site link `releases/latest/download/naibi-booklet.pdf`, which
resolves to whatever was released last and so never needs editing. Note what
that means for the very first release of a fork or a rename: the URL 404s until
something has been released under it, so point the links at it *after* the first
release rather than before. Doing it the other way round publishes a broken
download, which is how it went here.

Changesets was weighed again when this was automated and turned down again: it
solves independent versioning across many published packages, and there is one.
release-please does exactly this job and was the closest fit, but it maintains a
release PR and takes ownership of `CHANGELOG.md`, which is more machinery than
one package needs. The reasoning is in
[decision 0016](decisions/0016-releases-cut-themselves-from-commit-subjects.md).
