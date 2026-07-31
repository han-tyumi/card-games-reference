/**
 * Validate every game entry in games/ against schema/game.schema.json.
 *
 * Runs the JSON Schema check plus the cross-file rules a schema cannot express:
 * filenames matching ids, ids being unique, and player counts being internally
 * consistent. Exits non-zero if anything fails, so it works as a CI gate.
 *
 *   node scripts/validate.ts            # validate everything
 *   node scripts/validate.ts --quiet    # only print problems
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import { GAMES_DIR, SCHEMA_PATH, gameFiles } from "./games.ts";

type Entry = Record<string, unknown>;

function describe(error: ErrorObject): string {
  const location = error.instancePath.replace(/^\//, "").replace(/\//g, "/");
  return `${location || "(root)"}: ${error.message ?? "is invalid"}`;
}

/** "20-45" -> [20, 45]; "60+" -> [60, null]. */
function durationBounds(value: unknown): [number, number | null] | null {
  if (typeof value !== "string") return null;
  const range = /^(\d{1,3})-(\d{1,3})$/.exec(value);
  if (range) return [Number(range[1]), Number(range[2])];
  const open = /^(\d{1,3})\+$/.exec(value);
  if (open) return [Number(open[1]), null];
  return null;
}

/**
 * Meaning the schema cannot police: tags that contradict the numbers beside
 * them. A "solo" game that seats four, or a "quick" game that runs an hour,
 * makes the filters in a future app lie to the user.
 */
function checkTagSemantics(data: Entry): string[] {
  const problems: string[] = [];

  const players = data["players"] as Record<string, unknown> | undefined;
  const max = typeof players?.["max"] === "number" ? players["max"] : null;
  const min = typeof players?.["min"] === "number" ? players["min"] : null;
  const tags = Array.isArray(data["tags"]) ? (data["tags"] as string[]) : [];
  const has = (tag: string) => tags.includes(tag);

  if (max !== null) {
    if (has("solo") && max !== 1) {
      problems.push(`tagged "solo" but seats up to ${max} players`);
    }
    if (!has("solo") && max === 1) {
      problems.push(`is a 1-player game but is not tagged "solo"`);
    }
    if (data["category"] === "solitaire" && max !== 1) {
      problems.push(`category "solitaire" but seats up to ${max} players`);
    }
    if (has("partnership") && max < 4) {
      problems.push(`tagged "partnership" but seats only ${max}`);
    }
    if (has("large-group") && max < 6) {
      problems.push(`tagged "large-group" but seats only ${max}`);
    }
  }

  if (min !== null && max !== null && has("two-player") && (min > 2 || max < 2)) {
    problems.push(`tagged "two-player" but seats ${min}-${max}`);
  }

  const bounds = durationBounds(data["duration_minutes"]);
  if (bounds) {
    const [low, high] = bounds;
    if (high !== null && low >= high) {
      problems.push(`duration_minutes "${data["duration_minutes"]}" is not ascending`);
    }
    // Conventions documented in the README so filtering means something.
    if (has("quick") && high !== null && high > 30) {
      problems.push(`tagged "quick" but runs up to ${high} minutes (limit 30)`);
    }
    if (has("long-game") && high !== null && high < 60) {
      problems.push(`tagged "long-game" but tops out at ${high} minutes (needs 60)`);
    }
  }

  return problems;
}

/** Problems with one entry: schema errors plus the checks the schema can't do. */
function checkEntry(
  path: string,
  data: Entry,
  validate: ValidateFunction,
): string[] {
  const problems: string[] = [];

  if (!validate(data)) {
    for (const error of validate.errors ?? []) problems.push(describe(error));
  }

  const id = data["id"];
  const stem = basename(path, ".json");
  if (typeof id === "string" && id !== stem) {
    problems.push(`id "${id}" does not match filename "${basename(path)}"`);
  }

  const players = data["players"];
  if (players && typeof players === "object") {
    const { min, max, ideal } = players as Record<string, unknown>;
    if (
      typeof min === "number" &&
      typeof max === "number" &&
      typeof ideal === "number"
    ) {
      if (min > max) {
        problems.push(`players.min (${min}) is greater than players.max (${max})`);
      }
      if (ideal < min || ideal > max) {
        problems.push(
          `players.ideal (${ideal}) is outside the range ${min}-${max}`,
        );
      }
    }
  }

  problems.push(...checkTagSemantics(data));

  return problems;
}

function main(): number {
  const quiet = process.argv.includes("--quiet");

  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  const paths = gameFiles();
  if (paths.length === 0) {
    console.error(`No game files found in ${GAMES_DIR}`);
    return 1;
  }

  const seenIds = new Map<string, string>();
  const seenNames = new Map<string, string>();
  // Collected first, because the alias check needs every name before it can run.
  const results: { file: string; data: Entry | null; problems: string[] }[] = [];

  for (const path of paths) {
    const file = basename(path);
    let data: Entry;
    try {
      data = JSON.parse(readFileSync(path, "utf8")) as Entry;
    } catch (error) {
      results.push({
        file,
        data: null,
        problems: [`not valid JSON: ${(error as Error).message}`],
      });
      continue;
    }

    const problems = checkEntry(path, data, validate);

    const id = data["id"];
    if (typeof id === "string") {
      const previous = seenIds.get(id);
      if (previous) problems.push(`duplicate id, also used by ${previous}`);
      else seenIds.set(id, file);
    }

    const gameName = data["name"];
    if (typeof gameName === "string") {
      const key = gameName.trim().toLowerCase();
      const previous = seenNames.get(key);
      if (previous) problems.push(`duplicate name, also used by ${previous}`);
      else seenNames.set(key, file);
    }

    results.push({ file, data, problems });
  }

  // An alias that is another game's real name makes the two indistinguishable
  // when searching. Where two games genuinely share a name, the prose explains
  // the clash instead.
  for (const { data, problems } of results) {
    if (!data) continue;
    const aliases = Array.isArray(data["aliases"]) ? (data["aliases"] as string[]) : [];
    const own = typeof data["name"] === "string" ? data["name"].trim().toLowerCase() : "";
    for (const alias of aliases) {
      const owner = seenNames.get(alias.trim().toLowerCase());
      if (owner && alias.trim().toLowerCase() !== own) {
        problems.push(
          `alias "${alias}" is the name of another game (${owner}); ` +
            `explain the clash in the prose instead`,
        );
      }
    }
  }

  let failures = 0;
  for (const { file, problems } of results) {
    if (problems.length > 0) {
      failures += 1;
      console.log(`FAIL ${file}`);
      for (const problem of problems) console.log(`  - ${problem}`);
    } else if (!quiet) {
      console.log(`ok   ${file}`);
    }
  }

  console.log(`\n${paths.length - failures}/${paths.length} entries valid.`);
  if (failures > 0) {
    console.log(`${failures} file(s) need attention.`);
    return 1;
  }
  return 0;
}

process.exit(main());
