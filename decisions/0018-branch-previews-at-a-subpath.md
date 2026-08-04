# 0018. Branch previews at a Pages subpath, from a composed `site` branch

- **Status:** Accepted
- **Date:** 2026-08-04

## Context

Reviewing a change to the index page meant reading a diff. The filters are the
one part of this project where a passing test proves least: a chip row that
filters correctly can still be unusable, and the only way to know is to hold it.
Phase 2 of the filters work made that concrete — twelve tasks, all green, and no
way for anyone to touch the thing before merging it.

GitHub serves one Pages deployment per repository, so "production and previews"
means one artifact containing both.

[0006](0006-cache-first-with-an-update-notice.md) is why that is not merely a
plumbing question. The site installs and works offline through a service worker
whose `activate` step deletes every cache that is not its own. The Cache API is
scoped to an **origin**, not a path. A preview at `/naibi/preview/x/` therefore
registers its own worker and deletes the cache belonging to `/naibi/` — the
installed app's offline copy, gone because someone opened a preview link on
their phone. Measured in a shared browser profile before any of this was built:

```
1. visit production   caches: ["naibi-1p2ca0t"]
2. visit preview      caches: ["naibi-842q65"]     <- production's is gone
```

The other constraint is [0017](0017-deploy-the-site-from-actions-after-the-tests.md), the
incident `deploy.yml` was written for. Pages used to
build from the branch, so it deployed in parallel with Validate; on one commit
the deploy started a second before the tests did, and a red commit reached
readers. Anything that lets more commits deploy has to keep that shut.

## Considered options

- **A `site` branch composed by the deploy workflow.** One artifact holding the
  published site at the root and each branch under `preview/`. Pages stays on
  "GitHub Actions" as its source, so no repository setting changes and the
  workflow remains the only thing that can publish. Costs a rewrite of
  `deploy.yml` and makes every green branch trigger a deployment.
- **Pages serving a `gh-pages` branch directly.** Simpler to write, and exactly
  what [0017](0017-deploy-the-site-from-actions-after-the-tests.md) moved away
  from: publishing becomes a push rather than a gated step, which is how a red
  commit reached readers the first time. Rejected on that history alone.
- **A second repository with its own Pages site.** Leaves production's deploy
  path untouched, so the blast radius on the live site is zero. Costs a repo and
  a personal access token held as a secret, and splits one project's publishing
  across two places for the benefit of a preview.
- **Workflow artifacts.** A zip on the run page, no new infrastructure and no
  risk at all. Rejected because it is a laptop workflow: download, unzip, open.
  The review that prompted this was going to happen on a phone.
- **Doing nothing.** A single self-contained HTML file, built from `docs/` and
  published by hand when asked. It works, and it is what was used while this was
  being decided, but it is a snapshot rather than the site: no print sheet, no
  game pages, and nothing keeps it current.

## Decision

**A `site` branch holds exactly what is live**, composed by the deploy workflow:

```
/                    the published site, from main
/preview/<branch>/   a branch build
```

On Validate succeeding, main replaces the root and leaves `preview/` alone; any
other branch of this repository replaces only its own slot. The whole branch is
then uploaded and deployed. Pages stays on "GitHub Actions" as its source, so no
repository setting changes and the workflow remains the only thing that can
publish.

**Production still ships the committed `docs/`**, copied rather than rebuilt.
`docs/` is gated against the corpus by [0004](0004-generated-output-is-committed-and-gated.md);
a rebuild during the deploy would be a second opinion about what the corpus
renders to, and only one of the two is checked.

**Previews are built with `--preview`**, which drops the service worker, the
manifest, the sitemap and robots.txt, and marks every page `noindex`. Their
canonical URLs still point at production, because a preview is a copy of a page
that lives there and saying so is what keeps the two out of each other's search
results.

**Previews are deleted when their pull request closes**, merged or not. Each is
a copy of the whole site.

## Consequences

Every branch that goes green now triggers a Pages deployment, where before only
main did. The existing `concurrency: group: pages` serialises them, and a
preview publish rewrites only its own directory, so the failure mode this
invites — a preview taking production down — needs the composition step to be
wrong rather than merely concurrent. That step is simulated in the tests against
its real shell body: main keeps other previews, a branch touches only its slot,
and a republish replaces rather than merges.

The guarantee in `deploy.yml`'s header is unchanged and now says so explicitly:
the `site` branch is written only from a commit whose Validate went green,
whichever branch that commit was on. `nothing reaches readers without passing
first` in `packages/build/test/docs.test.ts` was rewritten to assert that
property against the new shape rather than the old `path: docs` line, and was
confirmed to fail under four separate weakenings of it — a rebuild of
production, a preview built without `--preview`, the wrong directory uploaded,
and the fork check removed.

Previews do not work offline and cannot be installed. That is the point of them
not shipping a worker, and it is worth the trade: an installable preview is also
a way to end up with two identical-looking apps on a home screen, one of which
is a branch.

A branch name is not a path. Slugs keep `[A-Za-z0-9._-]`, turn `/` into `-`, and
must begin with an alphanumeric — so no branch can name its way to `..` and have
`rm -rf preview/..` take the site with it. Git already forbids `..` in a ref;
this does not rely on that.
