/*
 * Search and filtering for the index page.
 *
 * Two things happen here. The facet chips filter on numbers embedded in the
 * page, which needs nothing loaded. The search box runs a full-text query over
 * every word of every entry, using an index fetched once and then cached by the
 * service worker like everything else — so it keeps working with no signal.
 *
 * Sixty documents is small enough that ranking is a loop over an object. There
 * is no server, no query API and nothing to debounce.
 */

(function () {
  const list = document.getElementById("games");
  if (!list) return;

  const facets = JSON.parse(document.getElementById("facets").textContent);
  const items = Array.from(list.children);
  const count = document.getElementById("count");
  const empty = document.getElementById("empty");
  const box = document.getElementById("q");

  const state = { q: "", players: "", decks: "", minutes: "", difficulty: "" };
  const RANK = { simple: 0, easy: 1, medium: 2, complex: 3 };

  let index = null;
  let loading = null;

  /** Fetched on first use so a visitor who only browses never pays for it. */
  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch("search-index.json")
        .then((r) => r.json())
        .then((data) => {
          index = data;
          return data;
        })
        .catch(() => {
          // Offline before the index was ever cached: fall back to matching
          // names and tags, which are already in the page.
          index = { fields: [], terms: null };
          return index;
        });
    }
    return loading;
  }

  function tokenise(text) {
    return (text.toLowerCase().match(/[a-z][a-z'-]{1,}/g) || []).map((w) =>
      w.replace(/^-+|-+$/g, ""),
    );
  }

  /**
   * Score every document against the query.
   *
   * The final word is matched as a prefix, so results narrow while you are
   * still typing it. Earlier words must match in full — once you have finished
   * a word, meaning it loosely is not helpful.
   */
  function score(query) {
    const words = tokenise(query);
    if (words.length === 0) return null;
    if (!index || !index.terms) return null;

    const weightOf = {};
    for (const [bit, weight] of index.fields) weightOf[bit] = weight;

    let running = null;

    words.forEach((word, i) => {
      const last = i === words.length - 1;
      const hits = new Map();

      const NAME_BIT = 1;
      const consider = (postings, penalty) => {
        for (let p = 0; p < postings.length; p += 2) {
          const doc = postings[p];
          const mask = postings[p + 1];
          let s = 0;
          for (const bit in weightOf) {
            if (!(mask & bit)) continue;
            // A prefix hit on a game's NAME is a strong signal, not a weak one:
            // typing "canast" means Canasta, even though prose elsewhere may
            // use the finished word more often. Only prose hits are discounted.
            s += weightOf[bit] * (Number(bit) === NAME_BIT ? 1 : penalty);
          }
          const prev = hits.get(doc);
          // penalty is already applied per field above; applying it again here
          // would undo the name exemption.
          const value = { s, m: mask | (prev ? prev.m : 0) };
          if (!prev || value.s > prev.s) hits.set(doc, value);
        }
      };

      if (index.terms[word]) consider(index.terms[word], 1);

      if (last && word.length >= 2) {
        // Prefix matches count for less than an exact one, so "spade" still
        // ranks above "spades-something" for a completed word.
        for (const term in index.terms) {
          if (term !== word && term.startsWith(word)) {
            consider(index.terms[term], 0.6);
          }
        }
      }

      // Every word must hit something: this is an AND, not an OR.
      if (running === null) {
        running = hits;
      } else {
        const merged = new Map();
        for (const [doc, value] of hits) {
          const prev = running.get(doc);
          if (prev) merged.set(doc, { s: prev.s + value.s, m: prev.m | value.m });
        }
        running = merged;
      }
    });

    return running;
  }

  function facetsMatch(game) {
    if (state.players) {
      const n = Number(state.players);
      if (game.lo > n || game.hi < n) return false;
    }
    // A game needing its own pack is unreachable for someone with a 52-card
    // deck, so it must not surface under a deck count.
    if (state.decks && (game.d === 0 || game.d > Number(state.decks))) return false;
    if (state.minutes && (game.max === null || game.max > Number(state.minutes))) return false;
    if (state.difficulty && RANK[game.diff] > RANK[state.difficulty]) return false;
    return true;
  }

  /** Used when the index has not loaded yet, or could not be. */
  function nameMatch(i) {
    for (const word of state.q.split(/\s+/)) {
      if (word && !facets[i].s.includes(word)) return false;
    }
    return true;
  }

  function apply() {
    const hits = state.q ? score(state.q) : null;
    const labelOf = {};
    if (index && index.fields) {
      for (const [bit, , label] of index.fields) labelOf[bit] = label;
    }

    const ranked = [];
    items.forEach((li, i) => {
      if (!facetsMatch(facets[i])) {
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
          const names = [];
          for (const bit in labelOf) if (hit.m & bit) names.push(labelOf[bit]);
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
  }

  box.addEventListener("input", () => {
    state.q = box.value.trim().toLowerCase();
    if (state.q && !index) {
      loadIndex().then(apply);
      apply();
      return;
    }
    apply();
  });

  for (const input of document.querySelectorAll(".chips input")) {
    input.addEventListener("change", () => {
      state[input.name] = input.value;
      apply();
    });
  }

  document.getElementById("reset")?.addEventListener("click", () => {
    box.value = "";
    Object.keys(state).forEach((k) => (state[k] = ""));
    for (const el of document.querySelectorAll('.chips input[value=""]')) {
      el.checked = true;
    }
    apply();
  });

  // Warm the index once the page is idle, so the first search is instant.
  if ("requestIdleCallback" in window) requestIdleCallback(() => loadIndex());
  else setTimeout(loadIndex, 1500);

  apply();
})();
