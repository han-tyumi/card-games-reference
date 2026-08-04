# 0020. Measure the originality bar from a bounded sample of pairs

- **Status:** Accepted
- **Date:** 2026-08-04

## Context

[0007](0007-originality-is-checked-against-sources.md) decided that the bar an
entry has to clear is measured rather than chosen: `baseline()` scores our own
passages against each other and takes the 99th percentile of what that
coincidence produces. That is still right. What it did not settle is how many
pairs go into the measurement, and the answer it shipped with — every passage
against a seventh of the others — is quadratic in the corpus.

Measured at 72 games, on the three tests that use it:

| games | passages | `baseline()` | pair sweep | total | vs 18 games |
| --- | --- | --- | --- | --- | --- |
| 18 | 54 | 1.0s | 1.0s | 2.0s | 1× |
| 36 | 108 | 3.9s | 3.9s | 7.8s | 3.9× |
| 54 | 162 | 9.0s | 8.9s | 17.9s | 9.0× |
| 72 | 216 | 15.2s | 15.2s | 30.4s | **15.2×** |

Four times the games, fifteen times the work. Those three tests were 61 of the
suite's 62 seconds, and `npm run check` is paid by every change and every CI
run, so this was the one cost that compounded against adding games — 4.5 minutes
at 150 games, 18 at 300.

A stride does not fix it. A stride keeps the sample to a *fraction* of the
pairs, and a fraction of a quadratic is still a quadratic.

## Considered options

- **Compare every pair.** Honest and exhaustive. Rejected: it is the quadratic,
  only more so — 46,440 pairs at 72 games where the stride took 6,696.
- **Widen the stride as the corpus grows.** Rejected: it is not a fix but a
  slower version of the same shape, and past a point each passage's partners
  collapse onto its immediate neighbours, which in this corpus are its own
  game's other fields.
- **Lower the percentile, or take a cheaper statistic than a percentile.**
  Rejected: it changes what the bar means. The 99th percentile and the 2.4%
  figure in 0007 are the same measurement, and moving it would silently move
  what the tool flags.
- **Freeze the bar as a committed constant, re-measured by hand.** Rejected: the
  entire content of 0007 is that the bar is derived from the corpus rather than
  guessed. A constant is a guess with a date on it.
- **Drop the corpus-wide tests, keep the fixtures.** Rejected: the fixtures
  cannot show what those tests exist to show. A threshold that looks principled
  against hand-written examples is exactly what produced 8,044 false positives
  against the real corpus.
- **A fixed-size deterministic sample.** Chosen.

## Decision

`samplePairs()` draws at most `PAIR_SAMPLE` ordered pairs however large the
corpus grows, and `baseline()` measures over those. The sample is deterministic
— no clock and no randomness, so the same corpus gives the same bar on every
machine — and it is spread rather than local: each passage's partners are taken
at a wide stride, not from among its neighbours.

`PAIR_SAMPLE` is 5,400, set where the estimate stops moving rather than where it
starts running fast. Four corpus sizes were scored exhaustively and then sampled
at eight phases each, and the sampled bar compared against the exhaustive one:

| games | every pair | sampled, 8 phases | held-out rate |
| --- | --- | --- | --- |
| 18 | 0.800 / 8 | 0.800 / 8 throughout | 1.96% |
| 36 | 0.800 / 8 | 0.800 / 8 throughout | 1.76% |
| 54 | 0.800 / 8 | 0.800 or 0.818, run 7 or 8 | 1.63%–2.88% |
| 72 | 0.800 / 7 | 0.800 throughout, run 7 or 8 | 2.24%–2.89% |

The order bar lands on the exhaustive value in thirty of those thirty-two
size-and-phase combinations and one quantisation step above it in the other two;
the run bar lands within one word throughout. Both components agree exactly in
twenty-seven of the thirty-two — which is why the tests below assert a rate and
not a bar.

At 3,600 pairs none of it holds: 36 games gave bars from 0.71 to 0.83 and rates
from 0.6% to 5.8%, the top of which is close enough to the 6% asserted below to
fail on a corpus nobody had touched.

The tests that consume the bar assert a *rate* on a held-out phase — pairs the
bar was not measured from — rather than asserting the bar's value, because the
value is a sample estimate and the property being defended is that our own
entries mostly do not clear their own bar.

## Consequences

The three tests go from 61 seconds to 8, and `npm test` from 61 to 19. Timed
over the same slices as the table above, with the same method:

| games | `baseline()` | pair sweep | fixed-threshold sweep |
| --- | --- | --- | --- |
| 18 | 1.0s → 1.9s | 1.0s → 1.4s | 0.8s → 0.6s |
| 36 | 3.9s → 3.5s | 3.9s → 2.5s | 3.4s → 1.3s |
| 54 | 9.0s → 3.5s | 8.9s → 2.6s | 7.9s → 1.2s |
| 72 | 15.2s → 3.5s | 15.2s → 3.0s | 14.3s → 1.2s |

Flat is the point, not the multiple. Four times the games — 18 to 72 — was 15.2×
the work and is now 2.0×. Between 36 and 72 games, where the sample has stopped
being the whole corpus at both ends, doubling the corpus was 3.9× and is now
1.08×. At 18 games it is *slower*, because 54 passages have only 2,862 pairs
between them and the sample takes all of them; a corpus that small was never the
problem. At 300 games the group stays where it is instead of reaching 18 minutes.

The bar is now an estimate and is admitted to be one. `npm run originality`
prints the number of pairs it was measured over, so no reader takes it for an
exhaustive answer. A larger sample is a parameter away for anyone who wants one.

The cost is flat only to about 1,800 games — the point at which the corpus has
more passages than the sample has pairs. Past that, the floor of one partner per
passage takes over and the sample grows linearly, deliberately: a bar measured
over a corpus most of which was never looked at would be worse than a slow one.

Sampling error is real and quantised: passage scores near the 99th percentile
are small ratios like 5/7, 7/9 and 4/5, so a sample that misses a few of the top
pairs does not land slightly low, it lands a whole step low. That is why the
sample is set at the knee and not below it, and why the tests assert a range
rather than a number.

None of this changed what the detector finds. `compare()` was made faster at the
same time — 2.3ms per passage pair to 0.9ms on the tool's own path, and to 0.65ms
on the one `baseline()` uses — by skipping the two quadratic scans for sentence
pairs whose shared words already prove they cannot win, and by tokenising each
passage once instead of once per pair. Both skips are exact rather than
approximate, and the evidence is that they are: every match the detector makes
over the corpus, 108,438 of them, is identical to twelve decimal places at seven
threshold shapes under both weighers, against a control that reports 997
differences when the thresholds are deliberately mismatched.
