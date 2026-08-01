/**
 * Validate every game entry in games/ against schema/game.schema.json.
 *
 * Runs the JSON Schema check plus the cross-file and cross-field rules a schema
 * cannot express, which live in checks.ts. Exits non-zero if anything fails, so
 * it works as a CI gate.
 *
 *   npm run validate              # validate everything
 *   npm run validate -- --quiet   # only print problems
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import { GAMES_DIR, SCHEMA_PATH, gameFiles, loadSharedFigures } from "naibi";
import type { Entry, NamedEntry } from "./checks.ts";
import { checkEntry, crossFileProblems } from "./checks.ts";

function describe(error: ErrorObject): string {
  const location = error.instancePath.replace(/^\//, "");
  return `${location || "(root)"}: ${error.message ?? "is invalid"}`;
}

function schemaProblems(data: Entry, validate: ValidateFunction): string[] {
  if (validate(data)) return [];
  return (validate.errors ?? []).map(describe);
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

  const shared = new Set(Object.keys(loadSharedFigures()));

  // Entries are collected before anything is reported, because the duplicate
  // and alias rules need every name before they can run.
  const parsed: NamedEntry[] = [];
  const results: { file: string; problems: string[] }[] = [];

  for (const path of paths) {
    const file = basename(path);
    let data: Entry;
    try {
      data = JSON.parse(readFileSync(path, "utf8")) as Entry;
    } catch (error) {
      results.push({ file, problems: [`not valid JSON: ${(error as Error).message}`] });
      continue;
    }

    parsed.push({ file, data });
    results.push({
      file,
      problems: [...schemaProblems(data, validate), ...checkEntry(file, data, shared)],
    });
  }

  const byFile = new Map(results.map((r) => [r.file, r]));
  crossFileProblems(parsed).forEach((problems, index) => {
    byFile.get(parsed[index]!.file)?.problems.push(...problems);
  });

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
