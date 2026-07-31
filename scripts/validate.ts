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

  let failures = 0;
  const seenIds = new Map<string, string>();
  const seenNames = new Map<string, string>();

  for (const path of paths) {
    const name = basename(path);
    let data: Entry;
    try {
      data = JSON.parse(readFileSync(path, "utf8")) as Entry;
    } catch (error) {
      console.log(`FAIL ${name}\n  not valid JSON: ${(error as Error).message}`);
      failures += 1;
      continue;
    }

    const problems = checkEntry(path, data, validate);

    const id = data["id"];
    if (typeof id === "string") {
      const previous = seenIds.get(id);
      if (previous) problems.push(`duplicate id, also used by ${previous}`);
      else seenIds.set(id, name);
    }

    const gameName = data["name"];
    if (typeof gameName === "string") {
      const key = gameName.trim().toLowerCase();
      const previous = seenNames.get(key);
      if (previous) problems.push(`duplicate name, also used by ${previous}`);
      else seenNames.set(key, name);
    }

    if (problems.length > 0) {
      failures += 1;
      console.log(`FAIL ${name}`);
      for (const problem of problems) console.log(`  - ${problem}`);
    } else if (!quiet) {
      console.log(`ok   ${name}`);
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
