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

import { countLabel, describe, plan, readQuery } from "./facets.js";

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

  /** @param {Map<number, {s: number, m: number}> | null} hits */
  const apply = (hits) => {
    const { order } = plan(facets, state, hits);
    const showing = new Set(order);
    articles.forEach((article, i) => {
      article.hidden = !showing.has(i);
    });

    // The filters, said in words, so a printed sheet explains itself. The same
    // describe() the index's empty state uses: they are the same sentence for
    // the same reason -- a short list with no controls visible to explain it --
    // and this page used to say it separately, in a map that had to be extended
    // by hand for every new control. It was never extended, which is how a
    // printed sheet would have gone on claiming to be unfiltered.
    const said = describe(state, families);
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
