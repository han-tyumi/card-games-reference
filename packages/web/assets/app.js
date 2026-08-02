/*
 * Search and filtering for the index page.
 *
 * Two things happen here. The facet chips filter on numbers embedded in the
 * page, which needs nothing loaded. The search box runs a full-text query over
 * every word of every entry, using an index fetched once and then cached by the
 * service worker like everything else — so it keeps working with no signal.
 *
 * The ranking itself lives in search.js, shared with the build that writes the
 * index. What is left here is the part that touches the page.
 */

import { matches, readQuery, writeQuery } from "./facets.js";
import { labelsFor, score } from "./search.js";

const list = document.getElementById("games");
if (list) {
  const facets = JSON.parse(document.getElementById("facets").textContent);
  const items = Array.from(list.children);
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");
  const box = document.getElementById("q");

  const state = { q: "", category: "", players: "", decks: "", minutes: "", difficulty: "" };

  const chips = Array.from(document.querySelectorAll(".chips input"));

  /** What each chip group actually offers, so a stale URL cannot filter to nothing. */
  const allowed = {};
  for (const input of chips) {
    (allowed[input.name] ??= new Set()).add(input.value);
  }

  /** Keep the address bar in step, so a filtered view can be copied and shared. */
  const syncUrl = () => {
    history.replaceState(null, "", writeQuery(state) || location.pathname);
  };

  let index = null;
  let loading = null;

  /** Fetched on first use so a visitor who only browses never pays for it. */
  const loadIndex = () => {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch("search-index.json")
        .then((r) => r.json())
        .then((data) => (index = data))
        .catch(() => {
          // Offline before the index was ever cached: fall back to matching
          // names and tags, which are already in the page.
          index = { fields: [], terms: null };
          return index;
        });
    }
    return loading;
  };

  /** Used when the index has not loaded yet, or could not be. */
  const nameMatch = (i) => {
    for (const word of state.q.split(/\s+/)) {
      if (word && !facets[i].s.includes(word)) return false;
    }
    return true;
  };

  const apply = () => {
    const hits = state.q ? score(index, state.q) : null;
    const fields = index?.fields ?? [];

    const ranked = [];
    items.forEach((li, i) => {
      if (!matches(facets[i], state)) {
        li.hidden = true;
        return;
      }
      if (!state.q) {
        li.hidden = false;
        li.querySelector(".where")?.replaceChildren();
        ranked.push([i, 0]);
        return;
      }
      const hit = hits ? hits.get(i) : nameMatch(i) ? { s: 1, m: 0 } : null;
      li.hidden = !hit;
      if (hit) {
        ranked.push([i, hit.s]);
        // Say where the words were found; "in play" is the difference between
        // a game called Slapjack and a game you slap in.
        const where = li.querySelector(".where");
        if (where) {
          const names = labelsFor(fields, hit.m);
          where.textContent = names.length ? `found in ${names.join(", ")}` : "";
        }
      }
    });

    if (state.q && hits) {
      // Reordering the DOM directly keeps the markup as the single source of
      // truth: no shadow list, nothing to fall out of sync.
      ranked.sort((a, b) => b[1] - a[1]);
      for (const [i] of ranked) list.appendChild(items[i]);
    } else if (!state.q) {
      for (const li of items) list.appendChild(li);
    }

    const shown = ranked.length;
    count.textContent =
      shown === items.length ? `${shown} games` : `${shown} of ${items.length} games`;
    empty.hidden = shown > 0;
  };

  box.addEventListener("input", () => {
    state.q = box.value.trim().toLowerCase();
    syncUrl();
    if (state.q && !index) {
      loadIndex().then(apply);
      apply();
      return;
    }
    apply();
  });

  for (const input of chips) {
    input.addEventListener("change", () => {
      state[input.name] = input.value;
      syncUrl();
      apply();
    });
  }

  document.getElementById("reset")?.addEventListener("click", () => {
    box.value = "";
    Object.keys(state).forEach((k) => (state[k] = ""));
    for (const el of document.querySelectorAll('.chips input[value=""]')) {
      el.checked = true;
    }
    syncUrl();
    apply();
  });

  // Warm the index once the page is idle, so the first search is instant.
  if ("requestIdleCallback" in window) requestIdleCallback(() => loadIndex());
  else setTimeout(loadIndex, 1500);

  // A link may arrive already filtered. Restore it into the controls before the
  // first render so the page never flashes the full list, and never leaves a
  // chip looking unset while it is doing the filtering.
  Object.assign(state, readQuery(location.search, allowed));
  if (state.q) box.value = state.q;
  for (const input of chips) {
    if (state[input.name] !== undefined) input.checked = input.value === state[input.name];
  }
  if (state.q) loadIndex().then(apply);

  apply();
}
