/*
 * The print sheet: every game is in the page, and this hides the ones you did
 * not ask for.
 *
 * The selection has to be *identical* to what the index showed, or someone
 * prints a stack and finds a game missing from it. So the decision is not made
 * again here -- it calls the same plan() the index calls, over the same facets,
 * and the search index only when a text query is in play. Two implementations
 * of "which games match" would disagree eventually, and the symptom would be
 * paper.
 */

import { countLabel, plan, readQuery } from "./facets.js";

/**
 * How a chip's value reads in a sentence, for the line above the games.
 * @type {Record<string, (value: string) => string>}
 */
const PHRASE = {
  players: (/** @type {string} */ v) => `${v} player${v === "1" ? "" : "s"}`,
  decks: (/** @type {string} */ v) => `${v} deck${v === "1" ? "" : "s"}`,
  minutes: (/** @type {string} */ v) => `${v} minutes or less`,
  difficulty: (/** @type {string} */ v) => `${v} or simpler`,
};

const data = document.getElementById("facets");
const labels = document.getElementById("labels");
const what = document.getElementById("what");
const whole = document.getElementById("whole");
const button = document.getElementById("print");

if (data && labels && what && whole && button) {
  /** @type {import("./facets.js").Facet[]} */
  const facets = JSON.parse(data.textContent ?? "[]");
  /** @type {Record<string, string>} */
  const families = JSON.parse(labels.textContent ?? "{}");
  const articles = /** @type {HTMLElement[]} */ (
    Array.from(document.querySelectorAll("article.game"))
  );

  // No allowed-values map: this page has no chips to be stale against, and
  // building one from the facets is what put games on a printed sheet that the
  // index had filtered out. A value nothing matches simply shows nothing.
  const state = readQuery(location.search);

  /** The filters, said in words, so a printed sheet explains itself. */
  const describe = () => {
    const said = [];
    if (state.category) said.push(families[state.category] ?? state.category);
    for (const name of ["players", "decks", "minutes", "difficulty"]) {
      const value = state[name];
      const phrase = PHRASE[name];
      if (value && phrase) said.push(phrase(value));
    }
    if (state.q) said.push(`matching “${state.q}”`);
    return said;
  };

  /** @param {Map<number, {s: number, m: number}> | null} hits */
  const apply = (hits) => {
    const { order } = plan(facets, state, hits);
    const showing = new Set(order);
    articles.forEach((article, i) => {
      article.hidden = !showing.has(i);
    });

    const said = describe();
    what.textContent =
      countLabel(order.length, facets.length) + (said.length ? ` · ${said.join(" · ")}` : "");
    // The booklet does the whole corpus better, and saying so costs nothing.
    whole.hidden = said.length > 0;
  };

  // A text query needs the index the site already precaches. Without it the
  // page would show more than the index did, which is the wrong way to be
  // wrong but still wrong.
  if (state.q) {
    fetch("search-index.json")
      .then((r) => r.json())
      .then((index) =>
        import("./search.js").then(({ score }) => apply(score(index, state.q ?? ""))),
      )
      .catch(() => apply(null));
  } else {
    apply(null);
  }

  button.addEventListener("click", () => window.print());
}
