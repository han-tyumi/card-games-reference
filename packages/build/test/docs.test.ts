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

import { categoryLabel, gamesByCategory, loadGames } from "naibi";

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
  for (const [, count, date] of contributing.matchAll(
    /\*\*(\d+) entries, checked (\d{4}-\d{2}-\d{2})\*\*/g,
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

test("every file the contributor guide links to exists", () => {
  const missing: string[] = [];
  for (const [, target] of contributing.matchAll(/\]\((?!https?:|#|mailto:)([^)#]+)\)/g)) {
    if (!existsSync(join(REPO_ROOT, target!))) missing.push(target!);
  }
  assert.deepEqual(missing, []);
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
    const [a, b] = [releases[i - 1]!.version, release.version].map((v) =>
      v.split(".").map(Number),
    );
    const newer = a!.some((n, j) => n > b![j]!) && !a!.some((n, j) => n < b![j]!);
    assert.ok(newer, `${releases[i - 1]!.version} is not newer than ${release.version}`);
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
