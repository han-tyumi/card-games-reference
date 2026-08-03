/**
 * Cut a release in one command.
 *
 * Releasing used to be five steps, three of them mechanical and one of them
 * easy to forget: bump the manifest, move the changelog's Unreleased section
 * under a dated heading, fix the compare links, rebuild the booklet because the
 * version is printed on its cover, then run the gate. Every one of those is
 * derivable from the single decision a person actually makes, which is whether
 * this is a major, a minor or a patch.
 *
 * So that decision is the argument, and everything downstream of it happens
 * here. What is left for a human is the changelog prose, which is written into
 * `## [Unreleased]` as the work happens rather than reconstructed at release
 * time from a list of commit subjects.
 *
 *   node packages/build/release.ts minor
 *   node packages/build/release.ts patch --dry-run
 *
 * Publishing is still the Release workflow's job -- this stops at a commit on
 * main. Nothing here creates a tag, so there is exactly one thing that decides
 * what a release contains.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MANIFEST = join(REPO_ROOT, "packages", "data", "package.json");
const CHANGELOG = join(REPO_ROOT, "CHANGELOG.md");
const REPO_URL = "https://github.com/han-tyumi/naibi";

export type Bump = "major" | "minor" | "patch";

export const BUMPS: Bump[] = ["major", "minor", "patch"];

/**
 * The next version, under the reading of semver this project uses.
 *
 * Note what a major does while the version is 0.x: nothing special. `0.x` says
 * breaking changes may land in a minor, so a breaking change bumps the minor
 * and 1.0.0 is reached deliberately by asking for a major, not by accumulating
 * enough of them.
 */
export function nextVersion(current: string, bump: Bump): string {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`${current} is not a version this can bump`);
  }
  const [major, minor, patch] = parts as [number, number, number];

  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Is `a` a later version than `b`?
 *
 * First difference decides, which is the whole of semver ordering and is easy
 * to get subtly wrong. The version this replaces asked "is any part bigger and
 * no part smaller", which is true for 0.2.1 over 0.2.0 and false for 0.3.0 over
 * 0.2.1 — a bump that zeroes the parts below it looks like a step backwards.
 * It sat green because the changelog had never yet had a minor bump follow a
 * patch release, and it would have blocked every minor and major from then on.
 */
export function isNewer(a: string, b: string): boolean {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The version a changelog's newest release heading names, if it has one. */
export function latestRelease(changelog: string): string | null {
  return /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1] ?? null;
}

/**
 * Move `## [Unreleased]` under a dated heading and repoint the links.
 *
 * Refuses an empty Unreleased section rather than publishing a release whose
 * notes are a blank line. A release nobody can read what changed in is the
 * paper version of a check that passes by having looked at nothing.
 */
export function rewriteChangelog(
  changelog: string,
  version: string,
  date: string,
  generated?: string,
): string {
  const start = /^## \[Unreleased\][^\n]*\n/m.exec(changelog);
  if (!start) throw new Error("CHANGELOG.md has no `## [Unreleased]` section");

  const from = start.index + start[0].length;
  const rest = changelog.slice(from);
  const next = /^## /m.exec(rest);
  const end = next ? from + next.index : changelog.length;

  // Anything written by hand wins. Generated notes are a list of subjects and
  // a hand-written entry summarises many changes at once, so the moment someone
  // has bothered to write one, replacing it with the list would be a downgrade.
  const notes = changelog.slice(from, end).trim() || (generated ?? "").trim();
  if (!notes) {
    throw new Error(
      "`## [Unreleased]` is empty and no commits earned an entry — nothing to release.",
    );
  }

  const previous = latestRelease(changelog);
  const body =
    changelog.slice(0, from).trimEnd() +
    `\n\n## [${version}] — ${date}\n\n${notes}\n\n` +
    changelog.slice(end).trimStart();

  // The link definitions at the foot: Unreleased always compares against the
  // new tag, and the new release gets a compare against its predecessor -- or a
  // plain tag link when it has none, because there is nothing to compare to.
  const link = previous
    ? `[${version}]: ${REPO_URL}/compare/v${previous}...v${version}`
    : `[${version}]: ${REPO_URL}/releases/tag/v${version}`;

  return body
    .replace(
      /^\[Unreleased\]: .*$/m,
      `[Unreleased]: ${REPO_URL}/compare/v${version}...HEAD\n${link}`,
    )
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * What a conventional-commit type means for the version.
 *
 * The mapping is the whole of the convention that this project actually uses.
 * `feat` is additive and `fix` is not, which is the same distinction the
 * hand-written rule made; everything housekeeping releases nothing on its own.
 */
export const TYPES: Record<string, Bump | null> = {
  feat: "minor",
  fix: "patch",
  perf: "patch",
  revert: "patch",
  refactor: null,
  docs: null,
  test: null,
  build: null,
  ci: null,
  chore: null,
  style: null,
};

/** Which section of the changelog a type's subjects are listed under. */
const HEADINGS: Record<string, string> = { feat: "Added", fix: "Fixed" };

const RANK: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };

/** `type(scope)!: subject`, with every part after the type optional. */
const CONVENTIONAL = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?: (?<subject>.+)$/;

export type Change = { type: string; breaking: boolean; subject: string; bump: Bump | null };

/**
 * Read one commit's subject as a change.
 *
 * A subject with no recognised prefix is deliberately NOT dropped. Dropping it
 * would mean a batch of sloppily-labelled work releasing nothing at all and
 * saying nothing about why, which is the silent failure this project keeps
 * finding in other places. It counts as a patch and is listed under "Changed".
 */
export function readCommit(subject: string): Change {
  const match = CONVENTIONAL.exec(subject.trim());
  if (!match?.groups) {
    return { type: "other", breaking: false, subject: subject.trim(), bump: "patch" };
  }

  const { type, breaking, subject: text } = match.groups as Record<string, string | undefined>;
  const known = Object.hasOwn(TYPES, type!);
  return {
    type: known ? type! : "other",
    breaking: Boolean(breaking),
    subject: text!,
    bump: breaking ? "major" : known ? TYPES[type!]! : "patch",
  };
}

/**
 * The bump a set of commits earns, or null when none of them earns one.
 *
 * The largest wins: one breaking change in a hundred fixes is still a major.
 * Null means a push of nothing but housekeeping, which must release nothing --
 * otherwise the version becomes a count of pushes rather than a statement about
 * compatibility.
 */
export function bumpFromCommits(subjects: string[]): Bump | null {
  let best: Bump | null = null;
  for (const change of subjects.map(readCommit)) {
    if (!change.bump) continue;
    if (!best || RANK[change.bump] > RANK[best]) best = change.bump;
  }
  return best;
}

/**
 * Changelog notes from commit subjects, grouped the way the file already groups.
 *
 * Only the types that earn a bump are listed. A release note is for a reader
 * deciding whether to care, and "chore: bump the lockfile" is not that.
 */
export function notesFromCommits(subjects: string[]): string {
  /** @type {Map<string, string[]>} */
  const sections = new Map<string, string[]>();

  for (const change of subjects.map(readCommit)) {
    if (!change.bump) continue;
    const heading = change.breaking
      ? "Changed"
      : (HEADINGS[change.type] ?? "Changed");
    const line = change.breaking ? `**Breaking:** ${change.subject}` : change.subject;
    sections.set(heading, [...(sections.get(heading) ?? []), line]);
  }

  // A fixed order, so two releases with the same kinds of change read alike.
  return ["Added", "Fixed", "Changed"]
    .filter((heading) => sections.has(heading))
    .map((heading) => `### ${heading}\n\n${sections.get(heading)!.map((l) => `- ${l}`).join("\n")}`)
    .join("\n\n");
}

/** Commit subjects since a ref, newest last. */
export function subjectsSince(ref: string | null): string[] {
  const range = ref ? [`${ref}..HEAD`] : ["HEAD"];
  const out = execFileSync("git", ["log", "--reverse", "--format=%s", ...range], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out.split("\n").filter((line) => line.trim().length > 0);
}

/** The most recent release tag, or null in a repository that has none. */
export function lastTag(): string | null {
  try {
    return execFileSync("git", ["describe", "--tags", "--abbrev=0", "--match=v*"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Today, as a date rather than an instant: a release is dated, not timed. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function run(command: string, args: string[]): void {
  console.log(`  $ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const auto = args.includes("--auto");
  const asked = args.find((a) => BUMPS.includes(a as Bump)) as Bump | undefined;

  if (!asked && !auto) {
    console.error(
      `Usage: node packages/build/release.ts <${BUMPS.join("|")}> [--dry-run]\n` +
        `       node packages/build/release.ts --auto [--dry-run]`,
    );
    process.exit(2);
  }

  // --auto reads the commits since the last release rather than being told. A
  // push of nothing but housekeeping releases nothing at all, and says so:
  // exit 0, because "no release was due" is a correct outcome, not a failure.
  let generated: string | undefined;
  let bump = asked;
  if (auto) {
    const tag = lastTag();
    const subjects = subjectsSince(tag);
    const earned = bumpFromCommits(subjects);
    console.log(`${subjects.length} commits since ${tag ?? "the beginning"}`);

    if (!earned) {
      console.log("Nothing here earns a release. Stopping, which is the right answer.");
      return;
    }
    bump = asked ?? earned;
    generated = notesFromCommits(subjects);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const version = nextVersion(manifest.version, bump!);
  const changelog = rewriteChangelog(readFileSync(CHANGELOG, "utf8"), version, today(), generated);

  console.log(`${manifest.version} -> ${version} (${bump})`);

  if (dryRun) {
    console.log("\n--dry-run: nothing written. The changelog would begin:\n");
    console.log(changelog.slice(changelog.indexOf("## [Unreleased]")).split("\n").slice(0, 14).join("\n"));
    return;
  }

  manifest.version = version;
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(CHANGELOG, changelog);

  // The version is printed on the booklet's cover, so a bump makes it stale.
  // This is the step that was easy to forget and only the gate ever caught.
  run("npm", ["run", "pdf"]);
  run("npm", ["run", "check"]);
  run("git", ["add", "-A"]);
  run("git", ["commit", "-m", `Release v${version}`]);

  console.log(
    `\nCommitted. Push, then run the Release workflow — it checks the tag, the\n` +
      `manifest and the changelog agree before publishing anything.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
