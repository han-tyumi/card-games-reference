/**
 * The prose convention: blank lines separate blocks, "- " makes a bullet.
 *
 * The PDF once rendered every list as a run-on paragraph, because it had its own
 * copy of this and the copy did not parse bullets. There is one parser now, and
 * these are the cases both renderers depend on.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { blocks } from "naibi";

test("a single paragraph", () => {
  assert.deepEqual(blocks("Deal thirteen cards to each player."), [
    { kind: "paragraph", text: "Deal thirteen cards to each player." },
  ]);
});

test("soft-wrapped lines are one paragraph, joined with a space", () => {
  assert.deepEqual(blocks("Deal thirteen cards\nto each player."), [
    { kind: "paragraph", text: "Deal thirteen cards to each player." },
  ]);
});

test("a blank line starts a new paragraph", () => {
  assert.deepEqual(blocks("First.\n\nSecond."), [
    { kind: "paragraph", text: "First." },
    { kind: "paragraph", text: "Second." },
  ]);
});

test("a run of dashed lines is a list", () => {
  assert.deepEqual(blocks("- Ace high\n- King next\n- Two lowest"), [
    { kind: "list", items: ["Ace high", "King next", "Two lowest"] },
  ]);
});

test("asterisks are bullets too", () => {
  assert.deepEqual(blocks("* One\n* Two"), [{ kind: "list", items: ["One", "Two"] }]);
});

test("a paragraph and a list can follow one another", () => {
  assert.deepEqual(blocks("Scoring:\n\n- Ten each\n- Fifty for a run"), [
    { kind: "paragraph", text: "Scoring:" },
    { kind: "list", items: ["Ten each", "Fifty for a run"] },
  ]);
});

test("a chunk that mixes bullets and prose is prose", () => {
  // All-or-nothing on purpose: guessing where the list begins is how a stray
  // bullet ends up in the middle of a sentence.
  assert.deepEqual(blocks("Scoring:\n- Ten each"), [
    { kind: "paragraph", text: "Scoring: - Ten each" },
  ]);
});

test("a hyphen inside a sentence is not a bullet", () => {
  assert.deepEqual(blocks("Trick-taking, two-handed."), [
    { kind: "paragraph", text: "Trick-taking, two-handed." },
  ]);
});

test("a dash with no space after it is not a bullet either", () => {
  assert.deepEqual(blocks("-7 points"), [{ kind: "paragraph", text: "-7 points" }]);
});

test("blank lines at the edges produce no empty blocks", () => {
  assert.deepEqual(blocks("\n\nOnly this.\n\n\n"), [
    { kind: "paragraph", text: "Only this." },
  ]);
});

test("a line of whitespace separates as well as an empty one", () => {
  assert.deepEqual(blocks("First.\n   \nSecond."), [
    { kind: "paragraph", text: "First." },
    { kind: "paragraph", text: "Second." },
  ]);
});

test("empty text produces nothing", () => {
  assert.deepEqual(blocks(""), []);
  assert.deepEqual(blocks("   \n  "), []);
});

test("indentation is trimmed from bullets and their text", () => {
  assert.deepEqual(blocks("  -   Ace high\n  - King next"), [
    { kind: "list", items: ["Ace high", "King next"] },
  ]);
});
