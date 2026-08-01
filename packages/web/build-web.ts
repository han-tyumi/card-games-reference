/**
 * Generate the Naibi site: static, installable, and fully offline.
 *
 *   npm run web
 *
 * This is a third renderer over the same data as the Markdown and the PDF. No
 * framework and no bundler: every page is written out at build time, so what
 * ships is HTML, one small stylesheet, and about forty lines of JavaScript for
 * filtering. The entire corpus is a couple of hundred kilobytes gzipped, which
 * is what makes precaching the whole thing for offline use reasonable.
 *
 * Output goes to docs/, which GitHub Pages can serve from the main branch with
 * no configuration beyond switching it on.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { CardGame } from "naibi";
import {
  SECTIONS,
  blocks,
  categoryLabel,
  durationLine,
  facts,
  loadGames,
  playersLine,
} from "naibi";
// The same module the browser loads, so the words this indexes and the words a
// query is split into cannot drift apart.
import { buildIndex } from "./assets/search.js";
import { facetsFor, searchRecords } from "./records.ts";

const PACKAGE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ASSETS = join(PACKAGE_ROOT, "assets");
const DIAGRAMS = join(REPO_ROOT, "rendered", "diagrams");
const OUT = join(REPO_ROOT, "docs");

const TITLE = "Naibi";
const TAGLINE = "How to play, for the deck you already own.";
const REPO_URL = "https://github.com/han-tyumi/naibi";
// The booklet is committed to the repository rather than copied into docs/: it
// is nearly a megabyte, it would double in git on every rebuild, and precaching
// it would double what every visitor downloads for something most never open.
const PDF_URL = `${REPO_URL}/raw/main/rendered/naibi.pdf`;
const ISSUES_URL = `${REPO_URL}/issues`;
// Where this is served from. Only needed for the things that cannot be relative
// -- canonical URLs, share-card metadata and the sitemap -- so a custom domain
// would change this one line and nothing else.
const SITE_URL = "https://han-tyumi.github.io/naibi/";
/** Fetched by scrapers, never by the app, so it stays out of the precache. */
const OG_IMAGE = "icons/og.png";

/** Cache name changes with content, so a new build supersedes the old cache. */
function contentHash(parts: string[]): string {
  let hash = 5381;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash = ((hash << 5) + hash + part.charCodeAt(i)) >>> 0;
    }
  }
  return hash.toString(36);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Entries use blank lines for paragraphs and "- " for bullets; nothing else.
 * The parsing is shared with the PDF, so the two cannot disagree about what a
 * list is; only the markup below is ours.
 */
function prose(text: string): string {
  return blocks(text)
    .map((block) =>
      block.kind === "list"
        ? "<ul>" + block.items.map((i) => `<li>${esc(i)}</li>`).join("") + "</ul>"
        : `<p>${esc(block.text)}</p>`,
    )
    .join("\n");
}

function page(opts: {
  title: string;
  description: string;
  body: string;
  /** Site-relative path this page is written to, for its canonical URL. */
  path: string;
  wide?: boolean;
  script?: boolean;
  depth: number;
}): string {
  const up = opts.depth === 0 ? "" : "../";
  // A directory and its index are one page; naming both splits whatever
  // ranking or share count the page accumulates between two URLs.
  const canonical = SITE_URL + opts.path.replace(/(^|\/)index\.html$/, "$1");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<meta name="theme-color" content="#1f3a5f">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${TITLE}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE_URL}${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${TITLE} — ${esc(TAGLINE)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="manifest" href="${up}manifest.webmanifest">
<link rel="icon" href="${up}icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${up}icons/icon-192.png">
<link rel="stylesheet" href="${up}style.css">
</head>
<body>
<div class="wrap${opts.wide ? " wrap--wide" : ""}">
<p class="updated" id="updated" hidden>A newer version is ready.
<button id="reload" type="button">Reload</button></p>
${opts.body}
<footer>
<nav class="site-nav">
<a href="${up}about.html">About</a>
<a href="${PDF_URL}">Print the booklet (PDF)</a>
<a href="${REPO_URL}">Source on GitHub</a>
<a href="${ISSUES_URL}">Report a mistake</a>
</nav>
<p>Text licensed
<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</p>
</footer>
</div>
${opts.script ? `<script type="module" src="${up}app.js"></script>` : ""}
<script>
/*
 * Cache-first means the page you are reading came from the cache, so a new
 * deployment is invisible until you navigate again -- and you have no way to
 * know there was one. The worker updates itself correctly on its own; the only
 * thing missing was saying so.
 *
 * Not an automatic reload: this gets read at a table mid-game, and yanking the
 * page out from under someone looking up a scoring rule is worse than being one
 * version behind.
 */
if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    // Captured before registering: a first install claims an uncontrolled page
    // and fires the same event, which is not an update to tell anyone about.
    var updating = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("${up}sw.js").then(function (registration) {
      // A browser only looks for a new worker when you navigate, so a page left
      // open would never find out. Ask again on coming back to the tab, which
      // is a conditional request for one small file.
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") registration.update();
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!updating) return;
      var banner = document.getElementById("updated");
      if (banner) banner.hidden = false;
    });
  });
}
document.getElementById("reload").addEventListener("click", function () {
  location.reload();
});
</script>
</body>
</html>
`;
}

function table(headers: string[], rows: string[][]): string {
  return (
    `<div class="scroll"><table><thead><tr>` +
    headers.map((h) => `<th>${esc(h)}</th>`).join("") +
    `</tr></thead><tbody>` +
    rows
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("") +
    `</tbody></table></div>`
  );
}

function figureFor(id: string, caption: string): string {
  const path = join(DIAGRAMS, `${id}.svg`);
  if (!existsSync(path)) return "";
  // Inlined rather than linked: one fewer request, and it inherits the page's
  // dark-mode treatment.
  const svg = readFileSync(path, "utf8").replace(/<\?xml[^>]*\?>\s*/, "");
  return `<figure>${svg}<figcaption>${esc(caption)}</figcaption></figure>`;
}

function gamePage(game: CardGame): string {
  const parts: string[] = [];
  parts.push(`<a class="backlink" href="../">All games</a>`);
  parts.push(`<article class="game">`);
  parts.push(`<h1>${esc(game.name)}</h1>`);
  if (game.aliases.length > 0) {
    parts.push(`<p class="aka">Also known as ${esc(game.aliases.join(", "))}</p>`);
  }

  parts.push(
    `<dl class="facts">` +
      facts(game)
        .filter(([label]) => label !== "Also known as")
        .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
        .join("") +
      `</dl>`,
  );

  for (const { key, heading } of SECTIONS) {
    parts.push(`<h2>${esc(heading)}</h2>`);
    parts.push(prose(game[key]));

    if (key === "setup") {
      if (game.layout) {
        parts.push(figureFor(game.id, game.layout.caption ?? `${game.name} setup`));
      }
      if (game.deal) {
        const hasRemoved = game.deal.some((r) => r.removed);
        const hasNote = game.deal.some((r) => r.note);
        const head = ["Players", "Each player gets"];
        if (hasRemoved) head.push("Removed");
        if (hasNote) head.push("Notes");
        parts.push(
          table(
            head,
            game.deal.map((r) => {
              const cells = [
                String(r.players),
                r.hand === 0 ? "the whole deck, shared out" : `${r.hand} cards`,
              ];
              if (hasRemoved) cells.push(r.removed ?? "—");
              if (hasNote) cells.push(r.note ?? "—");
              return cells;
            }),
          ),
        );
      }
    }

    if (key === "play" && game.figures) {
      game.figures.forEach((figure, index) => {
        parts.push(figureFor(`${game.id}-fig${index + 1}`, figure.caption));
      });
    }

    if (key === "goal_and_scoring" && game.scoring_table) {
      const hasNote = game.scoring_table.some((r) => r.note);
      parts.push(
        table(
          hasNote ? ["Scores", "Value", "Notes"] : ["Scores", "Value"],
          game.scoring_table.map((r) =>
            hasNote ? [r.item, r.value, r.note ?? "—"] : [r.item, r.value],
          ),
        ),
      );
    }
  }

  parts.push(`<h2>Variants</h2>`);
  for (const variant of game.variants) {
    parts.push(
      `<p class="variant"><b>${esc(variant.name)}</b> — ${esc(variant.description)}</p>`,
    );
  }

  parts.push(
    `<ul class="tags">` +
      [...game.tags].sort().map((t) => `<li>${esc(t)}</li>`).join("") +
      `</ul>`,
  );
  parts.push(
    `<p class="sources">Rules checked against ${esc(game.sources_consulted.join(", "))}.</p>`,
  );
  parts.push(`</article>`);

  return page({
    title: `${game.name} — how to play | ${TITLE}`,
    description: `How to play ${game.name}: ${playersLine(game)}, ${durationLine(game)}, ${game.decks}.`,
    body: parts.join("\n"),
    path: `games/${game.id}.html`,
    depth: 1,
  });
}

/**
 * Embed JSON inside a <script> block.
 *
 * Script content is raw text, so an entity is not decoded there and an "&" is
 * safe -- but a literal "</script" in the data would close the element early
 * and spill the rest of the JSON into the page as markup. Escaping "<" to its
 * < form is still valid JSON and cannot terminate anything.
 */
function embed(json: string): string {
  return json.replace(/</g, "\\u003c");
}

function chipGroup(
  name: string,
  label: string,
  options: [string, string][],
): string {
  return (
    `<div class="facet"><label>${esc(label)}</label><div class="chips">` +
    options
      .map(([value, text], i) => {
        const id = `${name}-${i}`;
        return (
          `<input type="radio" name="${name}" id="${id}" value="${esc(value)}"` +
          `${value === "" ? " checked" : ""}>` +
          `<label for="${id}">${esc(text)}</label>`
        );
      })
      .join("") +
    `</div></div>`
  );
}

/**
 * The About page.
 *
 * Also the one place the project explains that it writes its own text. That
 * used to sit under every single game, which read as protesting too much: it is
 * how the project works, not a fact about Klondike. Said once, here.
 */
function aboutPage(games: CardGame[]): string {
  const body = `<a class="backlink" href="./">All games</a>
<article class="game">
<h1>About ${TITLE}</h1>

<h2>What this is</h2>
<p>A reference for how to play card games, for the deck you already own. Every
game here is playable with cards you can buy anywhere — a standard 52-card pack,
sometimes two, occasionally a named pack the entry tells you about up front.</p>
<p>It is built for the moment it is actually needed: someone at the table asks
how a rule works, or you are teaching a game you have not played in a year. So
it loads fast, works with no signal once you have opened it, and can be
installed to a home screen like an app. There is no account, no tracking and
nothing to sign up for.</p>

<h2>The name</h2>
<p><strong>Naibi</strong> is the first European word for playing cards, recorded
in Florence in 1377. Cards reached Europe from the Mamluk Sultanate of Egypt in
the 1370s and the Italians called them <em>naibi</em>, from the Arabic
<em>nā'ib</em>, "deputy" — the rank of court card in the Mamluk pack that every
European deck descends from. Spain still calls them <em>naipes</em>.</p>

<h2>How it is made</h2>
<p>Every game is one structured file: the players, the deal, the rules, the
scoring, the variants worth knowing. The website, the printable booklet and the
plain-text version are all generated from those same files, so a rule corrected
once is corrected everywhere.</p>
<p>The text is the project's own. Rules are facts and anyone may describe them,
but the words a source chose to describe them in belong to that source — so
entries here are written rather than reworded, and each one lists what it was
checked against.</p>
<p>That is the rule the project holds itself to, not a guarantee it has finished
auditing. Checking wording against a source is slow, it has caught real
mistakes before, and it is not complete across the collection. If a passage
reads close to something you have read elsewhere,
<a href="${ISSUES_URL}">please say so</a> — that is a bug, and it gets fixed.</p>

<h2>Using it elsewhere</h2>
<p>The rules text is licensed
<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>: use
it, print it, build on it, including commercially, as long as you credit ${TITLE}
and share what you build on the same terms. The code that generates all this is
MIT.</p>

<h2>Corrections and contributions</h2>
<p>${games.length} games so far, and rules vary by region and family — if
something here disagrees with how you learned it, that is worth knowing.
<a href="${ISSUES_URL}">Open an issue</a> or send a change on
<a href="${REPO_URL}">GitHub</a>.</p>

<h2>Take it with you</h2>
<p>The whole collection is also
<a href="${PDF_URL}">a printable booklet</a> — one PDF, bookmarked, a game to a
page. Or just open this site once and it stays available offline.</p>
</article>`;

  return page({
    title: `About — ${TITLE}`,
    description: `What ${TITLE} is, where the name comes from, and how to reuse it.`,
    body,
    path: "about.html",
    depth: 0,
  });
}

function indexPage(games: CardGame[]): string {
  const body: string[] = [];
  body.push(`<header class="masthead">
<h1>${TITLE}</h1>
<p class="pron">NYE-bee</p>
<p class="blurb">${esc(TAGLINE)} ${games.length} games. Works offline once
loaded, and installs to your home screen.</p>
<nav class="site-nav">
<a href="about.html">About</a>
<a href="${PDF_URL}">Print the booklet (PDF)</a>
<a href="${REPO_URL}">Source on GitHub</a>
</nav>
</header>`);

  body.push(`<div class="filters">
<label for="q">Search</label>
<input id="q" type="search" placeholder="Search every rule — try bower, or slap" autocomplete="off">
${chipGroup("players", "Players", [
  ["", "Any"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"], ["8", "8"],
])}
${chipGroup("decks", "Decks on hand", [["", "Any"], ["1", "1"], ["2", "2"]])}
${chipGroup("minutes", "Time", [["", "Any"], ["15", "≤15 min"], ["30", "≤30 min"], ["60", "≤60 min"]])}
${/* A ceiling, not an exact match: "Easy" returns the simple games too. Time
     says that in its chips ("≤30 min"); difficulty has nowhere to put it, so
     the label carries it once rather than every chip repeating "up to". */ ""}
${chipGroup("difficulty", "Difficulty (at most)", [
  ["", "Any"], ["simple", "Simple"], ["easy", "Easy"], ["medium", "Medium"],
])}
</div>`);

  body.push(`<p class="count" id="count">${games.length} games</p>`);
  body.push(`<ul class="games" id="games">`);
  for (const game of games) {
    body.push(
      `<li><a href="games/${game.id}.html"><h2>${esc(game.name)}</h2>` +
        `<p class="meta">${esc(playersLine(game))} · ${esc(durationLine(game))} · ` +
        `${esc(game.difficulty)} · ${esc(categoryLabel(game.category))}</p>` +
        `<p class="where"></p></a></li>`,
    );
  }
  body.push(`</ul>`);
  body.push(
    `<p class="empty" id="empty" hidden>Nothing matches. ` +
      `<button id="reset" type="button">Clear filters</button></p>`,
  );
  body.push(
    `<script type="application/json" id="facets">` +
      `${embed(JSON.stringify(facetsFor(games)))}</script>`,
  );

  return page({
    title: `${TITLE} — card game rules that work offline`,
    description: `${TAGLINE} Rules for ${games.length} card games, free to reuse, working offline.`,
    body: body.join("\n"),
    path: "index.html",
    wide: true,
    script: true,
    depth: 0,
  });
}

// --- build ----------------------------------------------------------------

/**
 * The whole site as bytes, before anything touches the disk.
 *
 * Built into memory so `--check` can compare it against what is committed
 * without writing anything. docs/ is generated output served straight to
 * readers, so a stale copy is not a cosmetic problem: it is the published rules
 * disagreeing with the source they came from.
 */
export function buildSite(games: CardGame[]): Map<string, string | Buffer> {
  const files = new Map<string, string | Buffer>();

  files.set("index.html", indexPage(games));
  files.set("about.html", aboutPage(games));

  // Sixty game pages are one click from the index, which a crawler will find on
  // its own eventually. Listing them says so on the first visit instead.
  const urls = ["", "about.html", ...games.map((g) => `games/${g.id}.html`)];
  files.set(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join("\n") +
      `\n</urlset>\n`,
  );
  files.set("robots.txt", `Sitemap: ${SITE_URL}sitemap.xml\n`);
  files.set("search-index.json", JSON.stringify(buildIndex(searchRecords(games))));
  for (const game of games) files.set(`games/${game.id}.html`, gamePage(game));

  for (const asset of ["style.css", "app.js", "search.js", "facets.js"]) {
    files.set(asset, readFileSync(join(ASSETS, asset), "utf8"));
  }

  for (const icon of readdirSync(join(ASSETS, "icons"))) {
    files.set(`icons/${icon}`, readFileSync(join(ASSETS, "icons", icon)));
  }

  files.set(
    "manifest.webmanifest",
    JSON.stringify(
      {
        name: "Naibi — card game rules",
        short_name: "Naibi",
        description: TAGLINE,
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#fbfaf8",
        theme_color: "#1f3a5f",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      null,
      2,
    ),
  );

  // The service worker precaches every page. The whole corpus is small enough
  // that there is no reason to be clever about what to keep: install once and
  // the entire reference is available with no signal. The worker never caches
  // itself, and the manifest is fetched by the browser outside its control.
  const precache = [...files.keys()].filter(
    (f) =>
      !f.endsWith(".webmanifest") &&
      // Fetched once by a link scraper and never by the app; precaching it
      // would add a quarter of a megabyte to every visitor's first load.
      f !== OG_IMAGE &&
      f !== "sitemap.xml" &&
      f !== "robots.txt",
  );
  const version = contentHash(
    precache.map((f) => {
      const content = files.get(f)!;
      // latin1 round-trips the icon bytes; utf8 would fold them into U+FFFD and
      // blind the hash to changes in them.
      return typeof content === "string" ? content : content.toString("latin1");
    }),
  );

  files.set(
    "sw.js",
    `/* Generated by packages/web/build-web.ts. Do not edit. */
const CACHE = "naibi-${version}";
const ASSETS = ${JSON.stringify(["./", ...precache], null, 0)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/*
 * Cache first. The content only changes when a new build is deployed, and a
 * reference that answers instantly beside a card table is worth more than one
 * that is a few hours fresher.
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"));
    }),
  );
});
`,
  );

  // Stops GitHub Pages running the output through Jekyll.
  files.set(".nojekyll", "");

  return files;
}

/** Every file currently under docs/, relative to it. */
function onDisk(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? onDisk(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );
}

function same(built: string | Buffer, path: string): boolean {
  const disk = readFileSync(path);
  return typeof built === "string"
    ? disk.toString("utf8") === built
    : disk.equals(built);
}

function main(): number {
  const check = process.argv.includes("--check");
  const games = loadGames();
  if (games.length === 0) {
    console.error("No games found. Nothing to build.");
    return 1;
  }

  const files = buildSite(games);

  if (check) {
    const stale = [...files]
      .filter(([name]) => !existsSync(join(OUT, name)))
      .map(([name]) => `missing: docs/${name}`)
      .concat(
        [...files]
          .filter(
            ([name, content]) =>
              existsSync(join(OUT, name)) && !same(content, join(OUT, name)),
          )
          .map(([name]) => `stale:   docs/${name}`),
      )
      .concat(
        onDisk(OUT)
          .filter((name) => !files.has(name))
          .map((name) => `orphan:  docs/${name}`),
      );

    if (stale.length > 0) {
      for (const line of stale.sort()) console.log(line);
      console.log("\nRun: npm run web");
      return 1;
    }
    console.log(`docs/ is up to date (${files.size} files, ${games.length} games).`);
    return 0;
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "games"), { recursive: true });
  mkdirSync(join(OUT, "icons"), { recursive: true });

  let bytes = 0;
  for (const [name, content] of files) {
    writeFileSync(join(OUT, name), content);
    bytes += typeof content === "string" ? Buffer.byteLength(content) : content.byteLength;
  }

  console.log(
    `Wrote ${files.size} files to docs/ ` +
      `(${games.length} games, ${(bytes / 1024).toFixed(0)} KB uncompressed).`,
  );
  return 0;
}

// Only when run as a command. Imported -- by the tests -- this file is just
// buildSite() and the functions under it.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main());
}
