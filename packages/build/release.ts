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
export function rewriteChangelog(changelog: string, version: string, date: string): string {
  const start = /^## \[Unreleased\][^\n]*\n/m.exec(changelog);
  if (!start) throw new Error("CHANGELOG.md has no `## [Unreleased]` section");

  const from = start.index + start[0].length;
  const rest = changelog.slice(from);
  const next = /^## /m.exec(rest);
  const end = next ? from + next.index : changelog.length;

  const notes = changelog.slice(from, end).trim();
  if (!notes) {
    throw new Error(
      "`## [Unreleased]` is empty — write what changed before releasing it.\n" +
        "Notes are kept as the work happens, not reconstructed at release time.",
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
  const bump = args.find((a) => BUMPS.includes(a as Bump)) as Bump | undefined;

  if (!bump) {
    console.error(`Usage: node packages/build/release.ts <${BUMPS.join("|")}> [--dry-run]`);
    process.exit(2);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const version = nextVersion(manifest.version, bump);
  const changelog = rewriteChangelog(readFileSync(CHANGELOG, "utf8"), version, today());

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
