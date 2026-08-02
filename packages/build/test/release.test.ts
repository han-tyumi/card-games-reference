/**
 * Cutting a release.
 *
 * The whole point of the script is that a release is one decision and not five
 * edits, so what has to be right is the four things it derives from that
 * decision: the version, where the notes move to, what the compare links point
 * at, and that it refuses to publish notes nobody wrote.
 *
 * The last one is the one worth having. A release whose body is a blank line is
 * the paper version of a check that passes by looking at nothing, and it is
 * exactly what an automated bump would produce on a quiet week.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { latestRelease, nextVersion, rewriteChangelog } from "../release.ts";

const changelog = (unreleased: string, releases = ""): string =>
  `# Changelog\n\nPreamble.\n\n## [Unreleased]\n${unreleased}${releases}\n` +
  `[Unreleased]: https://github.com/han-tyumi/naibi/compare/v0.1.0...HEAD\n` +
  `[0.1.0]: https://github.com/han-tyumi/naibi/releases/tag/v0.1.0\n`;

const existing = "\n## [0.1.0] — 2026-08-02\n\n- The first one.\n\n";

// --- versions -------------------------------------------------------------

test("a bump moves exactly one number and zeroes what follows it", () => {
  assert.equal(nextVersion("0.1.0", "patch"), "0.1.1");
  assert.equal(nextVersion("0.1.0", "minor"), "0.2.0");
  assert.equal(nextVersion("0.1.9", "minor"), "0.2.0", "the patch is not carried over");
  assert.equal(nextVersion("0.9.3", "major"), "1.0.0");
  assert.equal(nextVersion("1.2.3", "minor"), "1.3.0");
});

test("reaching 1.0.0 is asked for, never accumulated", () => {
  // 0.x means breaking changes may land in a minor, so nothing about a bump
  // decides on its own that the schema has stopped moving.
  let version = "0.1.0";
  for (let i = 0; i < 20; i++) version = nextVersion(version, "minor");
  assert.equal(version, "0.21.0");
});

test("a version it cannot parse is refused rather than guessed at", () => {
  for (const bad of ["1.0", "v1.0.0", "1.0.0-beta", "", "x.y.z"]) {
    assert.throws(() => nextVersion(bad, "patch"), /not a version/, `${bad} was accepted`);
  }
});

// --- notes ----------------------------------------------------------------

test("an empty Unreleased section stops the release", () => {
  // The failure this prevents is a published release whose notes are a blank
  // line -- which is what any bump-on-every-commit scheme produces by default.
  for (const empty of ["\n", "\n\n", "\n   \n"]) {
    assert.throws(
      () => rewriteChangelog(changelog(empty, existing), "0.2.0", "2026-09-01"),
      /empty/,
      `${JSON.stringify(empty)} was treated as notes`,
    );
  }
});

test("no Unreleased section at all is an error, not a silent no-op", () => {
  assert.throws(
    () => rewriteChangelog("# Changelog\n\n## [0.1.0] — 2026-08-02\n", "0.2.0", "2026-09-01"),
    /no `## \[Unreleased\]`/,
  );
});

test("the notes move under a dated heading and Unreleased is left empty", () => {
  const out = rewriteChangelog(
    changelog("\n### Added\n\n- A thing.\n\n", existing),
    "0.2.0",
    "2026-09-01",
  );

  assert.match(out, /## \[0\.2\.0\] — 2026-09-01/);
  assert.match(out, /## \[0\.2\.0\][^\n]*\n\n### Added\n\n- A thing\./);

  // Nothing left under Unreleased, and the previous release still below.
  const between = out.slice(out.indexOf("## [Unreleased]"), out.indexOf("## [0.2.0]"));
  assert.equal(between.replace("## [Unreleased]", "").trim(), "", "Unreleased was not emptied");
  assert.match(out, /## \[0\.1\.0\] — 2026-08-02/, "the previous release was dropped");
  assert.ok(out.indexOf("## [0.2.0]") < out.indexOf("## [0.1.0]"), "newest is not first");
});

test("the notes are not duplicated between the two headings", () => {
  const out = rewriteChangelog(changelog("\n- Only once.\n\n", existing), "0.2.0", "2026-09-01");
  assert.equal(out.split("- Only once.").length - 1, 1);
});

// --- links ----------------------------------------------------------------

test("Unreleased compares against the new tag, and the release against the old", () => {
  const out = rewriteChangelog(changelog("\n- A thing.\n\n", existing), "0.2.0", "2026-09-01");

  assert.match(out, /\[Unreleased\]: \S+\/compare\/v0\.2\.0\.\.\.HEAD/);
  assert.match(out, /\[0\.2\.0\]: \S+\/compare\/v0\.1\.0\.\.\.v0\.2\.0/);
  assert.match(out, /\[0\.1\.0\]: \S+\/releases\/tag\/v0\.1\.0/, "older links were disturbed");
});

test("the first release links its tag, having nothing to compare against", () => {
  const first =
    "# Changelog\n\n## [Unreleased]\n\n- The first one.\n\n" +
    "[Unreleased]: https://github.com/han-tyumi/naibi/compare/v0.0.0...HEAD\n";
  const out = rewriteChangelog(first, "0.1.0", "2026-08-02");

  assert.equal(latestRelease(first), null, "the fixture already had a release");
  assert.match(out, /\[0\.1\.0\]: \S+\/releases\/tag\/v0\.1\.0/);
  assert.doesNotMatch(out, /\[0\.1\.0\]: \S+\/compare/);
});

test("the result is what the release workflow reads back", () => {
  // The workflow takes the notes by scanning from the version's heading to the
  // next heading or the link definitions. If this file and that awk disagree
  // the release publishes the wrong body, and neither side would notice.
  const out = rewriteChangelog(changelog("\n- A thing.\n\n", existing), "0.2.0", "2026-09-01");

  const lines = out.split("\n");
  const from = lines.findIndex((l) => l.startsWith("## [0.2.0]"));
  const rest = lines.slice(from + 1);
  const to = rest.findIndex((l) => l.startsWith("## ") || l.startsWith("["));
  const notes = rest.slice(0, to === -1 ? undefined : to).join("\n").trim();

  assert.equal(notes, "- A thing.");
  assert.equal(latestRelease(out), "0.2.0");
});
