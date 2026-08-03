/**
 * Cutting a release.
 *
 * Nobody cuts a release here, so everything the script infers has to be right:
 * the bump it reads out of the commit subjects, the version that follows, where
 * the notes move to, and what the compare links end up pointing at.
 *
 * Two of these matter more than the rest, because they are what stops an
 * automatic release from being a worthless one. A push of nothing but
 * housekeeping must release nothing, or the version counts pushes instead of
 * describing compatibility. And a subject with no prefix must still count for
 * something, or a batch of sloppily-labelled work releases nothing at all and
 * explains nothing — the silent failure this project keeps finding elsewhere.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bumpFromCommits,
  isNewer,
  latestRelease,
  nextVersion,
  notesFromCommits,
  readCommit,
  rewriteChangelog,
} from "../release.ts";

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

// --- reading commits ------------------------------------------------------

test("a conventional subject is read into a type, a bump and its text", () => {
  assert.deepEqual(readCommit("feat: add Piquet"), {
    type: "feat",
    breaking: false,
    subject: "add Piquet",
    bump: "minor",
  });
  assert.deepEqual(readCommit("fix(web): stop the filter lying"), {
    type: "fix",
    breaking: false,
    subject: "stop the filter lying",
    bump: "patch",
  });
  assert.equal(readCommit("chore: bump the lockfile").bump, null);
});

test("a breaking change is a major however it is written", () => {
  assert.equal(readCommit("feat!: drop the decks field").bump, "major");
  assert.equal(readCommit("fix(schema)!: rename a category").bump, "major");
  // Even a type that earns nothing on its own.
  assert.equal(readCommit("chore!: drop Node 22").bump, "major");
});

test("a subject with no prefix counts as a patch rather than vanishing", () => {
  // The alternative is a batch of sloppily-labelled work releasing nothing and
  // explaining nothing, which is the silent failure this repo keeps finding.
  const change = readCommit("Stop the booklet's cover reading the clock");
  assert.equal(change.type, "other");
  assert.equal(change.bump, "patch");
  assert.equal(change.subject, "Stop the booklet's cover reading the clock");

  // An unrecognised type is the same case, not a crash.
  assert.equal(readCommit("wibble: something").bump, "patch");
});

test("the largest bump in a batch wins", () => {
  assert.equal(bumpFromCommits(["fix: a", "feat: b", "fix: c"]), "minor");
  assert.equal(bumpFromCommits(["fix: a", "feat!: b", "feat: c"]), "major");
  assert.equal(bumpFromCommits(["fix: a", "fix: b"]), "patch");
});

test("housekeeping alone releases nothing", () => {
  // Without this the version counts pushes instead of describing compatibility.
  assert.equal(bumpFromCommits(["chore: tidy", "docs: fix a typo", "ci: cache npm"]), null);
  assert.equal(bumpFromCommits([]), null);
});

test("generated notes group by kind and drop what earns nothing", () => {
  const notes = notesFromCommits([
    "feat: add Piquet",
    "chore: bump the lockfile",
    "fix: stop the filter lying",
    "feat: add Tarneeb",
    "docs: reword the README",
  ]);

  assert.match(notes, /### Added\n\n- add Piquet\n- add Tarneeb/);
  assert.match(notes, /### Fixed\n\n- stop the filter lying/);
  assert.ok(!notes.includes("lockfile"), "housekeeping reached the release notes");
  assert.ok(!notes.includes("README"), "housekeeping reached the release notes");
  assert.ok(notes.indexOf("### Added") < notes.indexOf("### Fixed"), "sections are unordered");
});

test("a breaking change is called out where a reader will see it", () => {
  const notes = notesFromCommits(["feat!: drop the decks field", "fix: a thing"]);
  assert.match(notes, /### Changed\n\n- \*\*Breaking:\*\* drop the decks field/);
});

test("hand-written notes beat generated ones", () => {
  // Generated notes list subjects; a written entry summarises many at once. If
  // someone bothered to write one, replacing it with the list is a downgrade.
  const written = changelog("\n- Written by a person.\n\n", existing);
  const out = rewriteChangelog(written, "0.2.0", "2026-09-01", "### Added\n\n- generated");

  assert.match(out, /- Written by a person\./);
  assert.ok(!out.includes("- generated"), "the generated notes overrode a written entry");
});

test("generated notes are used when nothing was written by hand", () => {
  const out = rewriteChangelog(changelog("\n", existing), "0.2.0", "2026-09-01", "### Added\n\n- generated");
  assert.match(out, /## \[0\.2\.0\][^\n]*\n\n### Added\n\n- generated/);
});

test("nothing written and nothing generated is refused", () => {
  assert.throws(
    () => rewriteChangelog(changelog("\n", existing), "0.2.0", "2026-09-01", "   "),
    /nothing to release/,
  );
});

test("a version that zeroes the parts below it is still newer", () => {
  // The case that broke a release: 0.3.0 follows 0.2.1, and a comparison of
  // "some part bigger, no part smaller" reads the trailing 0 as a step back.
  // First difference decides, and nothing else does.
  assert.equal(isNewer("0.3.0", "0.2.1"), true);
  assert.equal(isNewer("1.0.0", "0.9.3"), true);
  assert.equal(isNewer("0.3.0", "0.2.9"), true);

  assert.equal(isNewer("0.2.1", "0.2.0"), true);
  assert.equal(isNewer("0.2.0", "0.2.1"), false);
  assert.equal(isNewer("0.2.1", "0.2.1"), false, "a version is not newer than itself");
  assert.equal(isNewer("0.9.3", "1.0.0"), false);
});

test("every bump this produces is newer than what it came from", () => {
  // The two halves have to agree: nextVersion decides what comes next and
  // isNewer decides whether the changelog is in order. If they disagree, a
  // release the script itself produced would fail the gate -- which is exactly
  // what happened.
  for (const from of ["0.0.0", "0.1.0", "0.2.1", "0.9.9", "1.0.0", "2.13.4"]) {
    for (const bump of ["major", "minor", "patch"] as const) {
      const to = nextVersion(from, bump);
      assert.equal(isNewer(to, from), true, `${from} --${bump}--> ${to} is not newer`);
    }
  }
});
