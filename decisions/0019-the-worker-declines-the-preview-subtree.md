# 0019. The site's service worker declines the preview subtree

- **Status:** Accepted
- **Date:** 2026-08-04

## Context

[0018](0018-branch-previews-at-a-subpath.md) put branch previews at
`/naibi/preview/<branch>/` on the same Pages deployment as the site, and made a
preview ship no service worker of its own. The reason was measured and correct:
the worker's `activate` deletes every cache that is not its own and the Cache API
is scoped to an **origin**, so a preview that registered a worker would delete
the installed app's offline copy.

That reasoning covers one direction. The other is that
[0006](0006-cache-first-with-an-update-notice.md)'s worker is registered from the
site root, so its scope **contains** the preview path — and it is cache-first
with a permanent `put`. A preview shipping no worker does not mean a preview is
served without one.

It was reported as "the preview doesn't seem to update". Reproduced in Chromium
against the real `docs/sw.js`, with a no-worker control proving the harness could
see a change at all:

```
worker registration scope           http://host/naibi/
cache after visiting a preview      6 preview URLs written into naibi-1dhgeme

server serving version A            browser shows A
server swapped to version B         server confirms B      browser still shows A
control, no worker, same swap       A  ->  B
```

Three consequences, all measured:

1. **A republished preview is invisible.** The first build a browser loads is the
   one it keeps. A reviewer sees a stale page and has no signal that they do —
   a preview carries no update notice, because it carries no worker to raise one.
2. **Offline, a preview URL returned the published site.** The fetch handler's
   network fallback is `caches.match("./index.html")`, resolved relative to the
   worker at the site root. A never-visited preview page came back **HTTP 200
   with production's index.html** while the address bar still read `/preview/`.
   (`setOffline(true)` alone does not show this — it cuts the page's network and
   not the worker's, and the first pass wrongly reported no defect until the
   server was killed outright.)
3. **A deleted preview went on being served.** After `preview-cleanup.yml`
   removed the slot and the origin returned 404 — confirmed by a control profile
   that received the 404 — a profile that had opened it was still served the
   preview at 200.

Hard-reloading shows the new bytes for that one load and does **not** repair the
entry: the next ordinary navigation is stale again. The only thing that cleared
it was an unrelated production deploy, whose new `CACHE` constant makes `activate`
drop the old cache wholesale.

## Considered options

- **Decline the preview subtree in the fetch handler.** One early `return`, keyed
  off the worker's own scope. The network answers, which is what a preview needs;
  nothing preview-shaped enters the installed app's cache; the offline fallback
  is never reached for a preview URL. Costs one line and a test that has to run
  the worker rather than read it.
- **Move previews to a second origin.** A separate Pages site or a preview host
  puts them outside the scope entirely and outside the shared cache storage.
  Rejected because it gives up what 0018 chose the subpath for — one deployment,
  one gate, no second place a red commit could reach readers — and adds an origin
  to maintain for the sake of a review link.
- **Narrow the worker's scope so it does not contain the previews.** Rejected:
  it needs the site's own pages to move under something like `/naibi/app/`,
  changing every published URL, to solve a problem that has nothing to do with
  where the site lives.
- **Leave it and tell reviewers to hard-reload.** Rejected on the measurement —
  a hard reload is a one-load bypass that leaves the stale entry in place, so the
  advice does not even work. It also leaves 2 and 3 above untouched, and 2 is
  this project's own recurring failure in its worst costume: a page saying yes
  when the answer is no, to a reader who believes they are looking at the branch.
- **Make the worker network-first, or give entries a max-age.** Rejected: it
  fixes previews by giving up 0006, whose whole point is that the reference
  answers instantly beside a card table with no signal. A general change to serve
  a case that is not the site.

## Decision

The generated worker computes `PREVIEWS` from `self.registration.scope` and
returns early for any request under it, alongside the existing early returns for
non-GET and cross-origin requests.

Deriving the path from the scope rather than hardcoding `/naibi/preview/` is not
tidiness: the site is served from the root by every local server this project
uses, and a hardcoded prefix passes every test written at the Pages path while
being wrong everywhere else.

The claim is tested by **running** the generated worker — a fake worker global,
a dispatched fetch event, and an assertion about whether it answered — rather
than by matching its source. The test that stood closest before checked that the
*preview build* contains no worker: true, and about the artifact rather than the
URL, which is exactly the substitution this record exists to record.

## Consequences

Previews are always served from the network, subject only to the origin's
`max-age=600`. That is the right freshness for a page whose reason to exist is
being looked at before a merge, and it costs a preview any offline behaviour —
which is what the preview banner has always claimed, and is now true.

**Two sentences that were false became true rather than being reworded.** The
preview banner's "does not work offline", and `preview-cleanup.yml`'s "it stops
being served at the next deploy". Both are now held by tests that name the
worker, so they cannot drift apart again silently.

The stale entries already in readers' caches are cleared by the deploy that
carries this, because a changed worker means a changed `CACHE` and `activate`
drops everything else. Nobody has to be told to do anything.

`print.html` is still left out of the precache and is still the one page that
needs a connection **the first time**. The runtime `put` means it works offline
after one visit; the comment claiming otherwise was corrected in passing, from
the same measurement.

The install-time precache is untouched, so the site's own offline behaviour is
unchanged — verified in the same harness: the cache holds its 84 entries and
zero preview entries, where it previously accumulated one per preview URL opened.
