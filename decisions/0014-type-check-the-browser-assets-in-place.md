# 0014. Type-check the browser assets in place rather than converting them

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

`packages/web/assets/*.js` — the search index, the filter predicate, and the
page wiring — were the only code in the project TypeScript never looked at.
`allowJs` was on, so they could be imported by `.ts` files, but `checkJs` was
off and the files were not in any `include`, so nothing checked them. That is
not obvious from the outside: a green `npm run typecheck` looked like it covered
the repository.

They are `.js` and not `.ts` because `docs/` ships them to the browser exactly as
they sit on disk. There is no build step to strip types with, and adding one is
what [0001](0001-run-typescript-directly.md) and
[0005](0005-hand-rolled-site.md) both refused.

## Considered options

- **Convert them to `.ts`** — rejected: it requires the build step those two
  records exist to avoid, and it would mean the file the browser runs is no
  longer the file in the repository.
- **Leave them unchecked** — rejected, and the reason is measurable rather than
  a matter of taste. Turning checking on found 45 errors, of which two were real:
  the offline fallback built an index object missing two fields that `score`
  reads, and an unrankable difficulty passed every difficulty filter because
  `undefined > undefined` is false either way round.
- **`lib: ["dom"]` in the main config** — rejected: it hands `document` and
  `window` to every Node script in the project, where reaching for them is a
  mistake worth catching rather than a facility worth having.
- **JSDoc and `checkJs`, in a second config** — chosen.

## Decision

Keep the browser assets as plain ES modules and type them with JSDoc.
`tsconfig.web.json` extends the main config, adds the DOM lib, drops the Node
types, and turns `checkJs` on for `packages/web/assets/*.js` only.
`npm run typecheck` runs both configs, so `npm run check` and CI cover them.

## Consequences

Types are now checked everywhere, the browser still runs the file that is in the
repository, and no build step was added. The cost is that types are written in
comments: `/** @type {HTMLInputElement | null} */ (…)` where a `.ts` file would
say `as HTMLInputElement | null`, which is more to type and easier to get subtly
wrong. Two configs also means a file added under `assets/` and not matched by the
include would be silently unchecked again, which is the same invisible gap this
record exists to close, so a test reads the config and fails if any asset falls
outside it, if `checkJs` is turned off, or if `npm run typecheck` stops running
the second config at all.

This does not extend to the rest of the project. Everything outside `assets/`
stays `.ts`, because nothing ships it to a browser.
