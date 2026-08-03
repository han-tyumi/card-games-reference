# Working on Naibi

Rules for the rules. This file loads into every session; keep it short enough
that it stays read.

Orientation is in [`README.md`](README.md), how to change things in
[`CONTRIBUTING.md`](CONTRIBUTING.md), and why things are the way they are in
[`decisions/`](decisions/README.md). Do not restate any of them here.

## The gate

`npm run check` — validation, `rendered/`, `docs/` and booklet freshness,
typecheck, tests. It is the whole bar. Node 22.18+ runs the TypeScript directly; there is
no build step and nothing to compile.

## Six disciplines, each of which this project learned the hard way

**Measure before you assert.** Every structural opinion offered here without
numbers has been wrong. A similarity threshold that looked principled produced
8,044 false positives against our own entries. A documentation split that read
fine had buried two sections under an unrelated heading. Both were found by
counting, neither by thinking harder.

**Run a control before trusting a tool.** Search for a phrase containing
invented words. If results come back, the tool is not doing what you think and
its output is not evidence. This is not hypothetical: a verification pass once
reported 22 of 30 entries checked while its network was down, and the phrase
searching that "cleared" earlier passes never worked at all.

**Silence is not coverage.** Any report that can come back empty must say what
it did not look at. `npm run validate` names how many entries have no originality
check; `npm run originality` names the entries it had no source for. A quiet run
that could mean "clean" or "never ran" must say which.

**Generated output gets a `--check`; a claim gets a test.** `rendered/` and
`docs/` rebuild and diff. When a document asserts something — that the counts
match the corpus, that nothing is stated twice, that the About page does not
overclaim — write the test. Prose that claims a property will drift away from it.

**Verify in the environment CI has.** A green local check that depends on
something hand-installed is not green. This broke CI once already: a script
imported an optional package, the typecheck passed locally because it had been
copied into `node_modules` by hand, and every other environment failed.

**Watch CI land before calling a push done.** Same incident. The site and the
releases both wait on Validate now, so a red commit ships nothing — but a green
push is still not a finished one until you have looked.

## Things that will bite

- `docs/` is the generated site and is **deleted and rewritten** by `npm run web`.
  Never hand-edit it, and never put source material there — which is why decision
  records live in `decisions/` rather than under docs/ where the ADR convention
  would put them.
- `.sources/` holds other people's copyrighted prose for the length of a check.
  It is gitignored and must stay that way.
- `packages/data` is the only source of truth. Anything two generators both need
  goes in a shared module rather than being written twice.
- Card game procedure is formulaic. "Deal seven cards to each player, one at a
  time" has no other phrasing, so two entries reading alike proves nothing — do
  not hand-tune a similarity threshold against it.
- Editing an entry's prose invalidates its `checked` record and the validator
  will say so. Re-read it against its sources and re-stamp, or drop the record.
  Do not leave a date claiming cover it has lost.
- A figure's `kind` decides geometry, not just description. A `ranking` may be
  wrapped onto more lines; a `meld` is never split, because half a straight
  flush is not one. Mis-tag it and the drawing is quietly wrong — both tags
  validate and both render.
- Terms of art are not paraphrasable. The poker hand ranks, "right bower (the
  jack of the trump suit)", Skat's multiplier list — rewording those makes the
  entry wrong. Shared *structure* is the problem, not shared vocabulary.

## Reporting

Say what was checked, what was not, and what a result does not establish. The
originality tool cannot certify an entry clean — thorough paraphrase scores like
independent writing — so no run of it may be reported as one.
