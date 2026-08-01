# 0006. Cache first, and tell the reader when a new version lands

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

This gets read at a table, mid-game, on a phone that may have no signal. Freshness
matters far less than answering instantly and working offline. But cache-first
means an open page never notices a deployment, and browsers only look for a new
service worker on navigation, so a page left open never finds out at all.

## Decision

Precache the entire corpus and serve cache-first. Ask for a worker update when
the tab becomes visible. When a new version takes over, show a notice with a
Reload button — and do not reload automatically.

## Consequences

The reference is fully available with no signal, and a reader is told when it is
out of date rather than left guessing. Reloading on their behalf was rejected
because yanking the page out from under someone looking up a scoring rule is
worse than being one version behind. A first install claims an uncontrolled page
and fires the same event, so prior control is captured before registering or
every new visitor is told to reload the moment they arrive.
