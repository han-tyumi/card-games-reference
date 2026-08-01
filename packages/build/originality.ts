/**
 * Find prose that follows a source too closely.
 *
 *   npm run originality                 # every entry that has sources on disk
 *   npm run originality -- --game durak # one entry
 *   npm run originality -- --min 0.55   # widen the net
 *
 * Source text is read from `.sources/<game-id>/*.txt`, which is gitignored and
 * must stay that way: those files are someone else's copyrighted prose, kept
 * locally for the length of a check and deleted after. Fetching them is not
 * this script's job -- do it however the environment allows and drop the plain
 * text in.
 *
 * WHY THIS EXISTS
 *
 * The obvious check is to search a phrase and see whether anything comes back.
 * That does not work: search engines do not reliably honour quoting, so a hit
 * list is not evidence the phrase was found, and "no results" cannot be
 * observed at all. Worse, the actual failure mode in this project has never
 * been copy-paste. It is a sentence that follows a source's clause order with
 * different words in the slots -- which no phrase search would ever surface,
 * because no phrase is shared.
 *
 * So this compares structure, not strings. Two sentences that name the same
 * things in the same order are flagged even when every joining word differs,
 * which is the shape the previous passes kept finding by hand.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { CardGame } from "naibi";
import { loadGames } from "naibi";

const SOURCES_DIR = fileURLToPath(new URL("../../.sources", import.meta.url));

/** The prose fields. Procedural writing is where every match has been found. */
const FIELDS = ["setup", "play", "goal_and_scoring"] as const;

/**
 * Function words only. Card-game vocabulary -- deal, trick, trump, discard --
 * is exactly the signal here, so none of it is filtered out: two sentences
 * naming the same actions in the same order is the thing being looked for.
 */
const FUNCTION_WORDS = new Set(
  ("a an and are as at be been being but by can could do does for from had has have " +
    "he her his how i if in into is it its may might must of on or should so than " +
    "that the their them then there these they this those to was were what when " +
    "where which while who will with would you your").split(" "),
);

/**
 * How much weight a finding carries.
 *
 * "reuse" is a long run of identical consecutive words, which two people do not
 * write by coincidence — act on it. "candidate" is a similarity score, which is
 * a reason to read the pair, not a verdict. Measured on fixtures, a sentence
 * rebuilt from a source's clause order scores about 0.38 and an independent
 * rewrite of the same rule about 0.22: real separation, but not wide enough to
 * decide anything automatically.
 */
export type Tier = "reuse" | "candidate";

export type Match = {
  tier: Tier;
  ours: string;
  theirs: string;
  source: string;
  /** Shared content words in the same order, as a share of the shorter sentence. */
  order: number;
  /** Longest run of identical consecutive words, in raw tokens. */
  run: number;
};

/**
 * Whether a whole passage walks through a source in the source's own order.
 *
 * This is the signal a phrase search can never produce and a sentence score
 * mostly misses: no single sentence need be close, but ours covers the same
 * points, in the same sequence, because it was written next to theirs.
 */
export type Alignment = {
  source: string;
  /** Sentences of ours with a plausible counterpart, in our order. */
  pairs: { ours: string; theirs: string; theirIndex: number; similarity: number }[];
  /** Share of steps where the counterpart also moves forward. */
  monotonic: number;
  meanSimilarity: number;
  follows: boolean;
};

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*]\s+/, "").trim())
    .filter((s) => s.length > 0);
}

export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
}

export function contentWords(text: string): string[] {
  return words(text).filter((word) => !FUNCTION_WORDS.has(word));
}

/**
 * How much a shared word is worth.
 *
 * Uniform weighting does not work here, and the corpus proves it: scored that
 * way, our own sixty entries produced eight thousand matches against each
 * other, every one of them boilerplate. "Deal seven cards to each player, one
 * at a time" and "Deal eleven cards to each player, one at a time" score a
 * perfect match because there is no other way to say it — and drowning the real
 * findings is the same as missing them.
 *
 * So a word is worth what it is rare. Words appearing across most entries carry
 * almost nothing; a word peculiar to one game carries a lot. Two sentences
 * agreeing on "bower", "meld" and "widow" in order means something. Two
 * agreeing on "deal", "player" and "card" does not.
 */
export type Weigher = (word: string) => number;

export const UNIFORM: Weigher = () => 1;

export function documentFrequencies(texts: readonly string[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const text of texts) {
    for (const word of new Set(contentWords(text))) {
      df.set(word, (df.get(word) ?? 0) + 1);
    }
  }
  return df;
}

/**
 * Inverse document frequency over the corpus, floored so nothing weighs zero
 * and clamped so nothing weighs less than nothing.
 *
 * The clamp is not theoretical: passing a document count smaller than the
 * number of texts the frequencies were built from produces negative weights,
 * which turn the overlap ratio into nonsense — scores over 100000% — rather
 * than into an obviously wrong number someone would notice.
 */
export function rarity(df: Map<string, number>, documents: number): Weigher {
  return (word) =>
    Math.max(0, Math.log((documents + 1) / ((df.get(word) ?? 0) + 1))) + 0.05;
}

/**
 * Weight of the longest common subsequence -- order-sensitive, gaps allowed.
 * With UNIFORM this is plain LCS length.
 */
export function orderedOverlap(a: string[], b: string[], weigh: Weigher = UNIFORM): number {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      table[i]![j] =
        a[i - 1] === b[j - 1]
          ? table[i - 1]![j - 1]! + weigh(a[i - 1]!)
          : Math.max(table[i - 1]![j]!, table[i]![j - 1]!);
    }
  }
  return table[a.length]![b.length]!;
}

/** Total weight of a sentence, for normalising an overlap against it. */
function mass(wordList: string[], weigh: Weigher): number {
  return wordList.reduce((total, word) => total + weigh(word), 0);
}

/** Length of the longest run of identical consecutive words. */
export function longestRun(a: string[], b: string[]): number {
  let best = 0;
  const previous = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const here = a[i - 1] === b[j - 1] ? diagonal + 1 : 0;
      diagonal = previous[j]!;
      previous[j] = here;
      if (here > best) best = here;
    }
  }
  return best;
}

export type Thresholds = {
  /** Share of the shorter sentence's content words appearing in order. */
  order: number;
  /** Identical consecutive words, which no two people write by accident. */
  run: number;
  /** Below this many content words a sentence is too short to mean anything. */
  minWords: number;
};

/**
 * A last-resort floor, NOT a calibrated bar. Use baseline() instead.
 *
 * Fixed thresholds were tried and measured, and none of them work. Against our
 * own sixty independently written entries — which by construction copy nothing
 * from each other — the false-positive counts came out as:
 *
 *     order >= 0.35   5401        run >= 6    834
 *     order >= 0.60   1122        run >= 12    15
 *
 * and the gap that mattered went the wrong way: with rarity weighting a
 * clause-order copy scored 0.15 against an independent rewrite's 0.12. Card
 * game procedure is formulaic, so "these two sentences are written alike" is
 * the null hypothesis here, not the signal. There is no number that separates
 * copying from two people describing the same deal.
 *
 * What does work is comparing against that baseline. Measured on this corpus,
 * the best coincidental match between two unrelated passages sits at 0.60 in
 * order at the 95th percentile and 0.80 at the 99th; our own entries clear
 * their own 99th-percentile bar 2.4% of the time, which is what a bar set
 * there should do. A source match that beats it is worth reading. One that does
 * not is indistinguishable from two people describing the same deal.
 */
export const DEFAULTS: Thresholds = { order: 0.35, run: 6, minWords: 5 };

/**
 * What "written alike by coincidence" looks like, measured on this corpus.
 *
 * Every pair of our own entries is compared, and the high percentile of what
 * that produces becomes the bar a real source has to clear. It is a null
 * distribution built from writing that is known not to be copied, which is the
 * only honest reference available without a labelled corpus.
 *
 * Deterministic, and slow enough to be worth doing once: a stride keeps it to a
 * sample rather than every pair.
 */
export function baseline(
  passages: readonly string[],
  percentile = 0.99,
  stride = 7,
): Thresholds {
  const orders: number[] = [];
  const runs: number[] = [];
  const wide: Thresholds = { order: 0, run: Number.MAX_SAFE_INTEGER, minWords: 5 };

  for (let i = 0; i < passages.length; i += 1) {
    for (let k = 1; k < passages.length; k += stride) {
      const j = (i + k) % passages.length;
      if (j === i) continue;
      // The BEST coincidental match between two unrelated passages is the right
      // null: the question is whether a source match is unusual, and every weak
      // match counted separately would just drag the percentile down.
      const found = compare(passages[i]!, passages[j]!, "baseline", wide);
      if (found.length === 0) continue;
      orders.push(Math.max(...found.map((m) => m.order)));
      runs.push(Math.max(...found.map((m) => m.run)));
    }
  }

  const at = (values: number[], fallback: number) => {
    if (values.length === 0) return fallback;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))]!;
  };

  return {
    order: Math.max(DEFAULTS.order, at(orders, DEFAULTS.order)),
    run: Math.max(DEFAULTS.run, at(runs, DEFAULTS.run)),
    minWords: DEFAULTS.minWords,
  };
}

/** Every one of our sentences that tracks a source sentence too closely. */
export function compare(
  ours: string,
  theirs: string,
  source: string,
  limits: Thresholds = DEFAULTS,
  weigh: Weigher = UNIFORM,
): Match[] {
  const mine = sentences(ours).map((s) => ({ s, c: contentWords(s), w: words(s) }));
  const source_ = sentences(theirs).map((s) => ({ s, c: contentWords(s), w: words(s) }));

  const found: Match[] = [];

  for (const a of mine) {
    if (a.c.length < limits.minWords) continue;
    let worst: Match | null = null;

    for (const b of source_) {
      if (b.c.length < limits.minWords) continue;

      const order =
        orderedOverlap(a.c, b.c, weigh) / Math.min(mass(a.c, weigh), mass(b.c, weigh));
      const run = longestRun(a.w, b.w);
      if (order < limits.order && run < limits.run) continue;

      // Keep the single worst source sentence per sentence of ours: a passage
      // matching five pages of a source is one problem, not five.
      if (!worst || order > worst.order || (order === worst.order && run > worst.run)) {
        worst = {
          tier: run >= limits.run ? "reuse" : "candidate",
          ours: a.s,
          theirs: b.s,
          source,
          order,
          run,
        };
      }
    }

    if (worst) found.push(worst);
  }

  return found;
}

/**
 * Does this passage walk through the source in the source's own order?
 *
 * Every sentence of ours is paired with its most similar source sentence,
 * whether or not that pair is close enough to flag on its own. What matters is
 * the sequence: if those counterparts march forward together, the passage was
 * written alongside the source even when no sentence resembles one.
 */
export function alignPassage(ours: string, theirs: string, source: string): Alignment {
  const mine = sentences(ours).map(contentWords).filter((c) => c.length >= DEFAULTS.minWords);
  const ourText = sentences(ours).filter((s) => contentWords(s).length >= DEFAULTS.minWords);
  const theirText = sentences(theirs).filter((s) => contentWords(s).length >= DEFAULTS.minWords);
  const source_ = theirText.map(contentWords);

  const pairs: Alignment["pairs"] = [];
  mine.forEach((a, i) => {
    let best = { index: -1, similarity: 0 };
    source_.forEach((b, j) => {
      const similarity = orderedOverlap(a, b) / Math.min(a.length, b.length);
      if (similarity > best.similarity) best = { index: j, similarity };
    });
    // Below this a "counterpart" is noise and its position means nothing.
    if (best.index >= 0 && best.similarity >= 0.25) {
      pairs.push({
        ours: ourText[i]!,
        theirs: theirText[best.index]!,
        theirIndex: best.index,
        similarity: best.similarity,
      });
    }
  });

  let forward = 0;
  for (let i = 1; i < pairs.length; i += 1) {
    if (pairs[i]!.theirIndex > pairs[i - 1]!.theirIndex) forward += 1;
  }

  const monotonic = pairs.length > 1 ? forward / (pairs.length - 1) : 0;
  const meanSimilarity =
    pairs.length > 0 ? pairs.reduce((n, p) => n + p.similarity, 0) / pairs.length : 0;

  return {
    source,
    pairs,
    monotonic,
    meanSimilarity,
    // Four points is where a shared order stops being a coincidence of how
    // rules are usually explained.
    follows: pairs.length >= 4 && monotonic >= 0.75 && meanSimilarity >= 0.3,
  };
}

/** Source texts stashed for one game, keyed by filename. */
function sourcesFor(id: string): Map<string, string> {
  const dir = join(SOURCES_DIR, id);
  if (!existsSync(dir)) return new Map();

  return new Map(
    readdirSync(dir)
      .filter((name) => name.endsWith(".txt"))
      .map((name) => [name, readFileSync(join(dir, name), "utf8")]),
  );
}

function checkGame(game: CardGame, limits: Thresholds): Match[] {
  const sources = sourcesFor(game.id);
  if (sources.size === 0) return [];

  return FIELDS.flatMap((field) =>
    [...sources].flatMap(([name, text]) => compare(game[field], text, name, limits)),
  );
}

function main(): number {
  const argv = process.argv;
  const only = argv.includes("--game") ? argv[argv.indexOf("--game") + 1] : undefined;

  // The bar is measured, not chosen: whatever our own entries manage against
  // each other, a real source has to beat.
  const all = loadGames();
  const limits: Thresholds = argv.includes("--min")
    ? { ...DEFAULTS, order: Number(argv[argv.indexOf("--min") + 1]) }
    : baseline(all.flatMap((g) => [g.setup, g.play, g.goal_and_scoring]));

  console.log(
    `Bar: ${(limits.order * 100).toFixed(0)}% in order, or ${limits.run} words verbatim — ` +
      `the 99th percentile of what\n${all.length} entries that copy nothing from each other ` +
      `already score against each other.\n`,
  );

  if (!existsSync(SOURCES_DIR)) {
    console.error(
      `No ${SOURCES_DIR}\n\n` +
        "Put the plain text of each source under .sources/<game-id>/<source>.txt\n" +
        "and re-run. The directory is gitignored: it holds other people's prose\n" +
        "for the length of a check and should be deleted afterwards.",
    );
    return 1;
  }

  const games = loadGames().filter((game) => !only || game.id === only);
  if (games.length === 0) {
    console.error(only ? `No game with id "${only}".` : "No games.");
    return 1;
  }

  let checked = 0;
  let flagged = 0;

  for (const game of games) {
    const sources = sourcesFor(game.id);
    if (sources.size === 0) continue;
    checked += 1;

    const matches = checkGame(game, limits).sort((a, b) => b.order - a.order);
    const follows = FIELDS.flatMap((field) =>
      [...sources]
        .map(([name, text]) => alignPassage(game[field], text, `${name}:${field}`))
        .filter((a) => a.follows),
    );

    if (matches.length === 0 && follows.length === 0) {
      console.log(`ok   ${game.id} (${sources.size} source${sources.size === 1 ? "" : "s"})`);
      continue;
    }

    flagged += 1;
    const reuse = matches.filter((m) => m.tier === "reuse");
    const candidates = matches.filter((m) => m.tier === "candidate");
    console.log(`FLAG ${game.id}`);

    if (reuse.length > 0) {
      console.log(`  REUSE — ${reuse.length}; identical wording, rewrite these`);
      for (const match of reuse) {
        console.log(`    ${match.run} words verbatim — ${match.source}`);
        console.log(`      ours:   ${match.ours}`);
        console.log(`      source: ${match.theirs}`);
      }
    }

    if (candidates.length > 0) {
      console.log(`  READ  — ${candidates.length}; close enough to judge by eye`);
      for (const match of candidates) {
        console.log(`    ${(match.order * 100).toFixed(0)}% in order — ${match.source}`);
        console.log(`      ours:   ${match.ours}`);
        console.log(`      source: ${match.theirs}`);
      }
    }

    for (const alignment of follows) {
      console.log(
        `  ORDER — ${alignment.source}: ${alignment.pairs.length} points in the source's own ` +
          `sequence (${(alignment.monotonic * 100).toFixed(0)}% forward). Reorganise, not reword.`,
      );
    }
    console.log("");
  }

  const missing = loadGames().filter(
    (game) => (!only || game.id === only) && sourcesFor(game.id).size === 0,
  );

  console.log(`\n${checked} entr${checked === 1 ? "y" : "ies"} checked, ${flagged} flagged.`);
  if (missing.length > 0) {
    // Never let "nothing was flagged" read as "everything was checked". That
    // mistake has been made on this corpus before.
    console.log(
      `${missing.length} entr${missing.length === 1 ? "y has" : "ies have"} no source text ` +
        `and were NOT checked:\n  ${missing.map((g) => g.id).join(", ")}`,
    );
  }

  console.log(
    "\nREUSE is a finding. READ and ORDER are reading lists: paraphrase that " +
      "swaps the vocabulary\nscores like independent writing, so nothing here " +
      "can certify an entry clean — only find the ones\nworth looking at.",
  );

  return flagged > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main());
}
