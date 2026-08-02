# Naibi

*(NYE-bee)*

[![Read online](https://img.shields.io/badge/read-online-1f3a5f?style=flat-square)](https://han-tyumi.github.io/naibi/)
[![Printable booklet](https://img.shields.io/badge/print-PDF%20booklet-a4243b?style=flat-square)](https://github.com/han-tyumi/naibi/raw/main/rendered/naibi.pdf)
[![Text: CC BY-SA 4.0](https://img.shields.io/badge/text-CC%20BY--SA%204.0-1f3a5f?style=flat-square)](LICENSE)
[![Code: MIT](https://img.shields.io/badge/code-MIT-1f3a5f?style=flat-square)](LICENSE-CODE)
[![Checks](https://img.shields.io/github/actions/workflow/status/han-tyumi/naibi/validate.yml?branch=main&style=flat-square&label=checks)](https://github.com/han-tyumi/naibi/actions/workflows/validate.yml)

A free, openly-licensed reference for how to play traditional and popular card
games, stored as structured data and built to work offline.

**[Read it online](https://han-tyumi.github.io/naibi/)** ·
**[Print the booklet](https://github.com/han-tyumi/naibi/raw/main/rendered/naibi.pdf)**

> **naibi** — the first European word for playing cards. Florence, 1377.

Cards reached Europe from the Mamluk Sultanate of Egypt in the 1370s, and the
Italians called them *naibi*, from the Arabic **nā'ib**, "deputy" — the rank of
court card in the Mamluk pack that every European deck descends from. Spain
still calls them *naipes*. The name is the beginning of the story this project
is trying to tell in full.

Every game is a JSON file. Generators turn those files into a website, a
printable PDF and Markdown, all from the one source, so a rule corrected once is
corrected everywhere.

**Where things are written down.** This file is the entry point; the detail lives
in two places, kept apart on purpose because they behave differently:

| | | |
| --- | --- | --- |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | **Live** | How an entry is shaped, what belongs here, how prose is written and checked, what has to pass. Edited whenever it stops being true. |
| [`decisions/`](decisions/README.md) | **Historical** | Why the project is the way it is. Written once and superseded rather than edited — what was believed at the time is the point. |

Nothing is stated in more than one of them. Two copies of a rule is two things
that can drift, which is the failure this project spends most of its effort
avoiding.

**Status:** 70 games, all validating. The site is built and installable; the
companion tools are not started.

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
| **`packages/web/`** | The site: static, installable, offline. Private. |
| **`packages/build/`** | Validation and output generation. Private; not published. |
| `packages/build/validate.ts` | Schema + consistency check. Run before committing. |
| `packages/build/checks.ts` | The rules a schema cannot express. Pure functions, unit tested. |
| `packages/build/render-markdown.ts` | Generates `rendered/`. |
| `packages/build/build-pdf.ts` | Compiles every game into one printable PDF. |
| `packages/build/pick.ts` | Query the collection: "what can 5 of us play with one deck?" |
| `packages/build/originality.ts` | Compare an entry's prose against source text. `npm run originality`. |
| `packages/data/src/layout.ts` | Turns a game's `layout` into diagram geometry. |
| `packages/data/src/figure.ts` | Ranking-strip and combination geometry, including where a long row wraps. |
| `packages/data/src/prose.ts` | Parses the prose convention, shared by the PDF and the site. |
| `packages/data/src/svg.ts` | Draws that geometry as SVG, for Markdown and for the site. |
| `packages/web/assets/search.js` | Search: builds the index and ranks queries. Shared by build and browser. |
| `packages/web/assets/facets.js` | The filter chips' predicate. Shared by the page and the tests. |
| `packages/web/records.ts` | Reduces a game to what search and the filters index. |
| `packages/web/assets/og-card.html` | Source for the link preview image. `npm run og` renders it. |
| `packages/*/test/*.test.ts` | Tests. `npm test`. |
| `rendered/*.md` | **Generated.** Never hand-edit — your changes get overwritten. |
| `rendered/diagrams/*.svg` | **Generated** setup diagrams. |
| `docs/` | **Generated** site, served by GitHub Pages. |
| `decisions/` | **Historical.** Why the project is the way it is; superseded, not edited. |
| `CONTRIBUTING.md` | **Live.** How to work on this. Edited when it stops being true. |
| `CLAUDE.md`, `.claude/skills/` | Instructions for coding agents working on this repo. |
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

npm run web        # build the site into docs/
npm run web -- --check   # fail if docs/ is stale (CI gate)

npm run og         # regenerate the link preview card (needs playwright)

npm run build      # all four, in order

npm test           # run the tests
npm run check      # CI gate: validate + rendered/ and docs/ current + typecheck + tests
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

## The collection

70 games, from Klondike to Skat, Bridge to Koi-Koi.

| Family | Games |
| --- | --- |
| Matching & collecting | 14 |
| Shedding | 12 |
| Trick-taking | 15 |
| Solitaire (1 player) | 11 |
| Rummy family | 8 |
| Bluffing | 7 |
| Casino | 3 |

Browse them at [`rendered/index.md`](rendered/index.md), or run the site.

## The site

`npm run web` generates `docs/`: a static, installable, offline-first app built
from the same data as everything else. No framework and no bundler — the output
is HTML, one stylesheet and about forty lines of JavaScript for filtering.

It is a **progressive web app**, which suits this project unusually well. The
whole corpus is around 220 KB gzipped, so the service worker precaches *all* of
it on first visit: every game, every diagram. Offline here means the entire
reference, not a cached subset. None of the usual PWA weak spots — background
sync, native APIs, deep OS integration — apply to something read-only with no
backend and nothing to sync.

**To publish it:** repository Settings → Pages → deploy from branch `main`,
folder `/docs`. There is nothing else to configure, and no hosting bill: the
whole thing is static files.

**One honest limitation.** iOS may evict cached storage after a few weeks
without use, which would empty the app exactly when someone opens it offline
having not touched it in a while. `navigator.storage.persist()` can ask for
protection but on iOS is gated behind notification permission, a poor trade for
a rules reference. Android is unaffected. If guaranteed offline ever matters
more than that, a thin native wrapper reuses this same code and ships the data
inside the app bundle — building the PWA first does not foreclose it.

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
