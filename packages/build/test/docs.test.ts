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
