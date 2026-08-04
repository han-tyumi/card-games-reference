---
name: originality-pass
description: Check game entries' prose against their real sources for wording that follows a source too closely, then rewrite and record what was checked. Use when asked to verify originality, check for copied or paraphrased text, or re-check entries whose prose has changed since they were last stamped.
---

# Running an originality pass

The procedure below is the one that works. It was arrived at by trying the
obvious approaches and measuring them failing — see
[decision 0007](../../../decisions/0007-originality-is-checked-against-sources.md)
for why phrase searching and fixed thresholds are not among them.

## Before anything: prove you can reach the sources

```sh
curl -sS -o /dev/null -w "%{http_code}\n" https://en.wikipedia.org/wiki/Whist
```

A 403 means this environment's egress policy blocks it, and **the pass cannot be
run**. Say so and stop. Do not substitute a judgement pass and let it be mistaken
for a check later — that is the exact failure this project already had.

## 1. Fetch source text

Into `.sources/<game-id>/<source>.txt`, plain text, one request at a time with a
user agent naming the project. Wikipedia's API with `explaintext=1` returns clean
prose and saves unpicking markup. pagat.com's A–Z index maps game names to URLs;
it carries most trick-taking and rummy games and few solitaires.

`.sources/` is gitignored. It holds someone else's copyrighted prose for the
length of the check. Never commit it.

## 2. Run the check

```sh
npm run originality              # everything with sources on disk
npm run originality -- --game durak
```

The bar is computed from the corpus, not chosen: the 99th percentile of the best
coincidental match between two of our own unrelated passages. It is measured
over a bounded sample of those pairs rather than all of them — the run prints how
many — so it is an estimate, and
[0020](../../../decisions/0020-the-bar-is-measured-from-a-bounded-sample.md)
records what that costs.

## 3. Read every finding against its source

The report has two tiers and they mean different things.

- **REUSE** — a long run of identical words. Act on it.
- **READ** / **ORDER** — a reading list. Judge each pair by eye.

Rewrite what shares *structure*: the clause order, the sequence of points. Leave
what shares only *vocabulary* — the poker hand ranks, "two cards face down and
one face up", the Snap shout. Rewording those makes the entry wrong.

Expect false positives. A short generic source sentence contained inside a longer
one of ours scores high and is usually nothing.

## 4. Rewrite, rebuild, re-run

```sh
npm run build && npm run originality
```

Entries often carry more than one finding; the second run surfaces what the first
report's ordering hid.

## 5. Record what was actually read

```sh
npm run originality -- --stamp YYYY-MM-DD durak whist
```

Explicit ids only. Stamp what you read, never what the tool failed to flag —
certifying its blind spot is worse than leaving the entry unstamped, because
thorough paraphrase is exactly what it cannot see.

## Reporting

State the coverage: how many entries had two sources, how many had one, how many
had none. Say what the pass does not establish. It cannot certify an entry clean,
and no run of it may be reported as having done so.
