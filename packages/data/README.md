# @card-games/data

Original, openly-licensed rules for traditional and popular card games, as
structured data. This is the source of truth the whole project builds on — the
Markdown, the PDF, and eventually the website and apps all read from here.

Part of the [Open Card Game Rules Reference](../../README.md).

## Using it

```ts
import { loadGames, playersLine, type CardGame } from "@card-games/data";

const games = loadGames();
const forFive = games.filter((g) => g.players.min <= 5 && 5 <= g.players.max);
const oneDeck = forFive.filter((g) => g.equipment.standard_decks === 1);
```

The raw JSON is importable directly, and the schema comes along too:

```ts
import hearts from "@card-games/data/games/hearts";
import schema from "@card-games/data/schema" with { type: "json" };
```

`CardGame` is generated from `schema/game.schema.json`, so the type and the
validation rules cannot drift apart. `category`, `difficulty`, and `tags` come
through as literal unions rather than plain strings.

## No server required

These are static files. Consumers bundle them at build time rather than fetching
them — which is what makes offline use possible, and means the project needs no
backend to run.

## Contents

| Path | What |
| --- | --- |
| `games/*.json` | One file per game. Hand-edited; the source of truth. |
| `schema/game.schema.json` | The contract every entry satisfies. |
| `schema/game.types.ts` | Generated types. `npm run types` to rebuild. |
| `src/index.ts` | Loading and formatting helpers shared by all consumers. |

## Licence and credit

Game write-ups: [CC BY-SA 4.0](LICENSE). Code: [MIT](LICENSE-CODE).

Using the write-ups anywhere public means crediting the project and keeping your
version under the same licence. A valid credit names the project, links to it,
and states the licence:

> Rules from the [Open Card Game Rules Reference](https://github.com/han-tyumi/card-games-reference),
> licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Commercial use is fine and needs no permission. Found a rule that is wrong?
Please open an issue upstream rather than fixing it only in your copy.

The rules of a card game are facts and free for anyone to describe. The wording
here is the project's own — written from scratch, never copied or reworded from
another source. See the [main README](../../README.md) for the full approach.
