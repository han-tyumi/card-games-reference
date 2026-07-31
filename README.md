# Open Card Game Rules Reference

A free, openly-licensed reference for how to play traditional and popular card
games — written from scratch, stored as structured data, and built to work
offline.

Every game is a JSON file. Scripts turn those files into Markdown and into a
printable PDF, and the same data will later drive a website, a mobile app, and
PDF exports without anything being rewritten.

**Status:** v1 data set — 30 games, all validating against the schema. The
website, apps, and companion tools are not built yet.

## What's here

| Path | What it is |
| --- | --- |
| `games/*.json` | One file per game. The source of truth — hand-edited. |
| `schema/game.schema.json` | JSON Schema every entry must satisfy. |
| `schema/game.types.ts` | **Generated** TypeScript types, derived from the schema. |
| `scripts/validate.ts` | Schema + consistency check. Run before committing. |
| `scripts/render-markdown.ts` | Generates `rendered/`. |
| `scripts/build-pdf.ts` | Compiles every game into one printable PDF. |
| `scripts/games.ts` | Shared loading/formatting used by both generators. |
| `rendered/*.md` | **Generated.** Never hand-edit — your changes get overwritten. |
| `tools/` | Placeholder for planned companion tools. |

## Quick start

Requires **Node 22.18 or newer**, which runs TypeScript directly — there is no
build step and nothing is compiled.

```sh
npm install

npm run validate   # check every entry against the schema
npm run render     # regenerate rendered/
npm run pdf        # build rendered/card-games-reference.pdf

npm run build      # all three, in order
npm run check      # CI gate: validate + rendered/ is current + typecheck
```

Two more, needed only when the schema itself changes:

```sh
npm run types      # regenerate schema/game.types.ts from the schema
npm run typecheck  # tsc --noEmit
```

### Types come from the schema

`schema/game.schema.json` is the single source of truth. `npm run types`
generates `schema/game.types.ts` from it, so the `CardGame` type — including the
literal unions for `category`, `difficulty`, and `tags` — is never hand-written
and cannot drift from what the validator enforces. The website and app can
import that type directly rather than redeclaring it.

## Games in v1

Thirty games, chosen to cover the common cases: 1 to 8 players, using one or two
standard decks (Euchre and Pinochle use stripped decks built from standard ones).

- **Solitaire** — Klondike, Spider, FreeCell, Golf, Pyramid
- **Trick-taking** — Hearts, Spades, Euchre, Pinochle, Whist, Oh Hell
- **Rummy family** — Rummy, Gin Rummy, 500 Rummy, Canasta
- **Shedding** — Crazy Eights, President, Kings in the Corner, Palace,
  Egyptian Ratscrew, Slapjack, Spit, Speed
- **Matching & collecting** — Go Fish, Old Maid, War, Casino, Cribbage
- **Bluffing** — BS
- **Casino** — Blackjack

See [`rendered/index.md`](rendered/index.md) for the full table with player
counts, deck requirements, and playing times.

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

## Contributing

New games and corrections are both welcome. Corrections especially — card game
rules vary by region and by kitchen table, and getting the commonly played
version right matters more than covering every variation.

### Adding a game

1. Create `games/<slug>.json`. The filename must match the `id` field.
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
5. Run `npm run build`, and commit the regenerated `rendered/` files along with
   your JSON.

Prose fields accept a light Markdown convention: blank lines separate
paragraphs, and lines starting with `- ` become bullets. Both the Markdown and
the PDF renderer understand these. Nothing else — no headings, bold, or tables.

### Style

- Plain and direct. Second person where it reads naturally.
- No filler — skip the "this beloved classic has entertained families for
  generations" opening and get to the rules.
- Numbers must be exact. "Deal seven cards each" beats "deal a few cards each."
- If sources genuinely disagree on something significant, pick the most common
  version for the main text and note the alternative as a variant.

### Checklist before opening a PR

- [ ] `npm run check` passes
- [ ] `rendered/` regenerated and committed
- [ ] Wording is original — nothing copied or lightly reworded from a source
- [ ] `sources_consulted` lists what you actually checked, by name
- [ ] Could a stranger play the game from your entry alone?

## Licensing

| What | License |
| --- | --- |
| Game write-ups and prose (`games/`, `rendered/`, `README.md`) | [CC BY-SA 4.0](LICENSE) |
| Tooling and schema definition (`scripts/`, `schema/`) | [MIT](LICENSE-CODE) |

CC BY-SA 4.0 means anyone can use, remix, and build on the write-ups — including
commercially — as long as they credit the project and release their version
under the same license. That keeps the reference free downstream instead of
letting it get absorbed into a closed product.

MIT on the tooling means the scripts can be reused with no strings attached,
which is the friendlier default for code.

## Not in scope yet

The website, the mobile app, and the companion tools described in
[`tools/README.md`](tools/README.md) are all planned but unbuilt. This repository
is the data and the build pipeline that will feed them.
