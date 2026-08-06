/**
 * The README's own facts, checked against the corpus.
 *
 * The README states how many games there are, and breaks them down by family.
 * Those numbers are written by hand and every new entry makes them a little
 * more wrong — which is exactly the kind of quiet staleness the rest of this
 * project generates its way out of. The README is not generated, so it is
 * checked instead.
 *
 * Also checks the links it advertises resolve, since a badge pointing at a
 * renamed file is a broken promise on the front page.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import { PROSE_FIELDS, SCHEMA_PATH, categoryLabel, gamesByCategory, loadGames } from "naibi";
import { isNewer } from "../release.ts";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
const contributing = readFileSync(join(REPO_ROOT, "CONTRIBUTING.md"), "utf8");
const agentGuide = readFileSync(join(REPO_ROOT, "CLAUDE.md"), "utf8");

const headings = (doc: string) =>
  [...doc.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]!.trim());
const games = loadGames();

test("the stated game count is the real one", () => {
  const status = /\*\*Status:\*\* (\d+) games/.exec(readme);
  assert.ok(status, "the Status line no longer states a count");
  assert.equal(
    Number(status[1]),
    games.length,
    "README Status is stale — run through it after adding entries",
  );
});

test("the collection blurb agrees too", () => {
  const blurb = /^(\d+) games, from /m.exec(readme);
  assert.ok(blurb, "the collection section no longer states a count");
  assert.equal(Number(blurb[1]), games.length, "the collection blurb is stale");
});

test("the family table matches how the games actually group", () => {
  const actual = new Map(
    gamesByCategory(games).map(([category, entries]) => [
      categoryLabel(category),
      entries.length,
    ]),
  );

  const stated = new Map<string, number>();
  for (const [, label, count] of readme.matchAll(/^\| ([A-Z][^|]*?) \| (\d+) \|$/gm)) {
    stated.set(label!.trim(), Number(count));
  }

  assert.ok(stated.size > 0, "the family table is gone or has changed shape");

  for (const [label, count] of stated) {
    assert.equal(actual.get(label), count, `${label}: README says ${count}`);
  }
  for (const [label, count] of actual) {
    assert.equal(stated.get(label), count, `${label} (${count}) is missing from the table`);
  }
  assert.equal(
    [...stated.values()].reduce((a, b) => a + b, 0),
    games.length,
    "the family table does not add up to the collection",
  );
});

test("the checked-status ledger matches the corpus", () => {
  // CONTRIBUTING states how many entries were read against their sources, and
  // on which dates. That is the project's own honesty record about originality,
  // and it was written by hand, so every batch of new entries makes it a little
  // more wrong -- which is exactly what happened: it still said "All 60 entries"
  // after twelve more had been added and stamped. The README's counts were
  // already checked here and this one was not, so it drifted silently.
  const stated = new Map<string, number>();
  // "entry" as well as "entries": a pass that read one entry has to be able to
  // say so in English, and the plural-only pattern silently skipped the heading
  // rather than failing on it -- which reads in the diff as a pass nobody
  // recorded rather than as a pattern that could not see it.
  for (const [, count, date] of contributing.matchAll(
    /\*\*(\d+) entr(?:y|ies), checked (\d{4}-\d{2}-\d{2})\*\*/g,
  )) {
    stated.set(date!, Number(count));
  }
  assert.ok(stated.size > 0, "the ledger no longer states entry counts by date");

  const actual = new Map<string, number>();
  for (const game of games) {
    const date = game.checked?.date;
    if (date) actual.set(date, (actual.get(date) ?? 0) + 1);
  }

  const sorted = (m: Map<string, number>) => Object.fromEntries([...m].sort());
  assert.deepEqual(
    sorted(stated),
    sorted(actual),
    "CONTRIBUTING's record of what was checked, and when, no longer matches the entries",
  );

  // The section opens by claiming every entry has been compared against source
  // text. An unstamped entry would leave that claim covering a game nobody read.
  assert.equal(
    [...stated.values()].reduce((a, b) => a + b, 0),
    games.length,
    "the ledger does not account for every entry in the collection",
  );
});

test("how many sources each check had is recorded, and the gap is counted", () => {
  // CONTRIBUTING claims no entry rests on a single source. For a long time that
  // claim had nothing behind it: `sources_consulted` is attribution, lists
  // sources that were never pulled, and is byte-identical before and after the
  // pass that supposedly fixed twelve entries -- so a test of its length would
  // have passed on the day the claim was false, which is worse than no test.
  // `checked.sources` is the field that can answer it, and the entries with no
  // such record are counted here rather than passing quietly: a check whose
  // source count is unknown must not read as a check with enough of them.
  const stated = /\*\*(\d+) of (\d+) checks record which sources they had\*\*/.exec(contributing);
  assert.ok(stated, "CONTRIBUTING no longer states how many checks record their sources");

  const checks = games.filter((game) => game.checked);
  const recorded = checks.filter((game) => game.checked?.sources);

  assert.equal(
    recorded.length,
    Number(stated[1]),
    "CONTRIBUTING's count of checks recording their sources no longer matches the entries",
  );
  assert.equal(
    checks.length,
    Number(stated[2]),
    "CONTRIBUTING's count of checks on record no longer matches the entries",
  );

  // The claim itself, for every entry that can answer it. One source cannot
  // corroborate itself, so a recorded check naming fewer than two is the exact
  // failure the bullet says does not exist.
  const thin = recorded
    .filter((game) => (game.checked?.sources?.length ?? 0) < 2)
    .map((game) => game.id);
  assert.deepEqual(thin, [], "entries recording a check against fewer than two sources");
});

test("the 2026-08-01 pass is described as it was, not as it reads", () => {
  // "pagat and Wikipedia" describes what the pass worked from, and it used to
  // read as though it described every entry in it -- ten attributed only one of
  // the two, so whether those ten ever had a second source was unknown. They
  // were re-read and carry a later date now, which is what lets this say
  // "every one" rather than a count. The reconstruction behind those 38 source
  // records is only sound while that stays true.
  const pass = games.filter((game) => game.checked?.date === "2026-08-01");
  assert.ok(pass.length > 0, "no entry carries the 2026-08-01 check date any more");

  const partial = pass
    .filter((game) => {
      const named = new Set(game.sources_consulted);
      return !named.has("Pagat") || !named.has("Wikipedia");
    })
    .map((game) => game.id);
  assert.deepEqual(
    partial,
    [],
    "2026-08-01 entries attributing only one of pagat/Wikipedia -- the pass description no " +
      "longer holds per entry, so either re-read them or stop claiming both",
  );

  const unrecorded = pass.filter((game) => !game.checked?.sources).map((game) => game.id);
  assert.deepEqual(unrecorded, [], "2026-08-01 entries with no source record");
});

test("nothing built is described as unbuilt", () => {
  // The README said "The site is built and installable" on one line and "The
  // website ... planned but unbuilt" two hundred lines later, and both were
  // true of different moments. Whether a thing exists is a fact on disk, so
  // this is checkable rather than a matter of remembering to edit two places
  // when something ships.
  const claims: [string, string, RegExp][] = [
    ["the website", join("packages", "web", "build-web.ts"), /\bweb ?site\b/i],
    ["the booklet", join("packages", "build", "build-pdf.ts"), /\bbooklet\b|\bPDF\b/],
  ];

  const sections: [string, string][] = [
    ["README.md", readme.slice(readme.indexOf("## Not in scope yet"))],
    ["tools/README.md", readFileSync(join(REPO_ROOT, "tools", "README.md"), "utf8")],
  ];

  for (const [what, path, mentions] of claims) {
    const exists = existsSync(join(REPO_ROOT, path));
    if (!exists) continue;
    for (const [file, section] of sections) {
      // By sentence, with the wrapping flattened first. Both halves of that
      // matter and each was learned by getting it wrong.
      //
      // Flattened, because the defect this exists for spanned two lines --
      // "The website, the mobile app, and the companion tools described in" /
      // "[tools/README.md] are all planned but unbuilt" -- so a line-by-line
      // version passed against the exact sentence it was written to catch.
      //
      // By sentence rather than by paragraph, because a paragraph is too coarse
      // to tell "X is out of scope" from "X is in scope and these others are
      // not". "Out of scope for v1. v1 is the rules data plus the build
      // pipeline that turns it into Markdown and PDF." is correct prose that a
      // paragraph rule reads as calling the booklet unbuilt -- and it passed
      // only because the first version of this fix had deleted that sentence.
      //
      // The weakening accepted: a claim split across two sentences ("The
      // website is described below. It is planned but unbuilt.") is not caught.
      // A rule that fires on correct prose gets loosened or deleted, which
      // catches nothing at all, so the narrower rule is the one that survives.
      const sentences = section
        .split(/\n\s*\n/)
        // The emphasis markers are part of the lookbehind because a bold lead-in
        // ends "for v1.**", and a plain [.!?] boundary keeps it joined to the
        // sentence after it -- which is the whole false positive.
        .flatMap((p) => p.replace(/\s+/g, " ").trim().split(/(?<=[.!?][*_"')\]]*)\s+/))
        .filter(Boolean);
      for (const paragraph of sentences) {
        if (!mentions.test(paragraph)) continue;
        assert.doesNotMatch(
          paragraph,
          // Two shapes, because fixing the first left the second in place. The
          // past participle -- "planned but unbuilt" -- is what the README
          // said. The future tense -- "when the website package gets built" --
          // is the same defect in tools/README.md, and it survived the fix and
          // this test's first version both. "when it is built" about the tools
          // that genuinely are not built stays legal, because that paragraph
          // does not name one of the things above.
          /\b(planned but unbuilt|not built|unbuilt|not started|out of scope)\b|\b(gets|will be|yet to be|has yet to be|is going to be|would be) built\b/i,
          `${file} calls ${what} unbuilt, but ${path} exists:\n  ${paragraph}`,
        );
      }
    }
  }
});

test("every file the README links to exists", () => {
  const missing: string[] = [];

  for (const [, target] of readme.matchAll(/\]\((?!https?:|#|mailto:)([^)#]+)\)/g)) {
    if (!existsSync(join(REPO_ROOT, target!))) missing.push(target!);
  }

  assert.deepEqual(missing, []);
});

test("the badges point at the licence files they name", () => {
  assert.ok(readme.includes("](LICENSE)"), "no link to the text licence");
  assert.ok(readme.includes("](LICENSE-CODE)"), "no link to the code licence");
  assert.ok(existsSync(join(REPO_ROOT, "LICENSE")));
  assert.ok(existsSync(join(REPO_ROOT, "LICENSE-CODE")));
});

test("the site and booklet links are advertised, and agree with the build", () => {
  assert.match(readme, /https:\/\/han-tyumi\.github\.io\/naibi\//, "no link to the site");

  // The booklet is a release asset, so there is no path on disk to check this
  // against. What can be checked is that the name the README asks for is the
  // name the release job attaches: they live in different files, and a rename
  // on either side is a 404 nobody notices until someone clicks it.
  const pdf = /https:\/\/github\.com\/[\w-]+\/naibi\/releases\/latest\/download\/(\S+?\.pdf)/.exec(
    readme,
  );
  assert.ok(pdf, "no link to the booklet");

  const release = readFileSync(join(REPO_ROOT, ".github", "workflows", "release.yml"), "utf8");
  assert.ok(
    release.includes(`/tmp/${pdf[1]}`),
    `README links ${pdf[1]}, which the release workflow does not attach`,
  );
});

test("the CI badge names a workflow that exists", () => {
  const badge = /actions\/workflow\/status\/[\w-]+\/naibi\/([\w.-]+)\?/.exec(readme);
  assert.ok(badge, "no checks badge");
  assert.ok(
    existsSync(join(REPO_ROOT, ".github", "workflows", badge[1]!)),
    `the badge names ${badge[1]}, which is not a workflow`,
  );
});

// --- the two kinds of document --------------------------------------------

test("the README points at both the live guide and the historical records", () => {
  assert.ok(readme.includes("(CONTRIBUTING.md)"), "no link to the contributor guide");
  assert.ok(readme.includes("(decisions/README.md)"), "no link to the decision records");
});

test("no section is written in two documents at once", () => {
  // The README claims nothing is stated in more than one place. Two copies of a
  // rule is two things that can drift, which is the failure this project spends
  // most of its effort avoiding — so the claim is checked rather than trusted.
  const shared = headings(readme).filter((h) => headings(contributing).includes(h));
  assert.deepEqual(shared, [], "these headings appear in both documents");
});

test("the contributor guide covers what a contributor actually needs", () => {
  for (const section of [
    "Adding a game",
    "Which games belong here?",
    "Is it a variant, or its own game?",
    "Style",
    "Checklist before opening a PR",
  ]) {
    assert.ok(
      headings(contributing).includes(section),
      `CONTRIBUTING.md is missing "${section}"`,
    );
  }
});

test("the contributor guide says which kind of document it is", () => {
  // Whether a document is edited in place or superseded is the whole point of
  // separating them, so each says which it is rather than leaving it to be
  // inferred from where it sits.
  assert.ok(contributing.includes("live document"), "CONTRIBUTING does not say it is live");
  assert.ok(
    contributing.includes("decisions/"),
    "CONTRIBUTING does not point at the historical records",
  );
});

test("the contributor guide names the fields the fingerprint actually covers", () => {
  // CONTRIBUTING tells contributors which fields a `checked` date covers, and
  // they act on it: the surrounding paragraph says a purely mechanical move
  // between fields can keep its original date. If that list and PROSE_FIELDS
  // drift apart, the guide is telling people it is safe to keep a date that no
  // longer has cover. A constant cannot be imported into prose, so it is pinned
  // here instead.
  const flat = contributing.replace(/\s+/g, " ");
  const claim = /fingerprint covers ([^.]*?), so /.exec(flat);
  assert.ok(claim, "CONTRIBUTING no longer says which fields the fingerprint covers");

  const named = [...claim[1]!.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]);
  assert.deepEqual(
    named,
    [...PROSE_FIELDS],
    "CONTRIBUTING and PROSE_FIELDS disagree about what a checked date covers",
  );
});

test("every file the contributor guide links to exists", () => {
  const missing: string[] = [];
  for (const [, target] of contributing.matchAll(/\]\((?!https?:|#|mailto:)([^)#]+)\)/g)) {
    if (!existsSync(join(REPO_ROOT, target!))) missing.push(target!);
  }
  assert.deepEqual(missing, []);
});

test("the worked entry example validates against the real schema", () => {
  // The guide's data-format example claims to be a complete, valid entry. That
  // claim went stale once already: extra_deck_for_large_groups stayed in the
  // JSON block for a session after the field was renamed to decks_by_players,
  // and only reading the block by eye caught it -- the gate never looked. This
  // runs the fenced block through the same Ajv schema validate.ts compiles for
  // the corpus, so a stale or invalid field in the example fails the gate
  // instead of waiting to be noticed.
  const candidates = [...contributing.matchAll(/```json\n([\s\S]*?)\n```/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1]!) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((data): data is Record<string, unknown> => data !== null && "setup" in data);

  assert.equal(
    candidates.length,
    1,
    "expected exactly one complete worked entry (object with a setup field) in CONTRIBUTING.md",
  );

  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  const valid = validate(candidates[0]);
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || "(root)"}: ${e.message}`,
  );
  assert.deepEqual(errors, [], "the worked example no longer validates against game.schema.json");
  assert.ok(valid);
});

test("no section is buried under a heading it has nothing to do with", () => {
  // Splitting the README concatenated blocks in an order that left "Tests" and
  // "Types come from the schema" trailing the copyright section, so they read as
  // part of it. Nothing failed; the document just quietly said something untrue
  // about its own structure. Cheap to check, invisible otherwise.
  const sections = new Map<string, string[]>();
  let current = "";
  for (const line of contributing.split("\n")) {
    const h2 = /^## (.+)$/.exec(line);
    const h3 = /^### (.+)$/.exec(line);
    if (h2) sections.set((current = h2[1]!.trim()), []);
    else if (h3 && current) sections.get(current)!.push(h3[1]!.trim());
  }

  assert.ok(sections.size >= 3, "the guide has collapsed into one section");
  for (const [heading, children] of sections) {
    assert.ok(
      children.length <= 6,
      `"${heading}" has ${children.length} subsections — likely a split gone wrong`,
    );
  }
});

// --- the agent guide ------------------------------------------------------

test("every command CLAUDE.md names actually exists", () => {
  // It loads into every session and is followed without being questioned, so a
  // command that has been renamed sends an agent down a path that does not work.
  const scripts = Object.keys(
    JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts,
  );

  const missing: string[] = [];
  for (const [, script] of agentGuide.matchAll(/`npm run ([a-z-]+)/g)) {
    if (!scripts.includes(script!)) missing.push(script!);
  }
  assert.deepEqual(missing, []);
});

/** Gitignored paths are absent from a fresh clone by design, not by mistake. */
function ignored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "--quiet", path], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

test("every path CLAUDE.md names actually exists", () => {
  // Gitignored paths are exempt: .sources/ is named because an agent needs to
  // know what it is and that it must never be committed, and it is absent from
  // a clean checkout precisely because that rule is working. Checking existence
  // without this passed locally and failed CI — which is the discipline this
  // very file tells agents to follow, broken in the commit that added it.
  const missing: string[] = [];
  for (const [, path] of agentGuide.matchAll(/`([\w.-]+\/[\w./-]*)`/g)) {
    if (!existsSync(join(REPO_ROOT, path!)) && !ignored(path!)) missing.push(path!);
  }
  assert.deepEqual(missing, []);
});

test("CLAUDE.md points at the other documents instead of restating them", () => {
  for (const doc of ["README.md", "CONTRIBUTING.md", "decisions/README.md"]) {
    assert.ok(agentGuide.includes(`(${doc})`), `CLAUDE.md does not link ${doc}`);
  }

  // Same anti-drift rule the live documents are held to.
  const shared = headings(agentGuide).filter((h) => headings(contributing).includes(h));
  assert.deepEqual(shared, [], "CLAUDE.md duplicates CONTRIBUTING sections");
});

test("CLAUDE.md stays short enough to be read", () => {
  // It is prepended to every session. Past a point it stops being instructions
  // and becomes background noise that gets skimmed.
  const words = agentGuide.split(/\s+/).length;
  assert.ok(words < 900, `${words} words — trim it or move detail into a skill`);
});

test("every repo skill is shaped so it can be loaded", () => {
  const skills = join(REPO_ROOT, ".claude", "skills");
  if (!existsSync(skills)) return;

  for (const name of readdirSync(skills)) {
    const file = join(skills, name, "SKILL.md");
    assert.ok(existsSync(file), `${name}: no SKILL.md`);

    const body = readFileSync(file, "utf8");
    const front = /^---\n([\s\S]*?)\n---/.exec(body);
    assert.ok(front, `${name}: no frontmatter`);
    assert.match(front[1]!, new RegExp(`name: ${name}\\b`), `${name}: name disagrees`);

    const description = /description: (.+)/.exec(front[1]!);
    assert.ok(description, `${name}: no description`);
    // The description is the only thing deciding whether the skill gets loaded.
    assert.ok(description[1]!.length > 60, `${name}: description too vague to match on`);
  }
});

test("every browser asset is actually type-checked", () => {
  // The browser assets were unchecked for months without it showing: `allowJs`
  // let the .ts files import them, `checkJs` was off, and a green typecheck
  // looked like it covered the repository. Turning it on found two real bugs,
  // so the thing worth guarding is that it stays on and keeps reaching every
  // file — a second config is easy to leave behind.
  const config = readFileSync(join(REPO_ROOT, "tsconfig.web.json"), "utf8");

  assert.match(config, /"checkJs":\s*true/, "checkJs is no longer on");
  assert.match(config, /"lib":\s*\[[^\]]*"dom"/, "the DOM lib is no longer available");

  const include = /"include":\s*\[([^\]]*)\]/.exec(config);
  assert.ok(include, "tsconfig.web.json no longer says what it covers");
  const globs = [...include[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

  const dir = join(REPO_ROOT, "packages", "web", "assets");
  const assets = readdirSync(dir).filter((name) => name.endsWith(".js"));
  assert.ok(assets.length > 0, "no browser assets found to check");

  for (const name of assets) {
    const covered = globs.some((glob) => {
      const pattern = new RegExp(`^${glob.replace(/\./g, "\\.").replace(/\*/g, "[^/]*")}$`);
      return pattern.test(`packages/web/assets/${name}`);
    });
    assert.ok(covered, `packages/web/assets/${name} is not covered by tsconfig.web.json`);
  }

  // And that the gate runs it. A config nothing invokes checks nothing.
  const scripts = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts;
  assert.match(scripts.typecheck, /tsconfig\.web\.json/, "typecheck skips the browser assets");
  assert.match(scripts.check, /typecheck/, "the gate no longer typechecks");
});

// --- versioning -----------------------------------------------------------

const changelog = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8");

/** Every released version in the changelog, newest first. */
const releases = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\][^\n]*?(\d{4}-\d{2}-\d{2})/gm)].map(
  (m) => ({ version: m[1]!, date: m[2]! }),
);

test("the changelog's newest release is the version the package claims", () => {
  // The version reaches the booklet's cover and the release asset, so a
  // changelog naming a different one is a released artifact mislabelled.
  const manifest = JSON.parse(
    readFileSync(join(REPO_ROOT, "packages", "data", "package.json"), "utf8"),
  );
  assert.ok(releases.length > 0, "the changelog lists no releases");
  assert.equal(
    releases[0]!.version,
    manifest.version,
    "CHANGELOG.md and packages/data/package.json disagree about the version",
  );
});

test("the version has one home, and everything else is told", () => {
  // Two numbers that could drift eventually do. The private packages carry
  // 0.0.0 precisely so nobody reads a meaning into them.
  for (const dir of ["packages/build", "packages/web", "."]) {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, dir, "package.json"), "utf8"));
    assert.equal(manifest.private, true, `${dir} is not marked private`);
    assert.equal(manifest.version, "0.0.0", `${dir} carries a version that means nothing`);
  }
});

test("releases are listed newest first and dated", () => {
  for (const [i, release] of releases.entries()) {
    assert.ok(
      !Number.isNaN(Date.parse(release.date)),
      `${release.version} has an unparseable date`,
    );
    if (i === 0) continue;
    // Compared by the same function the release script uses, rather than by a
    // second implementation written here -- which is what this line used to be,
    // and it was wrong in a way that would have blocked every minor release.
    assert.ok(
      isNewer(releases[i - 1]!.version, release.version),
      `${releases[i - 1]!.version} is not newer than ${release.version}`,
    );
  }
});

test("the published package tells consumers which Node it needs", () => {
  // Its entry point is a .ts file the runtime strips types from itself. On an
  // older Node that is a syntax error with nothing at all to explain it.
  const manifest = JSON.parse(
    readFileSync(join(REPO_ROOT, "packages", "data", "package.json"), "utf8"),
  );
  assert.ok(manifest.engines?.node, "packages/data states no Node requirement");
  assert.match(manifest.exports["."], /\.ts$/, "the entry point is no longer TypeScript");
});

test("everything that names a Node version names the same one", () => {
  // The floor is stated in seven places and was tested in one: that `engines`
  // exists. Bumping it would have left the README, CLAUDE.md, tsconfig's note
  // and both workflows behind, and the workflows are the ones that matter --
  // CI pins the floor on purpose so the oldest supported Node is what gets
  // verified. Drift there means CI quietly stops testing what we promise.
  // `decisions/` is excluded: those records are written once and superseded,
  // so an old version named in one is history, not a stale claim.
  const engines = JSON.parse(
    readFileSync(join(REPO_ROOT, "packages", "data", "package.json"), "utf8"),
  ).engines.node;
  const floor = /(\d+\.\d+)/.exec(engines)?.[1];
  assert.ok(floor, `packages/data engines "${engines}" states no version to check against`);

  const named: { where: string; version: string }[] = [];

  // Manifests are parsed rather than searched: `@types/node` carries a version
  // of its own and has nothing to do with the runtime floor.
  for (const where of ["package.json", "packages/build/package.json"]) {
    const declared = JSON.parse(readFileSync(join(REPO_ROOT, where), "utf8")).engines?.node;
    if (declared) named.push({ where, version: /(\d+\.\d+)/.exec(declared)![1]! });
  }

  // Prose says it in words; workflows say it in a field.
  for (const where of ["README.md", "CLAUDE.md", "CONTRIBUTING.md", "tsconfig.json"]) {
    const text = readFileSync(join(REPO_ROOT, where), "utf8");
    for (const [, version] of text.matchAll(/[Nn]ode (\d+\.\d+)/g)) {
      named.push({ where, version: version! });
    }
  }
  for (const file of readdirSync(join(REPO_ROOT, ".github", "workflows"))) {
    const where = `.github/workflows/${file}`;
    const text = readFileSync(join(REPO_ROOT, where), "utf8");
    for (const [, version] of text.matchAll(/node-version:\s*"?(\d+\.\d+)"?/g)) {
      named.push({ where, version: version! });
    }
  }

  assert.ok(named.length > 1, "nothing outside packages/data names a Node version any more");
  const wrong = named.filter((n) => n.version !== floor);
  assert.deepEqual(
    wrong,
    [],
    `these name a Node version other than the ${floor} floor in packages/data`,
  );
});

test("nothing reaches readers without passing first", () => {
  // CLAUDE.md now claims the site and the releases both wait on Validate. That
  // claim was false until today: Pages built from the branch, so it deployed in
  // parallel with the tests -- on one commit the deploy started a second before
  // they did. If either workflow stops waiting, the claim silently becomes a
  // lie again, and the symptom is a red commit on a site people read offline.
  const workflows = join(REPO_ROOT, ".github", "workflows");

  for (const name of ["deploy.yml", "release.yml"]) {
    const body = readFileSync(join(workflows, name), "utf8");
    assert.match(body, /workflow_run:/, `${name} no longer waits for anything`);
    assert.match(body, /workflows: \["Validate"\]/, `${name} does not wait on Validate`);
    assert.match(
      body,
      /workflow_run\.conclusion == 'success'/,
      `${name} does not check that Validate passed`,
    );
  }

  // And that what readers get is the gated copy rather than a rebuild.
  //
  // The deploy composes a `site` branch now, so it can serve branch previews at
  // a subpath alongside the published site. That moved the shape of these
  // assertions but not the property they exist for: production content is
  // still the committed docs/ from a commit that passed, never something built
  // during the deploy, because a rebuild there is a second opinion about what
  // the corpus renders to and only one of the two is gated.
  const deploy = readFileSync(join(workflows, "deploy.yml"), "utf8");
  assert.match(deploy, /cp -r source\/docs/, "production no longer ships the committed docs/");
  assert.match(deploy, /path: site/, "the deploy publishes something other than the composed site");
  assert.ok(
    !/npm run web/.test(deploy),
    "the deploy rebuilds the site instead of shipping the gated copy",
  );

  // A rebuild is permitted for previews and nowhere else, and it must write
  // somewhere that is not docs/ -- the published site is not a preview's to
  // touch, and docs/ is gated against the corpus.
  for (const build of deploy.match(/node packages\/web\/build-web\.ts[^\n]*/g) ?? []) {
    assert.match(build, /--preview /, `the deploy builds the real site: ${build}`);
    assert.doesNotMatch(build, /docs/, `a deploy-time build writes into docs/: ${build}`);
  }

  // Previews are published to this origin, so a fork's pull request must never
  // be able to run this job.
  assert.match(
    deploy,
    /head_repository\.full_name == github\.repository/,
    "the deploy would publish a fork's branch to this origin",
  );
});

test("a preview leaves exactly one comment, edited rather than repeated", () => {
  // The preview URL used to exist only in the run's step summary, three clicks
  // into the Actions tab. It goes on the pull request now -- but a workflow
  // that comments on every push is a workflow people mute, so it upserts: find
  // the marked comment, edit it, or create one if there is none.
  const workflows = join(REPO_ROOT, ".github", "workflows");
  const deploy = readFileSync(join(workflows, "deploy.yml"), "utf8");
  const cleanup = readFileSync(join(workflows, "preview-cleanup.yml"), "utf8");

  const MARKER = "<!-- naibi-preview -->";
  for (const [name, body] of [["deploy.yml", deploy], ["preview-cleanup.yml", cleanup]]) {
    assert.ok(body!.includes(MARKER), `${name} cannot find its own comment to edit`);
    assert.match(body!, /pull-requests: write/, `${name} cannot comment`);
  }

  // Both halves of the upsert have to be there. With only the create it
  // comments on every push; with only the edit the first one never appears.
  assert.match(deploy, /-X PATCH/, "the deploy never edits, so it comments on every push");
  assert.match(deploy, /-X POST/, "the deploy never creates the first comment");

  // Only previews, and only when there is somewhere to put it.
  const step = deploy.slice(deploy.indexOf("Leave the preview link"));
  assert.match(step, /if: steps\.slot\.outputs\.preview == 'true'/, "main would comment too");
  assert.match(step, /nothing to comment on/, "a branch with no pull request would fail");

  // The cleanup edits rather than deletes: a comment that vanishes when a
  // preview is removed reads as something having gone wrong.
  assert.match(cleanup, /-X PATCH/, "the cleanup does not retire the comment");
  assert.doesNotMatch(cleanup, /-X DELETE/, "the cleanup deletes the comment instead of editing it");
});

test("the preview cleanup edits the branch and deploys nothing", () => {
  // Its first run failed in two seconds without reaching a runner. It declared
  // the github-pages environment, which only the default branch may deploy to,
  // and a pull_request event does not run there -- so the job was rejected at
  // the gate. Not deploying is also the better shape: the next Deploy publishes
  // the branch as it then stands, and after a merge that follows on its own.
  // Comments stripped first: the file explains in prose why it does not ask for
  // `pages: write`, and a test that greps the whole file would fail on the
  // explanation. This checks configuration, not what the configuration says
  // about itself -- which it caught on its own first run.
  const cleanup = readFileSync(join(REPO_ROOT, ".github", "workflows", "preview-cleanup.yml"), "utf8")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

  assert.doesNotMatch(cleanup, /environment:/, "the cleanup declares an environment again");
  assert.doesNotMatch(cleanup, /deploy-pages/, "the cleanup deploys");
  assert.doesNotMatch(cleanup, /upload-pages-artifact/, "the cleanup uploads a Pages artifact");

  // Least privilege follows from that: it writes one branch and nothing else.
  assert.match(cleanup, /permissions:\s*\n(\s*#[^\n]*\n)*\s*contents: write\s*\n/,
    "the cleanup asks for permissions beyond writing the branch");
  assert.doesNotMatch(cleanup, /pages: write/, "the cleanup still asks for pages: write");
  assert.doesNotMatch(cleanup, /id-token: write/, "the cleanup still asks for id-token: write");

  // It must still take turns with the deploy: pushing to `site` while a deploy
  // has it cloned makes that deploy's push fail.
  assert.match(cleanup, /group: pages/, "the cleanup can race a deploy's push");

  // And a fork's branch never had a preview to remove.
  assert.match(cleanup, /head\.repo\.full_name == github\.repository/);
});

test("the plugin the guide names is the plugin the repo enables", () => {
  // CONTRIBUTING tells contributors what .claude/ turns on for them. A rename
  // or a removal there is invisible -- the plugin simply stops loading, and the
  // guide goes on describing a session nobody is getting.
  const settings = JSON.parse(
    readFileSync(join(REPO_ROOT, ".claude", "settings.json"), "utf8"),
  );
  const enabled = Object.entries(settings.enabledPlugins ?? {})
    .filter(([, on]) => on !== false)
    .map(([id]) => id);

  assert.ok(enabled.length > 0, ".claude/settings.json enables no plugins");
  for (const id of enabled) {
    const [name] = id.split("@");
    assert.match(
      contributing,
      new RegExp(name!, "i"),
      `${id} is enabled but the contributor guide never mentions it`,
    );
  }
});

test("the schema does not name the prose fields it cannot keep up with", () => {
  // The `checked` descriptions used to say the fingerprint covered "setup +
  // play + goal_and_scoring". They went on saying it after `background` joined
  // PROSE_FIELDS, so the schema — which is the document contributors read to
  // learn what a stamp means — understated its own cover by a field. A schema
  // description cannot import a constant, so the fix was to stop enumerating
  // and point at PROSE_FIELDS; this is what stops the enumeration coming back.
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as {
    properties: { checked: { description: string; properties: Record<string, { description: string }> } };
  };
  const checked = schema.properties.checked;
  const said = [checked.description, ...Object.values(checked.properties).map((p) => p.description)];

  for (const description of said) {
    const named = PROSE_FIELDS.filter((field) => description.includes(field));
    assert.deepEqual(
      named,
      [],
      `the checked schema names ${named.join(", ")}, which is a list that has already gone stale once`,
    );
  }

  // And it still points somewhere a reader can follow.
  assert.ok(
    said.some((description) => description.includes("PROSE_FIELDS")),
    "the checked schema no longer says where the real list lives",
  );
});
