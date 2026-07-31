# Naibi

*(NYE-bee)*

A free, openly-licensed reference for how to play traditional and popular card
games — written from scratch, stored as structured data, and built to work
offline.

> **naibi** — the first European word for playing cards. Florence, 1377.

Cards reached Europe from the Mamluk Sultanate of Egypt in the 1370s, and the
Italians called them *naibi*, from the Arabic **nā'ib**, "deputy" — the rank of
court card in the Mamluk pack that every European deck descends from. Spain
still calls them *naipes*. The name is the beginning of the story this project
is trying to tell in full.

Every game is a JSON file. Scripts turn those files into Markdown and into a
printable PDF, and the same data will later drive a website, a mobile app, and
PDF exports without anything being rewritten.

**Status:** v1 data set — 30 games, all validating against the schema. The
website, apps, and companion tools are not built yet.

## What's here

An npm workspaces monorepo. The data is a package in its own right, so the
website, the apps, and the build tooling all consume one source of truth rather
than each keeping their own copy.

| Path | What it is |
| --- | --- |
| **`packages/data/`** | **`naibi`** — the source of truth. Everything else reads from it. |
| `packages/data/games/*.json` | One file per game. Hand-edited. |
| `packages/data/schema/game.schema.json` | JSON Schema every entry must satisfy. |
| `packages/data/schema/game.types.ts` | **Generated** types, derived from the schema. |
| `packages/data/src/index.ts` | Loading and formatting helpers shared by all consumers. |
| **`packages/build/`** | Validation and output generation. Private; not published. |
| `packages/build/validate.ts` | Schema + consistency check. Run before committing. |
| `packages/build/render-markdown.ts` | Generates `rendered/`. |
| `packages/build/build-pdf.ts` | Compiles every game into one printable PDF. |
| `packages/build/pick.ts` | Query the collection: "what can 5 of us play with one deck?" |
| `packages/data/src/layout.ts` | Turns a game's `layout` into diagram geometry. |
| `packages/build/svg.ts` | Draws that geometry as SVG. |
| `rendered/*.md` | **Generated.** Never hand-edit — your changes get overwritten. |
| `rendered/diagrams/*.svg` | **Generated** setup diagrams. |
| `tools/` | Notes on planned companion packages. |

Packages get added as they are built — a website, graphics, companion tools.
None of them fork the data; they depend on `naibi`, which means a
rule fix reaches every one of them in a single commit.

## Quick start

Requires **Node 22.18 or newer**, which runs TypeScript directly — there is no
build step and nothing is compiled.

```sh
npm install

npm run validate   # check every entry against the schema
npm run render     # regenerate rendered/
npm run pdf        # build rendered/naibi.pdf

npm run build      # all three, in order
npm run check      # CI gate: validate + rendered/ is current + typecheck
```

### What can we play right now?

`equipment` exists so this is a query rather than a reading exercise:

```sh
npm run pick -- --players 5 --decks 1
npm run pick -- --players 2 --minutes 20 --difficulty up-to-easy
npm run pick -- --players 4 --tag family-friendly --jokers
```

Filters: `--players`, `--decks`, `--jokers`, `--minutes`, `--difficulty`
(`simple`/`easy`/`medium`/`complex`, or `up-to-medium`), `--category`, and
`--tag` (repeatable). This is a demonstration that the data supports the
filtering a real picker needs — not the companion tool described in
[`tools/README.md`](tools/README.md).

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
`tableau` fans out while other kinds stack squarely, and `last-up` means face
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

So before opening a PR, take two or three of your most **specific procedural
sentences** and search each as an exact quoted phrase. If a card game rules site
comes back with your sentence — or with your sentence wearing different nouns —
rewrite the passage from scratch. Keep the rule identical and change the
expression: different clause order, different framing, different sentence
boundaries.

Pick sentences that would be damning if they matched. Searching "Aces are low"
proves nothing; a match there is coincidence.

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
5. Run `npm run build`, and commit the regenerated `rendered/` files along with
   your JSON.

Prose fields accept a light Markdown convention: blank lines separate
paragraphs, and lines starting with `- ` become bullets. Both the Markdown and
the PDF renderer understand these. Nothing else — no headings, bold, or tables.

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
| Game write-ups and prose (`packages/data/games/`, `rendered/`) | [CC BY-SA 4.0](LICENSE) |
| Tooling and schema definition (`packages/build/`, `packages/data/schema/`) | [MIT](LICENSE-CODE) |

CC BY-SA 4.0 means anyone can use, remix, and build on the write-ups — including
commercially — as long as they credit the project and release their version
under the same license. That keeps the reference free downstream instead of
letting it get absorbed into a closed product.

MIT on the tooling means the scripts can be reused with no strings attached,
which is the friendlier default for code.

### What an open license does and does not give away

A license is a grant of permission **to other people**. It does not transfer or
diminish the authors' own rights, and this trips people up often enough to be
worth stating directly:

- **The authors keep their copyright.** Licensing the text under CC BY-SA does
  not hand ownership to anyone.
- **Running ads, taking donations, or selling an app built on this project is
  entirely permitted** and needs no change of license. Open licensing restricts
  what you may stop *others* doing; it puts no limit on what the project itself
  may do with its own work.
- **What ShareAlike actually costs you** is exclusivity: a competitor may take
  these write-ups and publish a rival reference, provided they credit this
  project and license their version the same way. They cannot take the text
  closed, and they cannot stop this project from doing anything.
- **The website and apps are separate works** in their own repositories. They
  are not covered by this repository's licenses and may be as restrictive as
  their authors like — even closed source — as long as the CC BY-SA text they
  display is still credited and still offered under CC BY-SA.

The short version: CC BY-SA keeps the *rules text* free for everyone while
leaving every commercial option open to the project. If the goal ever changes to
keeping the text itself exclusive, that is a different license and a decision to
take deliberately — and one that gets harder once outside contributions land.

### Why not a NonCommercial licence?

The obvious way to stop people profiting from this work is CC BY-**NC**-SA, and
it is usually a trap. Worth knowing why, because it looks like the answer:

- **"Commercial" is dangerously vague.** A hobbyist whose site runs one ad
  banner is arguably commercial. So is a teacher selling printed handouts at
  cost. NonCommercial licences generate arguments, not protection.
- **It would restrict this project too.** The instant anyone else contributes,
  their work is NC as well — including against *this* project's own ad-supported
  or paid app, unless every contributor grants a separate exemption. The
  restriction is easy to aim outward and hard to keep off yourself.
- **It is not an open licence.** NC content cannot be used by Wikipedia, most
  open collections, or many educational projects. It would cut this reference
  off from the audience most likely to contribute to it.

ShareAlike gets the actual goal — nobody may take this and close it — without
any of that. A rival can republish the write-ups, but they must credit this
project and keep their version equally free, which is a poor foundation for a
competing product and a good reason to just contribute here instead.

### Contributions

Contributions are accepted under the same terms the repository already uses —
CC BY-SA 4.0 for prose, MIT for code — so the licensing stays uniform and the
project never ends up with passages it cannot redistribute.

Contributors keep the copyright in what they write. That has one consequence
worth planning around: **relicensing later would require every contributor's
agreement.** If the project ever wants to keep that option open — say, to
publish a print edition on different terms — the time to add a contributor
license agreement is before outside contributions start arriving, not after.

## Crediting this project

Attribution is the one thing CC BY-SA asks of you, so here is exactly how to do
it. If you use these write-ups anywhere — a site, an app, a printed handout, a
video — include a credit like:

> Rules from [Naibi](https://github.com/han-tyumi/naibi),
> licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Three things make a credit valid: **name the project, link back to it, and state
the licence.** If you changed the text, say so — and your version must also be
CC BY-SA 4.0.

You do not need permission and you do not need to ask. Commercial use is fine.
The only things that are not fine are dropping the credit, or relicensing the
text under terms that let someone else close it.

Corrections are more useful to everyone than a fork. If a rule here is wrong,
please open an issue or a pull request rather than fixing it only in your copy —
that is the whole bargain this licence is built on.

## Supporting the project

The reference itself costs nothing to run: the data is static files, the site
deploys to free static hosting, and the apps ship the rules inside the bundle
rather than calling a server. That is deliberate — no backend means no bill, and
it is also what makes the whole thing work offline.

Where money does help is the incidentals: a domain name, artwork, and the time
that goes into writing and checking entries. If sponsorship is enabled, a
`Sponsor` button appears on the repository — see
[`.github/FUNDING.yml`](.github/FUNDING.yml) for how to turn that on.

Taking donations, running ads, or selling an app built on this data is fully
compatible with CC BY-SA. An open licence limits what you can stop *other people*
doing; it puts no limit on what this project does with its own work.

## Not in scope yet

The website, the mobile app, and the companion tools described in
[`tools/README.md`](tools/README.md) are all planned but unbuilt. This repository
is the data and the build pipeline that will feed them.
