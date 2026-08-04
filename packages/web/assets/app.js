/*
 * Search and filtering for the index page.
 *
 * Two things happen here. The facet chips filter on numbers embedded in the
 * page, which needs nothing loaded. The search box runs a full-text query over
 * every word of every entry, using an index fetched once and then cached by the
 * service worker like everything else — so it keeps working with no signal.
 *
 * The ranking itself lives in search.js, shared with the build that writes the
 * index. Every decision about what shows, in what order, what the floor offers
 * and what the empty state says lives in facets.js, which is tested. What is
 * left here is the part that touches the page.
 */

import { emptyReason, floorOptions, plan, readQuery, writeQuery } from "./facets.js";
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
const labels = document.getElementById("labels");
const why = document.getElementById("why");
const floor = /** @type {HTMLDetailsElement | null} */ (document.getElementById("floor"));
const from = /** @type {HTMLSelectElement | null} */ (document.getElementById("from"));

if (list && data && count && empty && box) {
  /** @type {import("./facets.js").Facet[]} */
  const facets = JSON.parse(data.textContent ?? "[]");
  /** @type {Record<string, string>} */
  const families = JSON.parse(labels?.textContent ?? "{}");
  const items = /** @type {HTMLElement[]} */ (Array.from(list.children));

  /** @type {Record<string, string>} */
  const state = {
    q: "",
    category: "",
    players: "",
    from: "",
    decks: "",
    minutes: "",
    difficulty: "",
    prep: "",
  };

  const chips = Array.from(
    /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(".chips input")),
  );

  /**
   * What each control actually offers, so a stale URL cannot filter to nothing.
   * @type {Record<string, Set<string>>}
   */
  const allowed = {};
  for (const input of chips) {
    (allowed[input.name] ??= new Set()).add(input.value);
  }
  // The floor is a <select> rather than a chip, and its options are rewritten
  // on every render — so this reads the full list the build shipped, before
  // anything has pruned it to the chosen count.
  if (from) allowed.from = new Set(Array.from(from.options, (option) => option.value));

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

  /**
   * The floor's options, rebuilt because both the list and the counts on it
   * depend on everything else the reader has set.
   *
   * @param {Map<number, {s: number, m: number}> | null} hits
   */
  const renderFloor = (hits) => {
    if (!floor || !from) return;
    // Meaningless with no count chosen: there is nothing for it to be below.
    floor.hidden = !state.players;
    if (!state.players) return;

    const selected = state.from || state.players;
    from.replaceChildren(
      ...floorOptions(facets, state, hits).map((option) => {
        const el = document.createElement("option");
        el.value = option.value;
        el.textContent = option.label;
        el.selected = option.value === selected;
        return el;
      }),
    );
  };

  const apply = () => {
    const hits = state.q ? score(index, state.q) : null;
    const fields = index?.fields ?? [];

    // Every decision about what shows and in what order is made in facets.js,
    // which is tested. What is left here is moving DOM nodes about.
    const { order, count: label, marks } = plan(facets, state, hits);
    const showing = new Set(order);

    items.forEach((li, i) => {
      li.hidden = !showing.has(i);

      // Says the game seats every count in the range, not just some of them.
      // "These sort first" is otherwise invisible.
      const covers = li.querySelector(".covers");
      if (covers) covers.textContent = showing.has(i) ? (marks.get(i) ?? "") : "";

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
    if (why && order.length === 0) why.textContent = emptyReason(state, families);

    renderFloor(hits);

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
      if (input.type === "checkbox") {
        // A checkbox group is every ticked value, and none ticked means any —
        // which is why these groups have no "Any" chip to represent it.
        state[input.name] = chips
          .filter((chip) => chip.name === input.name && chip.checked)
          .map((chip) => chip.value)
          .join(",");
      } else {
        state[input.name] = input.value;
      }

      // Raising the count leaves a lower floor alone; lowering it past the
      // floor collapses the range rather than inverting it. Normalised here so
      // the URL and the <select> agree with what the filter is doing —
      // playerRange would clamp it anyway, but silently.
      if (input.name === "players") {
        if (!state.players || Number(state.from) >= Number(state.players)) state.from = "";
      }

      syncUrl();
      apply();
    });
  }

  from?.addEventListener("change", () => {
    // Storing the count itself would put a no-op in every shared link.
    state.from = from.value === state.players ? "" : from.value;
    syncUrl();
    apply();
  });

  document.getElementById("reset")?.addEventListener("click", () => {
    box.value = "";
    Object.keys(state).forEach((k) => (state[k] = ""));
    for (const input of chips) {
      input.checked = input.type === "checkbox" ? false : input.value === "";
    }
    if (floor) floor.open = false;
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
    const value = state[input.name] ?? "";
    input.checked =
      input.type === "checkbox" ? value.split(",").includes(input.value) : input.value === value;
  }
  // Open on arrival when the link carries a floor. A filter applied from a
  // panel the reader cannot see is this project's own "says yes when the answer
  // is no" wearing a different hat.
  if (floor && state.from) floor.open = true;
  if (state.q) loadIndex().then(apply);

  apply();
}
