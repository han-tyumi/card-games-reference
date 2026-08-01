/*
 * Filtering for the index page.
 *
 * Every game's facets are embedded in the page, so searching and filtering are
 * pure DOM work with nothing fetched. That is what lets the whole thing work
 * with no signal, and it is fast enough that there is no need to debounce.
 */

(function () {
  const list = document.getElementById("games");
  if (!list) return;

  const data = JSON.parse(document.getElementById("facets").textContent);
  const items = Array.from(list.children);
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");
  const query = document.getElementById("q");

  const state = { q: "", players: "", decks: "", minutes: "", difficulty: "" };
  const RANK = { simple: 0, easy: 1, medium: 2, complex: 3 };

  function matches(game) {
    if (state.q) {
      const hay = game.s;
      for (const word of state.q.split(/\s+/)) {
        if (word && !hay.includes(word)) return false;
      }
    }
    if (state.players) {
      const n = Number(state.players);
      if (game.lo > n || game.hi < n) return false;
    }
    // A game needing its own pack is unreachable for someone with a 52-card
    // deck, so it must not surface under a deck count.
    if (state.decks) {
      if (game.d === 0 || game.d > Number(state.decks)) return false;
    }
    if (state.minutes && (game.max === null || game.max > Number(state.minutes))) return false;
    if (state.difficulty && RANK[game.diff] > RANK[state.difficulty]) return false;
    return true;
  }

  function apply() {
    let shown = 0;
    items.forEach((li, i) => {
      const ok = matches(data[i]);
      li.hidden = !ok;
      if (ok) shown += 1;
    });
    count.textContent =
      shown === data.length
        ? `${shown} games`
        : `${shown} of ${data.length} games`;
    empty.hidden = shown > 0;
  }

  query.addEventListener("input", () => {
    state.q = query.value.trim().toLowerCase();
    apply();
  });

  for (const input of document.querySelectorAll(".chips input")) {
    input.addEventListener("change", () => {
      state[input.name] = input.value;
      apply();
    });
  }

  const reset = document.getElementById("reset");
  if (reset) {
    reset.addEventListener("click", () => {
      query.value = "";
      Object.keys(state).forEach((k) => (state[k] = ""));
      for (const el of document.querySelectorAll('.chips input[value=""]')) {
        el.checked = true;
      }
      apply();
    });
  }

  apply();
})();
