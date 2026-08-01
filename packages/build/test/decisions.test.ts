/**
 * The decision records.
 *
 * These exist so the reasoning behind the project survives without being
 * reconstructed from the code, which only works if they stay consistent — a
 * record nobody can find, or an index that has fallen behind the directory, is
 * the same as no record. The rest of this project gates its generated output
 * against going stale; hand-written documentation gets the cheap version of the
 * same treatment.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../../decisions", import.meta.url));

const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".md") && name !== "README.md")
  .sort();

const read = (name: string) => readFileSync(join(DIR, name), "utf8");
const index = read("README.md");

// MADR's set. "Rejected" earns its place: the next person to have the idea
// deserves to find out it was already weighed.
const STATUSES = ["Proposed", "Accepted", "Rejected", "Deprecated", "Superseded"];

test("there are records to check", () => {
  assert.ok(files.length > 0, "no decision records found");
});

test("every record is named and numbered the same way", () => {
  for (const name of files) {
    assert.match(name, /^\d{4}-[a-z0-9-]+\.md$/, `${name}: unexpected filename`);
  }
});

test("numbering starts at one and has no gaps or duplicates", () => {
  // A gap means a record was deleted rather than superseded, which loses the
  // thing these are for: what was believed at the time, and why it changed.
  const numbers = files.map((name) => Number(name.slice(0, 4)));
  assert.deepEqual(
    numbers,
    numbers.map((_, i) => i + 1),
    "numbering is not contiguous from 0001",
  );
});

test("a record's heading matches its filename", () => {
  for (const name of files) {
    const heading = /^# (\d{4})\. (.+)$/m.exec(read(name));
    assert.ok(heading, `${name}: no "# NNNN. Title" heading`);
    assert.equal(heading[1], name.slice(0, 4), `${name}: heading number disagrees`);
    assert.ok(heading[2]!.length > 8, `${name}: title is too short to mean anything`);
  }
});

test("every record carries a known status and a date", () => {
  for (const name of files) {
    const body = read(name);
    const status = /\*\*Status:\*\* (\w+)/.exec(body);
    assert.ok(status, `${name}: no status`);
    assert.ok(STATUSES.includes(status[1]!), `${name}: unknown status "${status[1]}"`);
    assert.match(body, /\*\*Date:\*\* \d{4}-\d{2}-\d{2}/, `${name}: no date`);
  }
});

test("every record has all three sections", () => {
  // Consequences is the one that gets dropped, and dropping it turns a record
  // into advocacy — a decision with no stated cost has not been thought through.
  for (const name of files) {
    const body = read(name);
    for (const section of [
      "## Context",
      "## Considered options",
      "## Decision",
      "## Consequences",
    ]) {
      assert.ok(body.includes(section), `${name}: missing ${section}`);
    }
    const consequences = body.slice(body.indexOf("## Consequences"));
    assert.ok(consequences.length > 200, `${name}: Consequences is a stub`);

    // A record that lists one option has not considered anything.
    const options = body.slice(
      body.indexOf("## Considered options"),
      body.indexOf("## Decision"),
    );
    assert.ok(
      (options.match(/^- /gm) ?? []).length >= 2,
      `${name}: Considered options names fewer than two`,
    );
    assert.match(options, /[Rr]ejected/, `${name}: nothing was rejected, so nothing was weighed`);
  }
});

test("a superseded record says what replaced it", () => {
  for (const name of files) {
    const body = read(name);
    if (!/\*\*Status:\*\* Superseded/.test(body)) continue;
    assert.match(
      body,
      /Superseded by \[?\d{4}/,
      `${name}: superseded but does not name its replacement`,
    );
  }
});

test("the index lists every record, and nothing that does not exist", () => {
  for (const name of files) {
    assert.ok(index.includes(`(${name})`), `${name} is not linked from the index`);
  }
  for (const [, linked] of index.matchAll(/\((\d{4}-[a-z0-9-]+\.md)\)/g)) {
    assert.ok(files.includes(linked!), `the index links ${linked}, which does not exist`);
  }
});

test("the index agrees with each record's own status", () => {
  for (const name of files) {
    const own = /\*\*Status:\*\* (\w+)/.exec(read(name))![1];
    const row = new RegExp(`\\(${name}\\)[^|]*\\|[^|]*\\|\\s*(\\w+)\\s*\\|`).exec(index);
    assert.ok(row, `${name}: no index row`);
    assert.equal(row[1], own, `${name}: index says ${row[1]}, record says ${own}`);
  }
});
