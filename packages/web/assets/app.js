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

import { plan, readQuery, writeQuery } from "./facets.js";
import { labelsFor, score } from "./search.js";

// Either the page has the whole apparatus or it has none of it: an entry page
// carries no list, no box and no chips. Taken together rather than one at a
// time, so a missing piece is a missing page rather than a null halfway down.
const list = document.getElementById("games");
const data = document.getElementById("facets");
const count = document.getElementById("count");
const empty = document.getElementById("empty");
const box = /** @type {HTMLInputElement | null} */ (document.getElementById("q"));
// Optional: the index is the only page that has one, and it is not worth
// failing the whole page over.
const printlink = /** @type {HTMLAnchorElement | null} */ (document.getElementById("printlink"));

if (list && data && count && empty && box) {
  /** @type {import("./facets.js").Facet[]} */
  const facets = JSON.parse(data.textContent ?? "[]");
  const items = /** @type {HTMLElement[]} */ (Array.from(list.children));

  /** @type {Record<string, string>} */
  const state = { q: "", category: "", players: "", decks: "", minutes: "", difficulty: "" };

  const chips = Array.from(
    /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(".chips input")),
  );

  /**
   * What each chip group actually offers, so a stale URL cannot filter to nothing.
   * @type {Record<string, Set<string>>}
   */
  const allowed = {};
  for (const input of chips) {
    (allowed[input.name] ??= new Set()).add(input.value);
  }

  /** Keep the address bar in step, so a filtered view can be copied and shared. */
  const syncUrl = () => {
    history.replaceState(null, "", writeQuery(state) || location.pathname);
  };

  /** @type {import("./search.js").Index | null} */
  let index = null;
  /** @type {Promise<import("./search.js").Index> | null} */
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
          index = { fields: [], common: [], exact: {}, terms: null };
          return index;
        });
    }
    return loading;
  };

  const apply = () => {
    const hits = state.q ? score(index, state.q) : null;
    const fields = index?.fields ?? [];

    // Every decision about what shows and in what order is made in facets.js,
    // which is tested. What is left here is moving DOM nodes about.
    const { order, count: label } = plan(facets, state, hits);
    const showing = new Set(order);

    items.forEach((li, i) => {
      li.hidden = !showing.has(i);
      const where = li.querySelector(".where");
      if (!where) return;
      const hit = hits ? hits.get(i) : null;
      if (!showing.has(i) || !state.q || !hit) {
        where.replaceChildren();
        return;
      }
      // Say where the words were found; "in play" is the difference between
      // a game called Slapjack and a game you slap in.
      const names = labelsFor(fields, hit.m);
      where.textContent = names.length ? `found in ${names.join(", ")}` : "";
    });

    // Reordering the DOM directly keeps the markup as the single source of
    // truth: no shadow list, nothing to fall out of sync.
    // `order` indexes the same list the page rendered, so every index is real.
    for (const i of order) list.appendChild(/** @type {HTMLElement} */ (items[i]));

    count.textContent = label;
    empty.hidden = order.length > 0;

    // The print sheet takes the same query, so what comes out of the printer is
    // what is on the screen. Its label says how many, because "Print these"
    // beside a list of sixteen should not need counting.
    if (printlink) {
      printlink.hidden = order.length === 0;
      printlink.href = `print.html${writeQuery(state)}`;
      printlink.textContent =
        order.length === facets.length
          ? `Print all ${order.length}`
          : `Print these ${order.length}`;
    }
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
    const unset = /** @type {NodeListOf<HTMLInputElement>} */ (
      document.querySelectorAll('.chips input[value=""]')
    );
    for (const el of unset) el.checked = true;
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
