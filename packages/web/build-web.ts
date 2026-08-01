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
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CardGame } from "naibi";
import {
  SECTIONS,
  categoryLabel,
  durationLine,
  facts,
  loadGames,
  playersLine,
} from "naibi";

const PACKAGE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ASSETS = join(PACKAGE_ROOT, "assets");
const DIAGRAMS = join(REPO_ROOT, "rendered", "diagrams");
const OUT = join(REPO_ROOT, "docs");

const TITLE = "Naibi";
const TAGLINE = "How to play, for the deck you already own.";
const REPO_URL = "https://github.com/han-tyumi/naibi";

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

/** Entries use blank lines for paragraphs and "- " for bullets; nothing else. */
function prose(text: string): string {
  const out: string[] = [];
  for (const chunk of text.split("\n\n")) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.every((l) => /^[-*]\s+/.test(l))) {
      out.push(
        "<ul>" +
          lines.map((l) => `<li>${esc(l.replace(/^[-*]\s+/, ""))}</li>`).join("") +
          "</ul>",
      );
    } else {
      out.push(`<p>${esc(lines.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

function page(opts: {
  title: string;
  description: string;
  body: string;
  wide?: boolean;
  script?: boolean;
  depth: number;
}): string {
  const up = opts.depth === 0 ? "" : "../";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<meta name="theme-color" content="#1f3a5f">
<link rel="manifest" href="${up}manifest.webmanifest">
<link rel="icon" href="${up}icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${up}icons/icon-192.png">
<link rel="stylesheet" href="${up}style.css">
</head>
<body>
<div class="wrap${opts.wide ? " wrap--wide" : ""}">
${opts.body}
<footer>
<p><strong>${TITLE}</strong> — original card game rules, free to reuse under
<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
<a href="${REPO_URL}">Source and corrections</a>.</p>
</footer>
</div>
${opts.script ? `<script src="${up}app.js"></script>` : ""}
<script>
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("${up}sw.js"));
}
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
    `<p class="sources">Rules verified against ${esc(game.sources_consulted.join(", "))}. ` +
      `This write-up is original text, not reproduced from those sources.</p>`,
  );
  parts.push(`</article>`);

  return page({
    title: `${game.name} — how to play | ${TITLE}`,
    description: `How to play ${game.name}: ${playersLine(game)}, ${durationLine(game)}, ${game.decks}.`,
    body: parts.join("\n"),
    depth: 1,
  });
}

/**
 * A full-text index over every word of every entry.
 *
 * Sixty documents is small enough that the whole index ships to the browser and
 * searching is a loop over an object -- no server, no query API, and it works
 * with no signal like the rest of the app. Terms map to positions in the games
 * array, which is the same order the page renders, so a hit is an array index.
 *
 * Each posting carries a weight and a bitmask of which sections matched, so a
 * result can say WHERE it was found rather than only that it was.
 */
const FIELD = {
  // The primary name outranks an alias by a wide margin. Otherwise Hand and
  // Foot, aliased "Hand and Foot Canasta", ties with Canasta for "canasta" --
  // and then wins on prose, which is exactly backwards.
  name: { bit: 1, weight: 14, label: "name" },
  alias: { bit: 64, weight: 5, label: "other names" },
  tags: { bit: 2, weight: 6, label: "tags" },
  setup: { bit: 4, weight: 1, label: "setup" },
  play: { bit: 8, weight: 2, label: "play" },
  goal_and_scoring: { bit: 16, weight: 1, label: "scoring" },
  variants: { bit: 32, weight: 1, label: "variants" },
} as const;

function tokenise(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{1,}/g) ?? []).map((w) =>
    w.replace(/^-+|-+$/g, ""),
  );
}

function searchIndex(games: CardGame[]): string {
  // term -> docIndex -> field bitmask. The score is a pure function of the
  // mask (each field contributes its weight once), so storing it too would be
  // a third of the index spent on a number the client can derive.
  const terms = new Map<string, Map<number, number>>();

  games.forEach((game, doc) => {
    const fields: [keyof typeof FIELD, string][] = [
      ["name", game.name],
      ["alias", game.aliases.join(" ")],
      ["tags", [...game.tags, categoryLabel(game.category)].join(" ")],
      ["setup", game.setup],
      ["play", game.play],
      ["goal_and_scoring", game.goal_and_scoring],
      ["variants", game.variants.map((v) => `${v.name} ${v.description}`).join(" ")],
    ];

    for (const [field, text] of fields) {
      const { bit } = FIELD[field];
      for (const word of new Set(tokenise(text))) {
        let postings = terms.get(word);
        if (!postings) terms.set(word, (postings = new Map()));
        postings.set(doc, (postings.get(doc) ?? 0) | bit);
      }
    }
  });

  // Words appearing in nearly every entry ("card", "player") cost bytes and
  // rank nothing, so drop them.
  const ubiquitous = Math.floor(games.length * 0.9);
  const out: Record<string, number[]> = {};
  for (const [word, postings] of terms) {
    if (postings.size > ubiquitous) continue;
    // Flattened to [doc, mask, doc, mask, ...]: half the punctuation of an
    // array of pairs, over tens of thousands of postings.
    out[word] = [...postings].flat();
  }

  return JSON.stringify({
    fields: Object.values(FIELD).map((f) => [f.bit, f.weight, f.label]),
    terms: out,
  });
}

/** Only the facets the filters need; kept small because it ships in the page. */
function facetsFor(games: CardGame[]): string {
  return JSON.stringify(
    games.map((g) => {
      const range = /^(\d{1,3})-(\d{1,3})$/.exec(g.duration_minutes);
      return {
        s: [g.name, ...g.aliases, categoryLabel(g.category), ...g.tags]
          .join(" ")
          .toLowerCase(),
        lo: g.players.min,
        hi: g.players.max,
        d: g.equipment.standard_decks,
        max: range?.[2] ? Number(range[2]) : null,
        diff: g.difficulty,
      };
    }),
  );
}

function chipGroup(
  name: string,
  label: string,
  options: [string, string][],
): string {
  return (
    `<div><label>${esc(label)}</label><div class="chips">` +
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

function indexPage(games: CardGame[]): string {
  const body: string[] = [];
  body.push(`<header class="masthead">
<h1>${TITLE}</h1>
<p class="pron">NYE-bee</p>
<p class="blurb">${esc(TAGLINE)} ${games.length} games, written from scratch.
Works offline once loaded.</p>
</header>`);

  body.push(`<div class="filters">
<label for="q">Search</label>
<input id="q" type="search" placeholder="Search every rule — try bower, or slap" autocomplete="off">
${chipGroup("players", "Players", [
  ["", "Any"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"], ["8", "8"],
])}
${chipGroup("decks", "Decks on hand", [["", "Any"], ["1", "1"], ["2", "2"]])}
${chipGroup("minutes", "Time", [["", "Any"], ["15", "≤15 min"], ["30", "≤30 min"], ["60", "≤60 min"]])}
${chipGroup("difficulty", "At most", [
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
    `<script type="application/json" id="facets">${facetsFor(games)}</script>`,
  );

  return page({
    title: `${TITLE} — card game rules that work offline`,
    description: `${TAGLINE} ${games.length} card games, written from scratch and free to reuse.`,
    body: body.join("\n"),
    wide: true,
    script: true,
    depth: 0,
  });
}

// --- build ----------------------------------------------------------------

const games = loadGames();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "games"), { recursive: true });
mkdirSync(join(OUT, "icons"), { recursive: true });

const written: string[] = [];
const write = (relative: string, content: string): void => {
  writeFileSync(join(OUT, relative), content, "utf8");
  written.push(relative);
};

write("index.html", indexPage(games));
write("search-index.json", searchIndex(games));
for (const game of games) write(`games/${game.id}.html`, gamePage(game));

for (const asset of ["style.css", "app.js"]) {
  write(asset, readFileSync(join(ASSETS, asset), "utf8"));
}

for (const icon of readdirSync(join(ASSETS, "icons"))) {
  copyFileSync(join(ASSETS, "icons", icon), join(OUT, "icons", icon));
  written.push(`icons/${icon}`);
}

write(
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
// that there is no reason to be clever about what to keep: install once and the
// entire reference is available with no signal.
const precache = written.filter((f) => !f.endsWith(".webmanifest"));
const version = contentHash(precache.map((f) => readFileSync(join(OUT, f), "utf8")));

write(
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
write(".nojekyll", "");

const bytes = written.reduce(
  (n, f) => n + readFileSync(join(OUT, f)).byteLength,
  0,
);
console.log(
  `Wrote ${written.length + 1} files to docs/ ` +
    `(${games.length} games, ${(bytes / 1024).toFixed(0)} KB uncompressed).`,
);
