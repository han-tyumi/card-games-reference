# 0021. Two payload budgets, and what happens when one is reached

- **Status:** Accepted
- **Date:** 2026-08-06

## Context

[0006](0006-cache-first-with-an-update-notice.md) chose to precache the whole
corpus, and [the print sheet](../packages/web/build-web.ts) ships every game in
one page so a filtered selection can be printed. Both are right at 72 games and
both grow with it. [The handoff](../specs/2026-08-04-before-more-games-handoff.md)
recorded the sizes and left the question open, on the grounds that there is an N
where each stops being right and it is better found deliberately than discovered
as "installing takes forever now".

The handoff's figures are uncompressed. GitHub Pages serves this gzipped —
`content-encoding: gzip`, `cache-control: max-age=600`, weak ETag, checked
against the live site — so what a reader downloads is about a third of what was
written down:

| | on the device | over the wire | per game, over the wire |
| --- | --- | --- | --- |
| precache, 84 entries | 1818 KB | 574 KB | 8 KB |
| `print.html` | 1177 KB | 267 KB | 4 KB |

Growth is linear and was measured rather than assumed, over slices of 18, 36, 54
and 72 games: a straight line through the ends predicts the middle to within
1.1%. At 300 games that is 2.0 MB over the wire to install and 1.0 MB for the
sheet.

Three things were measured in Chromium that bytes do not show. Corpora above 72
are the real entries duplicated with distinct ids, so the markup is real and
only the count is invented.

**Installing is background, and slow.** Against a server holding a Fast 3G
profile — 1.6 Mbps, 150 ms round trip, gzip, revalidated — a first install took
6.5s over 92 requests at 72 games and 19.7s over 308 at 288. Nobody waits on it;
the page is readable throughout. It is bandwidth spent on a reader's behalf
without being asked.

**Every deploy costs a returning reader another pass over the list.** The cache
name changes with the content hash, so `install` runs again over everything. A
one-entry change at 288 games cost 301 requests, 298 of them 304s, 277 KB. The
bytes are small and the request count is not, and it is paid on every deploy
rather than once. Wall-clock is not reported here because the harness is
HTTP/1.1 and Pages is HTTP/2, where those requests multiplex.

**The sheet's cost is the device, not the wire.** With the CPU throttled 4×,
`print.html` took 2.4s to load at 72 articles and 8.2s at 288 — 41,447 DOM nodes,
laid out before anything is shown. That is the failure the handoff predicted,
and it is a rendering cost that no amount of compression touches.

**And the install had a reliability problem nobody had looked for.**
`cache.addAll` is atomic by specification: one failed request rejects the whole
promise, `install` fails, and the reader gets *no* offline copy rather than most
of one. The odds of a clean run are (1−p)^N, so they fall as the corpus grows
while nothing about the reader's connection changes. Measured against a server
dropping requests at random, eight installs per cell:

| entries | drop rate | one `addAll` | shell + best-effort pages |
| --- | --- | --- | --- |
| 84 | 0.5% | 5/8 | 6/8 |
| 84 | 1.5% | 2/8 | 4/8 |
| 300 | 0.5% | **1/8** | **8/8** |
| 300 | 1.5% | **0/8** | 5/8 |

At 300 entries the current install is a coin that lands wrong. The tiered
install's own failures are its shell tier, whose size does not move with the
corpus. Its successful installs held 298.6 of 300 entries on average at 0.5% and
295.6 at 1.5% — the shortfall is game pages, which the fetch handler puts the
first time one is opened.

### How the browser figures were taken

Written down because none of them is reproducible from the repository: the
harnesses were scratch scripts, deliberately, since a hand-run check nobody runs
is a liability and there is already one of those. Rebuilding them needs
`npm install --no-save playwright`, `buildSite()` over a duplicated corpus, and:

- **throttling in the server, not through CDP.** `Network.emulateNetworkConditions`
  is scoped to the page target and does not reach service-worker fetches, which
  is precisely the traffic being measured. The first version of this reported a
  flat 1.9s install from 84 entries to 300, which is the tell.
- **`cache-control: no-cache` and a real ETag**, so a redeploy measures a reader
  returning after the freshness window rather than one returning inside it.
- **counting the cache after install**, because a worker that quietly cached
  four entries reports a lovely install time.
- **waiting on the cache NAME changing** to measure a redeploy. Waiting on
  `navigator.serviceWorker.controller` measures nothing: the page is already
  controlled, so it is true before the new worker exists, and the first version
  of that returned "0 requests in 106ms".

## Considered options

- **Leave both, revisit when someone complains.** Rejected. That is the outcome
  the handoff exists to avoid, and the reliability figures say the complaint
  would arrive as "it does not work offline", which is unattributable.
- **Stop precaching game pages now; cache them as they are visited.** Rejected
  at this size. It breaks the promise the app is built on — open it once, and
  the whole reference is there with no signal — for a reader who installs at
  home and opens it where there is no signal. It is the right answer eventually,
  which is why it is written down below as the response rather than discarded.
- **Precache a subset — the popular games, the short ones.** Rejected: there is
  no usage data to pick from, "popular" is a guess, and a reference that has
  some of the games offline is worse to explain than one that has all or fetches
  on demand.
- **Make the sheet assemble itself from the cached game pages.** Not now, and
  for the sheet this is the pre-decided answer at the budget. It costs the
  no-JavaScript fallback, which today is the honest one: without scripting the
  page still holds every game, which is more than you asked for rather than
  less.
- **A budget nobody can see until it fails.** Rejected on the same rule as the
  originality coverage line — a number that only speaks when it is already too
  large says nothing about the approach to it.
- **Budgets, reported every build and asserted in the suite, with the response
  written down.** Chosen, together with the two fixes the measurements paid for.

## Decision

**The precache stays whole, and the install stops being all-or-nothing.** The
worker ships two lists. `SHELL` — the start URL, the index, About, the
stylesheet, the scripts, the search index, the icons — is cached atomically,
because an app missing its own stylesheet is not one that works offline, and a
failed install is retried on the next navigation. `PAGES` — one entry per game,
the part that grows — is cached in batches of twelve, tolerating individual
failures, with one retry pass for whatever missed. A page that never made it is
fetched and put by the fetch handler the first time it is opened with a signal.

**The sheet skips what is off screen.** `content-visibility: auto` on the
sheet's articles, with `contain-intrinsic-size: auto 7000px` as the placeholder.
It is scoped to `.sheet ~ article.game` and not to `article.game`, because
containment stops margins collapsing and the unscoped version made all 72 game
pages 14px taller — measured in screenshots, after writing it the other way
first. It is reverted inside `@media print`, where nothing is off screen.

**Two budgets, over the wire, reported on every build and asserted in the
suite.** The precache may reach 1500 KB gzipped and `print.html` 800 KB. At the
measured slope those are about 210 and 218 games, found by bisecting the real
builder rather than extrapolating a line.

**What happens when each is reached** is decided now, so that whoever trips it
is not designing under time pressure:

- *Precache at 1500 KB.* Install the shell and fill the game pages in the
  background afterwards, rather than dropping them from the cache. The bytes are
  the same; what changes is that they stop being spent before the worker takes
  over. The offline promise survives, and the reliability work above is what
  makes a partial cache a normal state rather than a broken one.
- *`print.html` at 800 KB.* Ship the sheet as a shell that assembles the
  selection from the game pages the worker has already cached, which is a few
  kilobytes and works offline because those pages are precached. The cost is the
  no-JavaScript fallback, and the `<noscript>` replacement is the booklet and
  the individual pages.

## Consequences

The sheet loads in 0.5s at 72 articles and 1.5s at 288, against 2.4s and 8.2s,
with the CPU throttled 4×. Printing is unaffected: printed to PDF through the
browser, the page count is identical with the rule and without it — 374 pages at
72 articles, 1496 at 288 — and the guard in `@media print` means the rule cannot
be what makes a sheet come out blank. Find-in-page, anchors and assistive
technology all still reach skipped content; that is the difference between this
and hiding it.

The scrollbar on the sheet is now an estimate until sections have been scrolled
past. 7000px is measured — the median article is 8144px at 390px wide and 6838px
once the column stops widening — and a wrong guess costs scroll accuracy and
nothing else. The first version guessed 1200px and made the sheet claim a sixth
of its real length.

A reader on a bad connection now ends up with most of the corpus cached instead
of none of it, and cannot tell which. That is the cost of tolerance and it is
accepted deliberately: the alternative measured 0/8. Nothing reports a partial
cache, and the fetch handler's offline fallback serves the index for a page that
is missing, which is a confusing answer rather than a wrong one. If that becomes
worth fixing, the worker knows both lists and could say what it holds.

Tolerance is for the network and not for a broken manifest. An entry listed and
not shipped now fails quietly at install where it used to fail loudly, so the
test that every listed file exists is doing more work than it was.

The budgets are ceilings on *this* design, not a claim that 210 games is a limit.
Both responses above keep growing past them; what the numbers buy is that the
change happens on purpose, with the measurements to hand, instead of after a
report that installing takes forever.

The deploy cost — one conditional request per precached entry, on every
deployment, for a reader who returns after the ten-minute freshness window — is
measured and left alone. Per-entry revisions in the worker would reduce it to
the files that changed; at 277 KB and mostly 304s it is not yet worth the
complexity, and it is recorded here so the next person to notice it does not
have to measure it again.
