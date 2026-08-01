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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { categoryLabel, gamesByCategory, loadGames } from "naibi";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
const contributing = readFileSync(join(REPO_ROOT, "CONTRIBUTING.md"), "utf8");

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

  const pdf = /https:\/\/github\.com\/[\w-]+\/naibi\/raw\/main\/(\S+?\.pdf)/.exec(readme);
  assert.ok(pdf, "no link to the booklet");
  assert.ok(
    existsSync(join(REPO_ROOT, pdf[1]!)),
    `README links ${pdf[1]}, which the PDF build does not produce`,
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
