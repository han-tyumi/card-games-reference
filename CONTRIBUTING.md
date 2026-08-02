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
4. Describe the **most widely played modern version** in the main text. Put
   notable alternatives in `variants` — two to five is right for this project.
   Exhaustive regional coverage is explicitly not the goal.
5. Check the wording against your sources **now, while the entry is fresh**, not
   in a sweep at the end of a batch — that is how the last one went, and it was
   painful. Put the source text in `.sources/<slug>/` (gitignored) and run
   `npm run originality -- --game <slug>`. A run that says it checked nothing
   still exits 0, so read what it reports rather than its exit code. Then
   `npm run originality -- --stamp <date> <slug>`, naming only what you read.
   The `originality-pass` skill has the fetch recipe and the network control it
   insists on first.
6. Update the README's `**Status:**` count, its collection blurb and its family
   table. Three tests in `packages/build/test/docs.test.ts` fail until you do.
7. Run `npm run build`, and commit everything it regenerates: `rendered/`,
   `docs/` **and `rendered/naibi.pdf`**. The first two are gated; the booklet is
   not, because it embeds a subset of a system font and so is only reproducible
   on one machine — see [0012](decisions/0012-the-booklet-cannot-be-byte-gated.md).
   Committing a stale booklet is the one mistake nothing here will catch.
8. `npm run check`.

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
    "extra_deck_for_large_groups": false,
    "other": []
  },
  "setup": "...",
  "play": "...",
  "goal_and_scoring": "...",
  "variants": [{ "name": "Jack of Diamonds", "description": "..." }],
  "difficulty": "easy",
  "duration_minutes": "30-60",
  "tags": ["classic", "strategy", "family-friendly"],
  "sources_consulted": ["Pagat", "Bicycle Cards"]
}
```

A few conventions worth knowing:

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
  `standard_decks` counts the packs you must **own** — Euchre is 1 and Pinochle
  is 2, because their stripped decks get built from ordinary ones.
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
sources open, across two passes. Earlier work counted search-engine hits, which
the section below explains does not work, so those passes are not evidence of
anything and are not counted here.

**The first 60 entries, on 2026-08-01** — pagat and Wikipedia, fetched and read
side by side with our prose. At a bar of 80% shared structure or 8 identical
consecutive words: **39 of 60 entries flagged, 36 verbatim runs**. Rewritten:
**26 passages across 19 entries**. The problems were structural rather than
lexical — Pinochle carried eighteen consecutive words identical to pagat's,
Hearts eleven, Spades ten, and one trick-taking formula had propagated into five
separate entries.

**The 12 entries added on 2026-08-02**, each checked immediately after it was
written rather than in a sweep at the end. **9 of the 12 were flagged: 26
verbatim runs and 5 whole-passage order findings.** All were rewritten and the
re-run came back clear of them. Two more entries had passages rewritten on
reading rather than on a flag — one had reproduced a source's worked examples,
the other had walked a source's strategy list in its order. The order findings
were the interesting ones and four of the five were `setup` sections, which
reach for the source's sequence because dealing a game has a natural order; each
was reorganised rather than reworded.

**Eight verbatim runs were kept deliberately.** They are the vocabulary of the
games and not anyone's prose: the poker hand ranks in ascending order, "right
bower (the jack of the trump suit)", Skat's German multiplier list, "two cards
face down and one face up", the Snap shout, "deal N cards to each player, one at
a time". Rewording those would make the entries wrong.

**What the pass does not establish**, and none of it should be glossed over:

- Paraphrase that swaps the vocabulary scores like independent writing. Measured
  on fixtures: a sentence rebuilt from a source's clause order scored 0.15,
  an honest rewrite of the same rule 0.12. Structural reuse is caught; thorough
  rewording is not.
- 12 entries were compared against **one** source rather than two, because pagat
  carries few solitaires: `accordion`, `beggar-my-neighbour`, `forty-thieves`,
  `freecell`, `golf-multiplayer`, `klondike`, `koi-koi`, `mau-mau`, `pyramid`,
  `speed`, `spider`, `tripeaks`. Several list further sources in
  `sources_consulted` that were not pulled.
- Of the 2026-08-02 batch, **9 of 12 had two sources rather than three** —
  pagat and Wikipedia. Only `red-dog`, `baccarat` and `canfield` had a third.
  Two sources is what the contributing steps ask for and it is still the thinner
  end of the range.
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
npm run typecheck  # tsc --noEmit
```

### Types come from the schema

`packages/data/schema/game.schema.json` is the single source of truth.
`npm run types` generates `packages/data/schema/game.types.ts` from it, so the `CardGame` type — including the
literal unions for `category`, `difficulty`, and `tags` — is never hand-written
and cannot drift from what the validator enforces. The website and app can
import that type directly rather than redeclaring it.
