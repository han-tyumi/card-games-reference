# What to do before adding more games

- **Status:** Done — §§1-4 all answered; see each section for where
- **Date:** 2026-08-04

Main is at **v0.3.5**. The corpus is 72 games, `npm run check` exits 0 at 466
tests, the site is live and installable, and branch previews work.

The question this answers is narrower than "what is left": **which work gets
more expensive the more games are added?** Everything below was measured on this
machine at 72 games. The measurements are the valuable part — the conclusions
follow from them and can be rechecked.

## 1. The originality tests are quadratic — do this first

**Done.** The bar is now measured over a bounded sample of pairs;
[0020](../decisions/0020-the-bar-is-measured-from-a-bounded-sample.md) records
what that was weighed against and what it costs. The measurements below are kept
as they were taken — they are the before half of the comparison.

Three tests take **61 of the test suite's 62 seconds**:

| test | time |
| --- | --- |
| the bar is measured from the corpus, and our own entries mostly clear it | 30.7s |
| a verbatim copy clears the measured bar that formulaic prose does not | 15.7s |
| a fixed threshold cannot separate copying from formulaic prose | 14.7s |

The same computation timed over slices of the corpus:

| games | passages | `baseline()` | pair sweep | total | vs 18 games |
| --- | --- | --- | --- | --- | --- |
| 18 | 54 | 1.0s | 1.0s | 2.0s | 1× |
| 36 | 108 | 3.9s | 3.8s | 7.7s | 3.9× |
| 54 | 162 | 8.5s | 8.8s | 17.3s | 8.6× |
| 72 | 216 | 15.4s | 15.3s | 30.7s | **15.4×** |

Four times the games, fifteen times the work — n² to two decimal places, and
`baseline()` is half of it. Extrapolating the fit for the three-test group:

```
100 games   ~2 min
150 games   ~4.5 min
300 games   ~18 min
500 games   ~49 min
```

`npm run check` is the whole bar, paid by every change and every CI run, so this
is the one cost that compounds against exactly the activity being planned.

**The shape of the fix.** The sweep in `originality.test.ts` already samples —
`for (let k = 1; k < passages.length; k += 7)` — but the sample is a *fraction*
of the corpus, so it grows with it. The test measures a **rate** (what share of
pairs clear their own bar, asserted between 0.1% and 6%), and a rate needs a
representative sample, not every pair. Fixing the sample at a few thousand pairs
holds the property and makes the cost flat. `baseline()` needs reading; it was
not examined closely and may be the same shape or may not.

**The care this needs.** These tests encode the lesson in `CLAUDE.md` — a
similarity threshold that looked principled produced 8,044 false positives, and
card-game procedure is formulaic enough that two entries reading alike proves
nothing. Any sampling change has to be shown not to weaken what they catch:
sample, then demonstrate the verbatim-copy case still trips and the formulaic
case still does not.

## 2. Two payload thresholds, measured but undecided

**Done.** Both now have a budget, reported on every build and asserted in the
suite, and [0021](../decisions/0021-two-payload-budgets-and-what-happens-at-them.md)
records what happens when each is reached. The measurements below are kept as
they were taken — they are the before half — with one correction that changed
the conclusion: **these are uncompressed figures.** Pages serves the site
gzipped, so a first install downloads 574 KB rather than 1.8 MB, and 300 games
is 2.0 MB over the wire rather than 7.5.

The sheet's real cost turned out to be the device rather than the wire (8.2s to
load 288 articles with the CPU throttled 4×, fixed with one CSS rule), and the
install had a problem nobody had looked for: `addAll` is atomic, so at 300
entries on a link dropping 0.5% of requests it succeeded once in eight attempts.
Both are in 0021.

| | at 72 games | per game | at 300 games |
| --- | --- | --- | --- |
| precache (first install) | 1.8 MB | 25 KB | **7.5 MB** |
| `search-index.json` | 216 KB | 3 KB | 900 KB |
| `print.html` (one page) | 1.2 MB | 17 KB | **5 MB** |
| booklet PDF | 1.1 MB | — | — |

Neither is a bug. [0006](../decisions/0006-cache-first-with-an-update-notice.md)
chose to precache everything and that is right at 72 games. But there is an N
where it stops being right, and it is better found deliberately than discovered
as "installing takes forever now". `print.html` is already the one page left out
of the precache; at 5 MB it becomes the page nobody can open on a phone.

Measured and worth knowing: precache size drives **first install** (382ms for 84
assets against 95ms for 4) but **not** the update-notice latency (2199ms against
1927ms). The notice does not get slower as the corpus grows.

## 3. Half-filled optional fields

**Done**, and it was not what this section thought it was.
[The checked envelope](2026-08-05-the-checked-envelope-design.md) has the
measurement: `deal` and `figure_refs` are conditional by schema, so low counts
are those rules working rather than a backlog. The real gap was that `background`
is prose that had never been compared against a source at all. It is inside
`PROSE_FIELDS` now, the four entries carrying one were re-read and re-stamped,
and `npm run validate` reports every optional field's coverage off the schema.

The original text follows.

`background` on 4/72, `deal` on 8/72, `figure_refs` on 3/72. Each is a deferred
decision, and every game added while it stays deferred is one more entry to
backfill if the answer turns out to be "fill it". `npm run validate` reports
originality coverage but says nothing about field coverage — the same "silence is
not coverage" rule, not yet pointed at the schema.

## 4. Alias collisions are not checked

**Done.** Measured: 292 names and aliases, 291 distinct, one collision — `Slam`,
on Speed and Spit, and both games really are called it.
[0022](../decisions/0022-two-games-may-answer-to-one-name.md) keeps them both,
on the grounds that whichever gave the name up would become unfindable by a name
people use. `npm run validate` now reports the collisions and says so when there
are none, and the two things that decision rests on — that a search for a shared
name returns every claimant with a reason, and that their cards are not
identical — are asserted against the real index.

The original text follows.

`slam` is an alias on both `speed` and `spit`, and the corpus validates clean.
There is a duplicate-**name** check (`checks.test.ts`, "duplicate name, also used
by a.json"); aliases are not covered by it. 291 distinct names and aliases across
72 games, and collisions grow faster than the corpus does. Whether a shared alias
is a defect or legitimate is the first question — two games can honestly share
one — but it should be a decision rather than a silence.

## Carried, not scaling

- **The preview comment step has never executed.** It is on main now, so the next
  pull request is its first real run. A `workflow_run` workflow only ever runs
  the default branch's copy, which is why it could not be exercised before merge.
- **The worker's `self.registration.scope` is verified in Chromium only.** If it
  were ever unavailable the worker would throw at evaluation and fail to install,
  taking offline support with it. Universally supported, and the one line in
  [0019](../decisions/0019-the-worker-declines-the-preview-subtree.md) whose
  blast radius exceeds what was tested. `self.location` is the guaranteed
  alternative if it ever matters.
- **[The requires-axis](2026-08-04-what-a-game-requires.md)** is measured with
  nothing built on it, waiting on which table "requires" means.

## Verified working, so do not go looking

The update notice reaches the reader on both paths — a tab left open, and a
navigation after a deploy. `npm run update-notice` is the committed check;
`npm install --no-save playwright` first. It was reddened by three breakages
(the banner never unhiding, the Reload button unbound, `skipWaiting` removed).

Worth repeating because it nearly went the other way: the first version of that
harness **slept 2500ms**, the controller change landed at **2594ms**, and it
reported the update notice as broken. It was not. Every wait in the committed
version waits on a condition with a timeout that fails loudly. A sleep that
passes is a guess.
