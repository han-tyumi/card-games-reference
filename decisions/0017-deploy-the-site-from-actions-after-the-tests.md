# 0017. Deploy the site from Actions, after the tests rather than beside them

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Pages built the site from the `docs/` directory on the default branch. That is
the zero-configuration option and it worked, but it deploys on the push rather
than on the tests, so the site went out in parallel with `Validate` rather than
after it. Measured on one commit, the deploy started a full second *before* the
tests did:

```
pages build and deployment   started 19:49:50Z
Validate                     started 19:49:51Z
```

A red commit could reach readers, and CLAUDE.md had recorded that as a known
hazard rather than fixed it — the file said in as many words that "Pages deploys
do not gate on tests, so a red build can ship". A hazard written down and left
alone is still a hazard.

## Considered options

- **Leave it.** The site is regenerated from `docs/`, which is committed and
  gated, so a red commit usually means a *stale* site rather than a broken one.
  Rejected because "usually" is doing real work in that sentence: the gate
  catches staleness, and the tests catch everything else.
- **Branch protection and pull requests.** Main only advances through a green
  check, which fixes this and more. Rejected as the wrong tool for the problem
  and the wrong shape for a single maintainer working from a phone: it puts a
  pull request between the author and every typo fix.
- **Deploy from a workflow, triggered on `Validate` succeeding.** Chosen.
  Nothing changes about how anyone works, and the site only ever publishes a
  commit that passed.

## Decision

Pages takes its source from GitHub Actions. `.github/workflows/deploy.yml`
triggers on `workflow_run` for `Validate`, refuses to run unless the conclusion
was `success`, checks out **the commit that passed** rather than whatever main
has drifted to, and uploads `docs/` as it stands.

Nothing is built in that job. `docs/` is committed and its freshness is already
gated by `npm run web -- --check`, per
[0004](0004-generated-output-is-committed-and-gated.md), so rebuilding it at
deploy time would be a second opinion nobody asked for and a way for the
published site to differ from the reviewed one.

The same trigger now guards releases
([0016](0016-releases-cut-themselves-from-commit-subjects.md)), so both things
that reach the outside world wait on the same gate, and a test asserts that both
still do.

## Consequences

A red commit ships nothing, and CLAUDE.md's hazard note is retired rather than
carried. Deploys are also reproducible from a workflow file in the repository
instead of from a setting in a web UI that nothing in the repository records.

The costs: a deploy is now one hop slower, since it waits for the whole gate
rather than racing it. `workflow_run` is a fussier trigger than a push — it fires
only for workflows on the default branch, and a mistake in it fails by the site
quietly not updating rather than by anything going red. And the Pages source is
a repository setting, so this record and that setting can disagree with nobody
noticing until a deploy goes missing.
