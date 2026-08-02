/**
 * The generated site, checked as a site rather than as a pile of strings.
 *
 * This is the copy that gets published, so the failures that matter are the
 * ones a reader hits and the author never does: a link to a page that was
 * renamed, an icon the manifest promises and the build does not ship, a file
 * added to docs/ but left out of the precache so it is the one thing missing
 * when someone opens the app on a train.
 *
 * The site is built in memory here rather than read from docs/, so these test
 * the builder and not whatever happens to be committed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGames, mayWrap, renderDiagramSvg, renderFigureSvg } from "naibi";
import { buildSite } from "../build-web.ts";

const games = loadGames();
const site = buildSite(games);

const text = (name: string): string => {
  const content = site.get(name);
  assert.ok(content !== undefined, `${name} was not generated`);
  return typeof content === "string" ? content : content.toString("utf8");
};

const pages = [...site.keys()].filter((name) => name.endsWith(".html"));

/** The precache list the service worker ships with. */
const precache: string[] = JSON.parse(
  /const ASSETS = (\[.*?\]);/s.exec(text("sw.js"))![1]!,
);

// --- shape ----------------------------------------------------------------

test("one page per game, plus the index and About", () => {
  assert.equal(pages.length, games.length + 2);
  assert.ok(site.has("index.html"));
  assert.ok(site.has("about.html"));
  for (const game of games) {
    assert.ok(site.has(`games/${game.id}.html`), `no page for ${game.id}`);
  }
});

test("the repository and the booklet are reachable from every page", () => {
  // Including a game page, which is where someone lands from a search engine
  // and where a wrong rule is most likely to be noticed.
  for (const page of pages) {
    const html = text(page);
    assert.match(html, /https:\/\/github\.com\/[\w-]+\/naibi(?:["/])/, `${page}: no repo link`);
    assert.ok(html.includes("naibi.pdf"), `${page}: no booklet link`);
    assert.ok(/href="(\.\.\/)?about\.html"/.test(html), `${page}: no About link`);
  }
});

test("the booklet link points at the file the PDF build actually writes", () => {
  // rendered/naibi.pdf is committed rather than copied into docs/, so the link
  // leaves the site -- and a renamed output would 404 with nothing to catch it.
  const link = /https:\/\/github\.com\/[\w-]+\/naibi\/raw\/main\/(\S+?\.pdf)/.exec(
    text("index.html"),
  );
  assert.ok(link, "no raw booklet link");
  assert.equal(link[1], "rendered/naibi.pdf");
});

test("the About page carries the things said nowhere else", () => {
  const html = text("about.html");

  for (const heading of ["What this is", "The name", "How it is made", "Using it elsewhere"]) {
    assert.ok(html.includes(heading), `About is missing "${heading}"`);
  }
  // The originality policy, stated once, here.
  assert.ok(html.includes("written rather than reworded"), "About omits the text policy");

  // And stated as a rule the project holds itself to, not as a finished audit.
  // The site is public and the checking is not complete, so the page must not
  // read as a guarantee — it claims only what is actually known.
  assert.ok(html.includes("not a guarantee"), "About overclaims its own originality");
  assert.ok(html.includes("please say so"), "About does not invite correction");
  assert.ok(html.includes("CC BY-SA 4.0"), "About does not name the licence");
  assert.ok(html.includes("naibi"), "About does not explain the name");
});

test("no page lectures the reader about the text being original", () => {
  // It is how the project works, not a fact about Klondike. Said once on the
  // About page; everywhere else just credits what was checked.
  for (const page of pages) {
    if (page === "about.html") continue;
    const html = text(page);
    for (const claim of ["written from scratch", "not reproduced", "original text"]) {
      assert.ok(!html.includes(claim), `${page} still says "${claim}"`);
    }
  }
});

test("a game page still credits what its rules were checked against", () => {
  for (const game of games) {
    const html = text(`games/${game.id}.html`);
    assert.ok(html.includes("Rules checked against"), `${game.id}: no credit line`);
    assert.ok(
      html.includes(game.sources_consulted[0]!.replace(/&/g, "&amp;")),
      `${game.id}: sources not named`,
    );
  }
});

test("nothing is generated empty", () => {
  for (const [name, content] of site) {
    if (name === ".nojekyll") continue;
    const size = typeof content === "string" ? content.length : content.byteLength;
    assert.ok(size > 0, `${name} is empty`);
  }
});

test("GitHub Pages is told not to run this through Jekyll", () => {
  // Without it, Pages ignores files and directories beginning with an
  // underscore and can rewrite the rest.
  assert.ok(site.has(".nojekyll"));
});

// --- links ----------------------------------------------------------------

test("every internal link points at a file that is shipped", () => {
  const missing: string[] = [];

  for (const page of pages) {
    const dir = page.includes("/") ? page.slice(0, page.lastIndexOf("/") + 1) : "";
    for (const [, attr, href] of text(page).matchAll(
      /(href|src)="([^"]+)"/g,
    )) {
      if (/^(https?:|mailto:|#|data:)/.test(href!)) continue;

      // Resolve relative to the page, the way a browser would. A link ending
      // in "/" is a directory, which Pages serves as its index.
      const resolved = new URL(href!, `file:///${dir}`).pathname.replace(/^\//, "");
      const target = decodeURIComponent(
        resolved === "" || resolved.endsWith("/") ? `${resolved}index.html` : resolved,
      );
      if (!site.has(target)) {
        missing.push(`${page}: ${attr}="${href}" -> ${target}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

test("every game is linked from the index", () => {
  const index = text("index.html");
  for (const game of games) {
    assert.ok(index.includes(`href="games/${game.id}.html"`), `${game.id} unlinked`);
  }
});

test("relative links only, so the site works under a repository subpath", () => {
  // GitHub Pages serves a project site from /<repo>/, so a single leading
  // slash anywhere would point at the domain root and 404.
  const rooted: string[] = [];
  for (const page of pages) {
    for (const [, , href] of text(page).matchAll(/(href|src)="(\/[^/][^"]*)"/g)) {
      rooted.push(`${page}: ${href}`);
    }
  }
  assert.deepEqual(rooted, []);
});

// --- pages ----------------------------------------------------------------

test("every page has the metadata a browser and a search engine need", () => {
  for (const page of pages) {
    const html = text(page);
    assert.match(html, /^<!doctype html>/, `${page}: no doctype`);
    assert.match(html, /<html lang="en">/, `${page}: no language`);
    assert.match(html, /<meta charset="utf-8">/, `${page}: no charset`);
    assert.match(html, /<meta name="viewport"/, `${page}: no viewport`);
    assert.match(html, /<title>[^<]+<\/title>/, `${page}: no title`);
    assert.match(html, /<meta name="description" content="[^"]+"/, `${page}: no description`);
  }
});

test("every page registers the service worker and links the manifest", () => {
  for (const page of pages) {
    const html = text(page);
    assert.ok(html.includes("serviceWorker"), `${page}: no registration`);
    assert.ok(html.includes("manifest.webmanifest"), `${page}: no manifest link`);
  }
});

test("a game's name and rules reach its page", () => {
  for (const game of games) {
    const html = text(`games/${game.id}.html`);
    // The name is escaped in the title, so compare like for like.
    const escaped = game.name.replace(/&/g, "&amp;");
    assert.ok(html.includes(escaped), `${game.id}: name missing`);
    assert.ok(html.includes("<h2>Setup</h2>"), `${game.id}: no setup section`);
    assert.ok(html.includes("<h2>Play</h2>"), `${game.id}: no play section`);
  }
});

test("data is escaped, so an ampersand in an entry cannot break a page", () => {
  for (const page of pages) {
    // Script content is raw text, where "&" is literal and legal; markup is
    // where an unescaped one is the signature of unescaped output.
    const markup = text(page).replace(/<script[\s\S]*?<\/script>/g, "");
    const bare = [...markup.matchAll(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi)];
    assert.deepEqual(
      bare.map((m) => markup.slice(Math.max(0, m.index - 30), m.index + 30)),
      [],
      `${page}: unescaped ampersand`,
    );
  }
});

test("embedded JSON cannot close the script element it sits in", () => {
  // "&" is safe in a script block but "</script" is not: it would end the
  // element early and spill the rest of the data into the page as markup.
  for (const page of pages) {
    for (const [, body] of text(page).matchAll(
      /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g,
    )) {
      assert.ok(!/<\/script/i.test(body!), `${page}: JSON closes its own script`);
      assert.doesNotThrow(() => JSON.parse(body!), `${page}: embedded JSON is invalid`);
    }
  }

  // The escaping is real, not an accident of the current data.
  assert.ok(
    !buildSite([{ ...games[0]!, name: "Hack </script><b>" }])
      .get("index.html")!
      .toString()
      .includes("</script><b>"),
  );
});

test("figures are inlined, not linked to files that are not shipped", () => {
  // Diagrams live in rendered/, which is not published, so the site has to
  // embed them. An <img> pointing at one would 404 for every reader.
  const withLayout = games.filter((g) => g.layout);
  assert.ok(withLayout.length > 0);

  for (const game of withLayout) {
    const html = text(`games/${game.id}.html`);
    assert.ok(html.includes("<svg"), `${game.id}: diagram not inlined`);
    assert.ok(!html.includes("<img"), `${game.id}: links an image instead`);
  }
});

test("the site draws its own figures rather than waiting on another build", () => {
  // It used to inline SVGs read out of rendered/diagrams/, which made `npm run
  // web` quietly depend on `npm run render` having gone first: build the site
  // from a clean checkout and every page came out with its pictures missing.
  // Drawing them here also lets the page ask for one without a baked caption.
  const game = games.find((g) => g.figures?.length && g.layout);
  assert.ok(game, "no game with both a layout and a figure to check");

  const html = text(`games/${game.id}.html`);
  assert.ok(
    html.includes(renderDiagramSvg(game.layout!, game.name, { caption: false })),
    `${game.id}: the page's diagram is not the one the data package draws`,
  );
  assert.ok(
    html.includes(renderFigureSvg(game.figures![0]!, game.name, { caption: false })),
    `${game.id}: the page's figure is not the one the data package draws`,
  );
});

/** Every <figure> on a page, split into the drawing and the caption. */
function figures(html: string) {
  return [...html.matchAll(/<figure>([\s\S]*?)<\/figure>/g)].map(([, body]) => ({
    svg: /<svg[\s\S]*?<\/svg>/.exec(body!)?.[0] ?? "",
    caption: /<figcaption>([\s\S]*?)<\/figcaption>/.exec(body!)?.[1] ?? "",
    floor: Number(/--floor:(\d+)px/.exec(body!)?.[1] ?? -1),
  }));
}

test("a caption appears under a figure, and not inside it as well", () => {
  // Both were drawn: the readable one underneath, and a copy baked into the
  // picture at whatever size the picture had shrunk to.
  let checked = 0;

  for (const game of games) {
    for (const fig of figures(text(`games/${game.id}.html`))) {
      assert.ok(fig.caption.length > 0, `${game.id}: a figure with no caption`);

      const drawn = [...fig.svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]!);
      const first = fig.caption.split(" ").slice(0, 3).join(" ");
      assert.ok(
        !drawn.some((t) => first.startsWith(t) && t.length > 6),
        `${game.id}: the caption is drawn inside the picture too`,
      );
      checked++;
    }
  }

  assert.ok(checked > 60, `only ${checked} figures checked`);
});

test("a drawing too wide for the column can scroll instead of shrinking away", () => {
  // A ten-column tableau really is ten columns and cannot be wrapped, so the
  // page has to offer the reader something other than a smaller picture.
  for (const game of games) {
    for (const fig of figures(text(`games/${game.id}.html`))) {
      const natural = Number(/\bwidth="(\d+)"/.exec(fig.svg)![1]);
      assert.ok(fig.floor > 0, `${game.id}: no floor on a figure`);
      assert.ok(
        fig.floor < natural,
        `${game.id}: floor ${fig.floor}px is not below its natural ${natural}px`,
      );
    }
  }

  assert.match(text("style.css"), /min-width:\s*var\(--floor\)/);
  assert.match(text("style.css"), /\.scroll\s*\{[^}]*overflow-x:\s*auto/s);
});

// --- how a shared link presents itself ------------------------------------

test("every page names a canonical URL, and it is absolute", () => {
  for (const page of pages) {
    const canonical = /<link rel="canonical" href="([^"]+)">/.exec(text(page));
    assert.ok(canonical, `${page}: no canonical URL`);
    assert.match(canonical[1]!, /^https:\/\//, `${page}: canonical is not absolute`);
  }
});

test("a canonical URL points back at the page it is on", () => {
  const base = /<link rel="canonical" href="([^"]+)">/.exec(text("index.html"))![1]!;

  for (const page of pages) {
    const canonical = /<link rel="canonical" href="([^"]+)">/.exec(text(page))![1]!;
    // The index is the directory itself; naming both it and index.html would
    // split whatever the page accumulates between two URLs.
    const expected = page === "index.html" ? base : base + page;
    assert.equal(canonical, expected, `${page}: canonical does not match its path`);
  }
  assert.ok(base.endsWith("/"), "the site root is not a directory URL");
});

test("every page carries share-card metadata a scraper can use", () => {
  for (const page of pages) {
    const html = text(page);
    for (const property of ["og:title", "og:description", "og:url", "og:image", "og:type"]) {
      assert.match(
        html,
        new RegExp(`<meta property="${property}" content="[^"]+"`),
        `${page}: no ${property}`,
      );
    }
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  }
});

test("the share image is absolute, sized, and actually shipped", () => {
  // A relative og:image is ignored by most scrapers, and one whose stated size
  // is wrong gets cropped.
  const html = text("index.html");
  const image = /<meta property="og:image" content="([^"]+)">/.exec(html)![1]!;
  assert.match(image, /^https:\/\//, "og:image is not absolute");

  const path = image.slice(image.indexOf("/naibi/") + "/naibi/".length);
  assert.ok(site.has(path), `og:image points at ${path}, which is not shipped`);
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
});

test("og:title and og:description repeat what the page already says", () => {
  // Two sources of truth for the same sentence is how one of them goes stale.
  for (const page of pages) {
    const html = text(page);
    const title = /<title>([^<]+)<\/title>/.exec(html)![1];
    const ogTitle = /<meta property="og:title" content="([^"]+)"/.exec(html)![1];
    assert.equal(ogTitle, title, `${page}: og:title disagrees with <title>`);

    const description = /<meta name="description" content="([^"]+)"/.exec(html)![1];
    const ogDescription = /<meta property="og:description" content="([^"]+)"/.exec(html)![1];
    assert.equal(ogDescription, description, `${page}: og:description disagrees`);
  }
});

test("the sitemap lists every page, once, absolutely", () => {
  const locs = [...text("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);

  assert.equal(locs.length, pages.length, "the sitemap and the site disagree in size");
  assert.deepEqual(locs, [...new Set(locs)], "a URL is listed twice");
  for (const loc of locs) assert.match(loc, /^https:\/\//);

  const canonicals = pages.map(
    (page) => /<link rel="canonical" href="([^"]+)">/.exec(text(page))![1]!,
  );
  assert.deepEqual([...locs].sort(), [...canonicals].sort(), "sitemap != canonical URLs");
});

test("robots.txt points at the sitemap that exists", () => {
  const robots = text("robots.txt");
  const sitemap = /Sitemap: (\S+)/.exec(robots);
  assert.ok(sitemap, "robots.txt names no sitemap");
  assert.ok(sitemap[1]!.endsWith("/sitemap.xml"));
  assert.ok(site.has("sitemap.xml"));
});

test("the share image is not forced on every visitor", () => {
  // A quarter of a megabyte that only link scrapers ever fetch.
  assert.ok(!precache.includes("icons/og.png"), "the share card is precached");
  assert.ok(!precache.includes("sitemap.xml"));
  assert.ok(!precache.includes("robots.txt"));
});

// --- reachable to a screen reader -----------------------------------------

test("every inlined figure has an accessible name", () => {
  // A diagram is the one thing on these pages that carries meaning purely
  // visually, so an unnamed <svg> is a rule a screen reader cannot reach at all.
  const unnamed: string[] = [];

  for (const page of pages) {
    for (const [, svg] of text(page).matchAll(/<svg\b([^>]*)>/g)) {
      const named = /aria-label="[^"]+"/.test(svg!) || /role="img"/.test(svg!);
      if (!named) unnamed.push(page);
    }
  }

  assert.deepEqual(unnamed, []);
});

test("every figure is captioned in text as well as drawn", () => {
  for (const page of pages) {
    const html = text(page);
    const figures = (html.match(/<figure>/g) ?? []).length;
    const captions = (html.match(/<figcaption>/g) ?? []).length;
    assert.equal(captions, figures, `${page}: ${figures} figures, ${captions} captions`);
  }
});

test("headings descend without skipping a level", () => {
  // A jump from h1 to h3 makes the outline a screen reader builds nonsense.
  for (const page of pages) {
    const levels = [...text(page).matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    assert.ok(levels.length > 0, `${page}: no headings`);
    assert.equal(levels[0], 1, `${page}: does not start at h1`);

    for (let i = 1; i < levels.length; i += 1) {
      assert.ok(
        levels[i]! <= levels[i - 1]! + 1,
        `${page}: h${levels[i - 1]} followed by h${levels[i]}`,
      );
    }
  }
});

test("each filter is one labelled group, which is what the spacing relies on", () => {
  // The chips are spaced by ".facet", and the gap ABOVE a group has to beat the
  // gap inside it or every label reads as a caption for the control above
  // rather than a heading for the one below. That is a CSS rule no test can
  // check, but it depends on this markup, which one can.
  const html = text("index.html");
  const facets = [...html.matchAll(/<div class="facet">([\s\S]*?)<\/div><\/div>/g)];

  assert.equal(facets.length, 4, "expected one group per filter");

  // Named, so changing one is a decision rather than a slip. "At most" used to
  // stand alone here and read as a heading with no noun -- at most WHAT.
  assert.deepEqual(
    facets.map(([, inner]) => /<label>([^<]+)<\/label>/.exec(inner!)![1]),
    ["Players", "Decks on hand", "Time", "Difficulty (at most)"],
  );
  for (const [, inner] of facets) {
    assert.match(inner!, /^<label>[^<]+<\/label><div class="chips">/, "group is malformed");
    assert.equal((inner!.match(/<div class="chips">/g) ?? []).length, 1);
  }

  // Every radio lives inside a group, so none is left unlabelled.
  const radios = (html.match(/<input type="radio"/g) ?? []).length;
  const grouped = facets.reduce(
    (n, [, inner]) => n + (inner!.match(/<input type="radio"/g) ?? []).length,
    0,
  );
  assert.equal(grouped, radios, "a filter chip sits outside a labelled group");
});

test("every page can tell the reader a new version has landed", () => {
  // Cache-first means a deployment is invisible to an open page. The worker
  // updates itself correctly; without this the reader has no way to know.
  for (const page of pages) {
    const html = text(page);
    assert.ok(html.includes('id="updated"'), `${page}: no update notice`);
    assert.ok(html.includes("controllerchange"), `${page}: nothing listens for an update`);
    assert.ok(html.includes('id="reload"'), `${page}: no way to act on it`);
  }
});

test("the update notice starts hidden and is not a forced reload", () => {
  const html = text("index.html");
  assert.match(html, /<p class="updated" id="updated" hidden>/, "notice starts visible");

  // A page read at a table mid-game must not yank itself out from under someone
  // looking up a scoring rule. The reload belongs to the button, so check the
  // update handler's own body rather than anything merely near the word.
  const handler = /"controllerchange", function \(\) \{([\s\S]*?)\n {4}\}\)/.exec(html);
  assert.ok(handler, "no controllerchange handler to inspect");
  assert.ok(
    !handler[1]!.includes("location.reload"),
    "the page reloads itself on update instead of offering to",
  );

  // And the reload that does exist is the one the reader asks for.
  assert.equal((html.match(/location\.reload/g) ?? []).length, 1);
  assert.match(html, /"click", function \(\) \{\n {2}location\.reload\(\);/);
});

test("a first install is not reported as an update", () => {
  // controllerchange also fires when a worker claims a page that had none, so
  // a brand new visitor would otherwise be told to reload immediately.
  const html = text("index.html");
  assert.match(html, /navigator\.serviceWorker\.controller;/, "prior control not captured");
  assert.match(html, /if \(!updating\) return;/, "first install is not guarded");
});

test("the search box is labelled", () => {
  const html = text("index.html");
  const id = /<input[^>]*id="q"/.exec(html);
  assert.ok(id, "no search box");
  assert.ok(
    /<label[^>]*for="q"/.test(html) || /aria-label="[^"]+"[^>]*id="q"/.test(html),
    "the search box has no label",
  );
});

// --- offline --------------------------------------------------------------

test("the precache covers everything the site is made of", () => {
  // The manifest is fetched by the browser outside the worker's control, and
  // the worker cannot usefully cache itself. Everything else must be listed,
  // or it is the one thing missing with no signal.
  const expected = [...site.keys()].filter(
    (name) =>
      !name.endsWith(".webmanifest") &&
      name !== "sw.js" &&
      name !== ".nojekyll" &&
      // Deliberately excluded: fetched by scrapers and crawlers, not the app.
      !["icons/og.png", "sitemap.xml", "robots.txt"].includes(name),
  );

  const listed = new Set(precache);
  assert.deepEqual(
    expected.filter((name) => !listed.has(name)),
    [],
    "shipped but not precached",
  );
});

test("the precache lists nothing that is not shipped", () => {
  // addAll() rejects as a whole if any entry 404s, so one stale filename means
  // the app installs nothing at all and offline silently never works.
  const phantom = precache.filter((name) => name !== "./" && !site.has(name));
  assert.deepEqual(phantom, []);
});

test("the precache includes the start URL itself", () => {
  // A visitor who installs from "/" and then goes offline requests "/", not
  // "/index.html".
  assert.ok(precache.includes("./"));
});

test("the cache name changes when the content does, and only then", () => {
  const again = buildSite(games);
  const nameOf = (files: Map<string, string | Buffer>) =>
    /const CACHE = "([^"]+)"/.exec(String(files.get("sw.js")))![1];

  assert.equal(nameOf(again), nameOf(site), "same content, same cache");

  const changed = buildSite(
    games.map((g, i) => (i === 0 ? { ...g, play: `${g.play} Extra rule.` } : g)),
  );
  assert.notEqual(nameOf(changed), nameOf(site), "changed content, stale cache");
});

// --- manifest -------------------------------------------------------------

test("the manifest is valid JSON promising only icons that exist", () => {
  const manifest = JSON.parse(text("manifest.webmanifest"));

  assert.ok(manifest.name && manifest.short_name);
  assert.equal(manifest.start_url, "./", "an absolute start_url breaks a subpath");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons.length > 0);

  for (const icon of manifest.icons) {
    assert.ok(site.has(icon.src), `manifest promises ${icon.src}, which is not shipped`);
  }
  assert.ok(
    manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable"),
    "no maskable icon, so Android crops the installed icon badly",
  );
});

test("no drawing a reader could reflow is wider than a 320px column", () => {
  // WCAG 2.2 SC 1.4.10 Reflow (AA) wants content usable at 320 CSS px without
  // scrolling in two directions. That is not a phone measurement -- it is what
  // a 1280px window becomes at 400% zoom, which is how a low-vision reader
  // reads anything, so it is the number this site is built against.
  //
  // The exception is for content that *requires* two-dimensional layout. A rank
  // order does not: it wraps and still says the same thing, so it must fit. A
  // ten-column tableau and an eight-card meld do -- splitting either says
  // something false about the game -- so those keep their width and scroll.
  const COLUMN = 320 - 2 * 18; // .wrap horizontal padding, in px, not rem
  const tooWide: string[] = [];

  for (const game of games) {
    const html = text(`games/${game.id}.html`);
    const drawings = [...html.matchAll(/<figure>[\s\S]*?<\/figure>/g)].map((m) => m[0]);
    // Figures follow the diagram, in the order gamePage writes them.
    const offset = game.layout ? 1 : 0;

    (game.figures ?? []).forEach((spec, index) => {
      if (!mayWrap(spec)) return;
      const body = drawings[index + offset];
      assert.ok(body, `${game.id}: figure ${index + 1} is missing from the page`);
      const floor = Number(/--floor:(\d+)px/.exec(body)![1]);
      if (floor > COLUMN) tooWide.push(`${game.id}-fig${index + 1} (${floor}px)`);
    });
  }

  assert.deepEqual(tooWide, [], "these would scroll sideways at 320px");
});

test("the column a drawing is sized against does not shrink as type grows", () => {
  // The whole width budget is what is left after .wrap's horizontal padding.
  // In rem that padding grows with the reader's default font size, so enlarging
  // type handed the drawings a narrower column -- backwards, and worst for the
  // readers the 320px target exists for. Measured 285px -> 250px between a 16px
  // and a 32px root before this was changed.
  const css = text("style.css");
  const wrap = /\.wrap \{[^}]*padding:([^;]+);/.exec(css);
  assert.ok(wrap, "the .wrap padding rule has moved");

  // `padding: <top> <horizontal> <bottom>` — the middle value is the one the
  // column width is made of. The bottom one stays in rem; it should scale.
  const [, horizontal] = wrap[1]!.trim().split(/\s+/);
  assert.match(horizontal ?? "", /px$/, "horizontal padding is back in rem");
});

// --- installing it --------------------------------------------------------

test("the About page says how to install it, per browser", () => {
  const html = text("about.html");

  assert.ok(html.includes('id="install"'), "no install section to link to");
  assert.match(html, /<details>[\s\S]*<summary>/, "the steps are not in a disclosure");

  // Named browsers rather than one generic set of steps: every one of these
  // keeps it somewhere different, and steps that name the wrong menu are worse
  // than none. Vivaldi in particular is neither where Safari keeps it on iOS
  // nor where Chrome keeps it on Android.
  for (const browser of ["Safari", "Vivaldi", "Chrome", "Edge", "Firefox"]) {
    assert.ok(html.includes(browser), `the instructions do not mention ${browser}`);
  }
  for (const platform of ["iPhone and iPad", "Android", "Computer"]) {
    assert.ok(html.includes(platform), `no instructions for ${platform}`);
  }
});

test("the install instructions say the routes vary", () => {
  // The names of the menu items are stable; where they sit is not. Vivaldi's
  // own help page was already a step out of date when this was written, so the
  // page promises landmarks rather than a tap sequence — which is what makes
  // naming specific browsers safe rather than a hostage to the next release.
  const html = text("about.html").replace(/\s+/g, " ");
  assert.ok(
    /moves between browser versions/.test(html),
    "the instructions read as exact when they cannot be",
  );
  assert.ok(html.includes("what to look for"), "the landmark framing is gone");
});

test("the install instructions keep the step that silently fails", () => {
  // On iOS the switch is the whole thing. Left off, the reader gets a bookmark
  // that opens in a tab — identical on the home screen, not the same thing, and
  // nothing tells them. Generic tutorial copy leaves this out.
  // Whitespace-normalised: the assertions are about the sentence, not about
  // where the generated HTML happens to wrap it.
  const html = text("about.html").replace(/\s+/g, " ");
  assert.ok(html.includes("Open as Web App"), "the toggle is not mentioned");
  assert.ok(
    /opens in a tab/.test(html),
    "the consequence of missing the toggle is not explained",
  );
  // Vivaldi on iOS goes through the browser's own menu, not the iOS share
  // button, which is the step a Safari-shaped instruction gets wrong. And the
  // item is one level further down than Vivaldi's own help page says: this path
  // was walked on a real iPhone, which is why "View More" is here and is not in
  // the vendor documentation.
  assert.ok(html.includes("Share Page"), "the Vivaldi iOS path is not named");
  assert.ok(html.includes("View More"), "the step the vendor docs omit is missing");
});

test("the install section is reachable from somewhere", () => {
  // It sits near the bottom of a long page. Unlinked, it is findable only by
  // scrolling to it, which is the problem it exists to solve.
  const linking = pages.filter((p) => text(p).includes('href="about.html#install"'));
  assert.ok(linking.length > 0, "nothing links to the install instructions");

  // And the anchor it points at has to exist.
  assert.ok(text("about.html").includes('id="install"'));
});

test("installing it costs no JavaScript", () => {
  // The whole point of using <details> and prose. The only script on the About
  // page is the service-worker bootstrap every page already carries.
  const scripts = [...text("about.html").matchAll(/<script\b/g)];
  assert.equal(scripts.length, 1, "the install section pulled in JavaScript");
  assert.ok(!text("about.html").includes("beforeinstallprompt"));
});

test("the installed app is not locked to one orientation", () => {
  // WCAG 2.2 failure F97 against SC 1.3.4: a manifest that pins orientation
  // stops a reader who has their phone mounted, or who just wants a wide
  // ranking strip across the screen.
  const manifest = JSON.parse(text("manifest.webmanifest"));
  assert.equal(manifest.orientation, undefined, "the manifest pins an orientation");
});

test("every focusable control has an author-declared focus ring", () => {
  // Only the search field and the filter chips had one; the reset button, every
  // link and the update banner's Reload button fell back to the UA default.
  const css = text("style.css");
  assert.match(css, /^:focus-visible \{[^}]*outline:/m, "no shared focus ring");
  // The Reload button sits on the accent colour, so the shared accent ring
  // would be invisible on its own banner. It needs a value per scheme.
  assert.match(css, /\.updated button:focus-visible \{[^}]*outline-color/);
  assert.match(
    css,
    /prefers-color-scheme: dark\)[\s\S]*?\.updated button:focus-visible \{[^}]*outline-color/,
    "the dark scheme leaves the banner's focus ring at the light value",
  );
});
