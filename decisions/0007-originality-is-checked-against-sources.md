# 0007. Check originality against source text, never by searching phrases

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

The project writes its own prose and needs to be able to show that. The obvious
method — search a distinctive phrase, see whether a source comes back — was used
for the first several passes over this corpus.

It does not work. A control query for a phrase containing invented words
(`"one zorbulax at a time to each quibblemonger"`), which cannot exist anywhere,
returned ten results. Quoting is not honoured, so a hit list is not evidence a
phrase was found and "no results" cannot be observed at all. Every pass that
counted search hits was measuring nothing.

A fixed similarity threshold does not work either. Measured against our own
sixty entries, which copy nothing from each other, 35% shared structure produced
5401 matches, 60% produced 1122, and six identical consecutive words produced
834 — all boilerplate, because "deal seven cards to each player, one at a time"
has no other phrasing. Rarity weighting made the discrimination worse, not
better: a sentence rebuilt from a source's clause order scored 0.15 against an
independent rewrite's 0.12.

## Considered options

- **Search for distinctive phrases** — used for the first several passes.
  Rejected once measured: quoting is not honoured, so it detects nothing.
- **A fixed similarity threshold** — rejected once measured: no threshold
  separates copying from formulaic procedure, and rarity weighting made the
  discrimination worse.
- **A plagiarism-detection service** — rejected: it would mean sending the corpus
  to a third party, and the failure mode here is structural rather than verbatim,
  which is not what those tools are tuned for.
- **Compare against fetched source text, with a bar measured from the corpus** —
  chosen.

## Decision

Fetch the source text, put it in `.sources/` (gitignored — it is someone else's
prose), and compare against it directly. Derive the bar from the corpus instead
of choosing it: `baseline()` takes the 99th percentile of the best coincidental
match between two of our own unrelated passages, which our entries clear 2.4% of
the time.

Report in tiers and label them. A long run of identical words is a finding. A
similarity score is a reading list. Record a check per entry as a date plus a
fingerprint of the prose that was read, so editing an entry afterwards reports
itself instead of leaving the date claiming cover it has lost.

## Consequences

The first pass done this way flagged 39 of 60 entries and rewrote 26 passages
across 19. Pinochle carried eighteen consecutive words identical to pagat's.

What it still cannot do: paraphrase that swaps the vocabulary scores like
independent writing, so no run of this tool can certify an entry clean. Eight
verbatim runs were kept deliberately because they are the vocabulary of the games
— the poker hand ranks in order, "right bower (the jack of the trump suit)",
Skat's German multiplier list. The check needs network access to sources, which
not every environment allows.
