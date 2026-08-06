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

import type { CardGame } from "naibi";
import {
  GAMES_DIR,
  SCHEMA_PATH,
  gameFiles,
  loadSharedFigures,
  proseFingerprint,
} from "naibi";
import type { Entry, NamedEntry } from "./checks.ts";
import { checkEntry, crossFileProblems, sharedAliases } from "./checks.ts";

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
    // Computed from the entry as it stands now, so a stale `checked` record
    // reports itself rather than sitting there claiming cover it has lost.
    const fingerprint =
      typeof data["setup"] === "string" ? proseFingerprint(data as unknown as CardGame) : null;
    results.push({
      file,
      problems: [
        ...schemaProblems(data, validate),
        ...checkEntry(file, data, shared, fingerprint),
      ],
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

  // Never let silence read as coverage. An entry with no `checked` record has
  // not been read against a source in its current form, and saying so here is
  // cheaper than someone assuming otherwise.
  const unchecked = parsed.filter(({ data }) => !data["checked"]).length;
  if (unchecked > 0) {
    console.log(
      `${unchecked} entr${unchecked === 1 ? "y has" : "ies have"} no originality check ` +
        `on record (npm run originality).`,
    );
  }
  // Optional fields are invisible by default: an entry without one looks
  // exactly like an entry that never needed one. Naming the counts is the same
  // rule as the line above -- silence is not coverage -- but the reading is
  // different, so the wording has to be too. `deal` and `figure_refs` are
  // conditional by schema ("omit it where one number covers every case"), so a
  // low count is those rules working and not a backlog. Reported, never failed.
  // Read off the schema rather than listed here, so a field added to the schema
  // starts being counted without anyone remembering to add it.
  const shape = schema as { properties: Record<string, unknown>; required: string[] };
  const optional = Object.keys(shape.properties).filter((key) => !shape.required.includes(key));

  const carried = (field: string) =>
    parsed.filter(({ data }) => {
      const value = data[field];
      return value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);
    }).length;

  console.log(
    "\nOptional fields, carried by the entries that call for them — " +
      optional.map((field) => `${field} ${carried(field)}/${parsed.length}`).join(", ") +
      ".",
  );

  // Kept rather than forbidden: two games can honestly answer to one name, and
  // dropping either would mean a reader searching the one they know finds
  // nothing. What must hold instead -- that a search returns every claimant and
  // says why each is there -- is asserted in the web tests. This line exists so
  // the number is visible rather than discovered, and it says so when there are
  // none, because a report that can come back empty has to say which empty it
  // means. See decisions/0022.
  const answeredTwice = sharedAliases(parsed);
  const labels = parsed.reduce(
    (sum, { data }) => sum + 1 + (Array.isArray(data["aliases"]) ? data["aliases"].length : 0),
    0,
  );
  console.log(
    answeredTwice.length === 0
      ? `No alias is shared by more than one entry (${labels} names and aliases).`
      : `Aliases more than one entry answers to, kept so both stay findable — ` +
          answeredTwice.map((row) => `"${row.alias}" (${row.files.join(", ")})`).join(", ") +
          `. ${answeredTwice.length} of ${labels} names and aliases.`,
  );
  // The case a reader cannot resolve on the index: same name, same four facts
  // on the card, so nothing on screen tells the two apart. Said out loud rather
  // than failed, because no wording fixes it and two close relatives sharing a
  // name is a fact about card games. Whoever reads this decides whether the
  // pair is one game filed twice.
  const alike = answeredTwice.filter((row) => row.alike);
  if (alike.length > 0) {
    console.log(
      `Of those, ${alike.length} cannot be told apart on the index — ` +
        alike.map((row) => `"${row.alias}" (${row.files.join(", ")})`).join(", ") +
        `. Same players, time, difficulty and family, so only the name differs.`,
    );
  }

  if (failures > 0) {
    console.log(`${failures} file(s) need attention.`);
    return 1;
  }
  return 0;
}

process.exit(main());
