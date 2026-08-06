/**
 * The rules a JSON Schema cannot express.
 *
 * A schema checks shape: that `players.max` is a number, that `tags` is an array
 * of known strings. It cannot check that the number and the strings agree with
 * each other, and that is where the real defects have been -- a deal table that
 * skips a player count, a diagram whose zones contradict its repeat, a "quick"
 * game that runs an hour. Every function here started as a bug someone found by
 * reading the output.
 *
 * These are pure: entries in, problem strings out, no filesystem and no exit
 * codes. validate.ts does the reading, the schema pass and the reporting; this
 * does the thinking, and is what the tests exercise.
 */

import { basename } from "node:path";

/** A parsed entry, before it is known to be a valid CardGame. */
export type Entry = Record<string, unknown>;

/** One entry as the validator sees it on disk. */
export type NamedEntry = { file: string; data: Entry };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** "20-45" -> [20, 45]; "60+" -> [60, null]. */
export function durationBounds(value: unknown): [number, number | null] | null {
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
 * makes the filters on the site lie to the reader.
 */
export function checkTagSemantics(data: Entry): string[] {
  const problems: string[] = [];

  const players = asRecord(data["players"]);
  const max = asNumber(players?.["max"]);
  const min = asNumber(players?.["min"]);
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

export function checkPlayers(data: Entry): string[] {
  const players = asRecord(data["players"]);
  if (!players) return [];

  const min = asNumber(players["min"]);
  const max = asNumber(players["max"]);
  const ideal = asNumber(players["ideal"]);
  if (min === null || max === null || ideal === null) return [];

  const problems: string[] = [];
  if (min > max) {
    problems.push(`players.min (${min}) is greater than players.max (${max})`);
  }
  if (ideal < min || ideal > max) {
    problems.push(`players.ideal (${ideal}) is outside the range ${min}-${max}`);
  }
  return problems;
}

/**
 * A reference to a figure that does not exist resolves to nothing, so the entry
 * silently loses a figure it believes it has. Cheap to catch, invisible if not.
 */
export function checkFigureRefs(data: Entry, shared: ReadonlySet<string>): string[] {
  const refs = data["figure_refs"];
  if (!Array.isArray(refs)) return [];

  return refs
    .filter((id) => typeof id === "string" && !shared.has(id))
    .map((id) => `figure_refs names "${id}", which is not in shared/figures.json`);
}

/**
 * Zero standard decks means the game needs a pack you cannot build from
 * ordinary cards, so it has to say which one -- otherwise the entry claims you
 * need no cards at all.
 */
export function checkEquipment(data: Entry): string[] {
  const equipment = asRecord(data["equipment"]);
  if (!equipment) return [];

  if (equipment["standard_decks"] === 0 && !equipment["special_deck"]) {
    return [
      "equipment.standard_decks is 0, so equipment.special_deck must name the " +
        "pack the game needs",
    ];
  }
  return [];
}

/**
 * A deal table has to answer the question for every group that can play.
 *
 * This was a real defect: 500 Rummy seats 2 to 8 but its table stopped at 5,
 * so a table of six looked it up and found nothing. A gap is worse than no
 * table at all, because the reader trusts it and comes away misinformed.
 */
export function checkDeal(data: Entry): string[] {
  const deal = data["deal"];
  if (!Array.isArray(deal)) return [];

  const players = asRecord(data["players"]);
  const min = asNumber(players?.["min"]);
  const max = asNumber(players?.["max"]);
  if (min === null || max === null) return [];

  const problems: string[] = [];
  const listed = new Set<number>();

  for (const row of deal) {
    const count = asRecord(row)?.["players"];
    if (typeof count !== "number") continue;
    if (listed.has(count)) {
      problems.push(`deal lists ${count} players more than once`);
    }
    listed.add(count);
    if (count < min || count > max) {
      problems.push(`deal covers ${count} players, outside the game's ${min}-${max}`);
    }
  }

  const missing: number[] = [];
  for (let count = min; count <= max; count += 1) {
    if (!listed.has(count)) missing.push(count);
  }
  if (missing.length > 0) {
    problems.push(
      `deal has no row for ${missing.join(", ")} ` +
        `player${missing.length === 1 && missing[0] === 1 ? "" : "s"}, ` +
        `but the game seats ${min}-${max}`,
    );
  }

  return problems;
}

/**
 * A layout that disagrees with itself draws a wrong diagram silently, which is
 * worse than not having one. The schema cannot tie `cards` to `repeat`.
 */
export function checkLayout(data: Entry): string[] {
  const layout = asRecord(data["layout"]);
  if (!layout) return [];

  const problems: string[] = [];
  const rows = Array.isArray(layout["rows"]) ? layout["rows"] : [];

  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    row.forEach((zone, zoneIndex) => {
      const z = asRecord(zone);
      if (!z) return;
      const where = `layout.rows[${rowIndex}][${zoneIndex}]`;
      const repeat = typeof z["repeat"] === "number" ? z["repeat"] : 1;

      if (Array.isArray(z["cards"]) && z["cards"].length !== repeat) {
        problems.push(
          `${where}: cards has ${z["cards"].length} entries but repeat is ${repeat}`,
        );
      }

      if (z["kind"] === "gap" && (z["label"] || z["cards"] || z["face"])) {
        problems.push(`${where}: a gap is a spacer and takes no label, cards or face`);
      }
    });
  });

  // A diagram cannot overlap more rows than it has, and one overlapping row is
  // a contradiction in terms: it has nothing to overlap.
  const overlapping = asNumber(layout["overlapping_rows"]);
  if (overlapping !== null && overlapping > rows.length) {
    problems.push(
      `layout.overlapping_rows is ${overlapping} but there are only ${rows.length} rows`,
    );
  }

  return problems;
}

/**
 * An entry whose prose moved on after it was checked.
 *
 * This is the one that stops the record becoming a comfortable lie. Anyone can
 * rewrite a rule after a check and leave the date sitting there; the fingerprint
 * makes that visible instead of silent. Re-read the entry against its sources
 * and re-stamp it, or drop the record — but do not leave it claiming cover it
 * no longer has.
 */
export function checkChecked(data: Entry, fingerprint: string | null): string[] {
  const checked = asRecord(data["checked"]);
  if (!checked || fingerprint === null) return [];

  if (checked["prose"] !== fingerprint) {
    return [
      `prose has been edited since it was checked on ${checked["date"]}; ` +
        "re-read it against its sources and re-stamp, or remove the record",
    ];
  }

  // A source that was read but never attributed is a source the reader cannot
  // follow, so `checked.sources` has to draw from `sources_consulted` rather
  // than name something of its own. The schema can require two names; only this
  // can require they be the entry's own.
  const read = checked["sources"];
  if (Array.isArray(read)) {
    const attributed = new Set(
      Array.isArray(data["sources_consulted"]) ? (data["sources_consulted"] as string[]) : [],
    );
    const stray = read.filter((name) => !attributed.has(name as string));
    if (stray.length > 0) {
      return [
        `checked.sources names ${stray.map((s) => `"${s}"`).join(", ")}, ` +
          "which sources_consulted does not list; add it there or correct the name",
      ];
    }
  }
  return [];
}

export function checkFilename(file: string, data: Entry): string[] {
  const id = data["id"];
  const stem = basename(file, ".json");
  if (typeof id === "string" && id !== stem) {
    return [`id "${id}" does not match filename "${basename(file)}"`];
  }
  return [];
}

/** Every within-entry check, in reporting order. */
export function checkEntry(
  file: string,
  data: Entry,
  shared: ReadonlySet<string>,
  fingerprint: string | null = null,
): string[] {
  return [
    ...checkFilename(file, data),
    ...checkChecked(data, fingerprint),
    ...checkPlayers(data),
    ...checkTagSemantics(data),
    ...checkLayout(data),
    ...checkDeal(data),
    ...checkEquipment(data),
    ...checkFigureRefs(data, shared),
  ];
}

function key(value: unknown): string | null {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

/**
 * Checks that need to see the whole corpus: two entries claiming one id, two
 * claiming one name, or one claiming another's name as an alias -- which makes
 * the pair indistinguishable when searching. Where two games genuinely share a
 * name, the prose explains the clash instead.
 *
 * Returns problems per file, in the order the files were given.
 */
export function crossFileProblems(entries: readonly NamedEntry[]): string[][] {
  const problems = entries.map(() => [] as string[]);

  const idOwner = new Map<string, string>();
  const nameOwner = new Map<string, string>();

  entries.forEach(({ file, data }, index) => {
    const id = key(data["id"]);
    if (id !== null) {
      const previous = idOwner.get(id);
      if (previous) problems[index]!.push(`duplicate id, also used by ${previous}`);
      else idOwner.set(id, file);
    }

    const name = key(data["name"]);
    if (name !== null) {
      const previous = nameOwner.get(name);
      if (previous) problems[index]!.push(`duplicate name, also used by ${previous}`);
      else nameOwner.set(name, file);
    }
  });

  // Second pass: an alias can collide with a name defined in any file, including
  // one read later, so every name has to be known before this can run.
  entries.forEach(({ data }, index) => {
    const aliases = Array.isArray(data["aliases"]) ? (data["aliases"] as string[]) : [];
    const own = key(data["name"]);
    for (const alias of aliases) {
      const aliasKey = key(alias);
      if (aliasKey === null || aliasKey === own) continue;
      const owner = nameOwner.get(aliasKey);
      if (owner) {
        problems[index]!.push(
          `alias "${alias}" is the name of another game (${owner}); ` +
            `explain the clash in the prose instead`,
        );
      }
    }
  });

  return problems;
}

/**
 * Aliases that more than one entry answers to.
 *
 * Reported, never failed, and the asymmetry with the rule above is deliberate.
 * An alias that is another game's *name* is a conflict: someone typing the
 * exact title of one game should not find a different game competing at the top
 * of the results. An alias two games share has no primary claimant -- neither
 * Speed nor Spit is "the" Slam -- and both really are called it, so dropping
 * either would mean a reader searching the name they know finds nothing.
 *
 * What has to be true instead is that a search returns every claimant and says
 * why each one is there. That is asserted in the web tests, against the real
 * index, rather than here. This exists so the count stays visible as the corpus
 * grows: one shared alias in 292 labels today, and collisions grow faster than
 * the corpus does.
 *
 * @returns one row per shared alias, each naming the files that carry it.
 */
export function sharedAliases(
  entries: readonly NamedEntry[],
): { alias: string; files: string[] }[] {
  const holders = new Map<string, { alias: string; files: string[] }>();

  for (const { file, data } of entries) {
    const aliases = Array.isArray(data["aliases"]) ? (data["aliases"] as string[]) : [];
    for (const alias of aliases) {
      const aliasKey = key(alias);
      if (aliasKey === null) continue;
      const seen = holders.get(aliasKey);
      if (seen) seen.files.push(file);
      else holders.set(aliasKey, { alias, files: [file] });
    }
  }

  return [...holders.values()]
    .filter((row) => row.files.length > 1)
    .sort((a, b) => a.alias.localeCompare(b.alias));
}
