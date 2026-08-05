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

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { CardGame } from "naibi";
import { GAMES_DIR, PROSE_FIELDS, loadGames, proseFingerprint } from "naibi";

const SOURCES_DIR = fileURLToPath(new URL("../../.sources", import.meta.url));

/**
 * Every passage of ours worth comparing, from one entry.
 *
 * PROSE_FIELDS decides which fields those are — see its note in `naibi`. Empty
 * ones are dropped rather than compared, so an optional field that an entry
 * does not carry costs nothing here.
 */
function passagesOf(game: CardGame): string[] {
  return PROSE_FIELDS.map((field) => game[field] ?? "").filter((text) => text.length > 0);
}

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
 *
 * Two rows rather than the whole table, because this runs once per sentence
 * pair and the full table was allocating a fresh array per row of every call.
 * The values are identical -- a row only ever reads the row above it.
 */
export function orderedOverlap(a: string[], b: string[], weigh: Weigher = UNIFORM): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  let current = new Array<number>(b.length + 1).fill(0);

  for (let i = 0; i < a.length; i += 1) {
    const word = a[i]!;
    // Once per row, not once per cell: rarity() is a map lookup and a log.
    const weight = weigh(word);
    for (let j = 0; j < b.length; j += 1) {
      current[j + 1] =
        word === b[j] ? previous[j]! + weight : Math.max(previous[j + 1]!, current[j]!);
    }
    const spent = previous;
    previous = current;
    current = spent;
  }
  return previous[b.length]!;
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
 * How many pairs a measurement over the corpus is allowed to look at.
 *
 * This number is the difference between a cost that is flat in the size of the
 * corpus and one that is quadratic in it. The bar below is a percentile of a
 * distribution, and a percentile is estimated from a representative sample —
 * it does not need every pair, and taking every pair is what made this the
 * slowest thing in the project.
 *
 * Set where the estimate stops moving, not at the smallest number that runs
 * fast. Corpus sizes of 18, 36, 54 and 72 games were each scored exhaustively —
 * every ordered pair, 46,440 of them at 72 games — and then sampled at eight
 * different phases and compared against that. At this many pairs the order bar
 * came out at the exhaustive value in 30 of those 32 combinations and one step
 * above it in the other two, the run bar within a word, and the share of
 * held-out pairs clearing the result stayed between 1.6% and 2.9% against
 * exhaustive values of 1.9% to 2.5%.
 *
 * At 3,600 none of that holds: 36 games gave bars from 0.71 to 0.83 depending
 * on which pairs were drawn, and rates from 0.6% to 5.8% against an exhaustive
 * 1.9% — the last of those close enough to the 6% the tests assert to fail on a
 * corpus nobody had changed.
 *
 * The reason the fall-off is so sharp is that scores near the top of this
 * distribution are small ratios — 5/7, 7/9, 4/5 — so a sample that misses a few
 * of the highest pairs does not land slightly low, it lands a whole step low.
 */
export const PAIR_SAMPLE = 5400;

/**
 * A deterministic, fixed-size sample of ordered pairs drawn from `count` items.
 *
 * Three properties, each of which the sampler is built around:
 *
 * - **Bounded.** At most `budget` pairs, however large the corpus gets, which
 *   is the whole point. The one exception is deliberate: every item is paired
 *   at least once, so past `budget` *items* — 1,800 games — the count grows
 *   with the corpus rather than dropping entries out of the measurement.
 * - **Spread.** The partners of item `i` are taken at a wide stride and shifted
 *   by `i`, not taken from among its neighbours. That matters here because
 *   neighbouring passages are the same game's other fields: the stride-7 sweep
 *   this replaces always included `i + 1`, which made 2.15% of its pairs
 *   same-game against 0.93% of all pairs. This sampler measures 0.93%.
 * - **Deterministic.** No clock, no randomness — the same corpus gives the same
 *   bar on every machine and every run, which a measured threshold has to.
 *
 * `phase` shifts which partners are drawn. Phases 0 and 1 have no pair in
 * common (nor does any pair of phases below the stride), so a caller wanting to
 * check a measurement against pairs it was not measured from can ask for one.
 */
export function* samplePairs(
  count: number,
  budget = PAIR_SAMPLE,
  phase = 0,
): Generator<[number, number]> {
  if (count < 2) return;

  const offsets = count - 1;
  const partners = Math.min(offsets, Math.max(1, Math.floor(budget / count)));
  const stride = Math.max(1, Math.floor(offsets / partners));

  for (let i = 0; i < count; i += 1) {
    for (let p = 0; p < partners; p += 1) {
      yield [i, (i + 1 + ((p * stride + i + phase) % offsets)) % count];
    }
  }
}

/**
 * What "written alike by coincidence" looks like, measured on this corpus.
 *
 * A sample of our own entries is compared pair by pair, and the high percentile
 * of what that produces becomes the bar a real source has to clear. It is a
 * null distribution built from writing that is known not to be copied, which is
 * the only honest reference available without a labelled corpus.
 *
 * Deterministic, and worth doing once per run rather than once per question.
 */
export function baseline(
  passages: readonly string[],
  percentile = 0.99,
  budget = PAIR_SAMPLE,
): Thresholds {
  const orders: number[] = [];
  const runs: number[] = [];
  const wide: Thresholds = { order: 0, run: Number.MAX_SAFE_INTEGER, minWords: 5 };
  // Tokenised once each rather than once per pair: at this many pairs every
  // passage is read a dozen times over, and splitting it is not free.
  const ready = passages.map((text) => prepare(text, wide));

  for (const [i, j] of samplePairs(passages.length, budget)) {
    // The BEST coincidental match between two unrelated passages is the right
    // null: the question is whether a source match is unusual, and every weak
    // match counted separately would just drag the percentile down.
    const found = comparePrepared(ready[i]!, ready[j]!, "baseline", wide);
    if (found.length === 0) continue;
    orders.push(Math.max(...found.map((m) => m.order)));
    runs.push(Math.max(...found.map((m) => m.run)));
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

/** One sentence, tokenised once, with what a comparison needs to skip it cheaply. */
type Tokens = {
  text: string;
  content: string[];
  raw: string[];
  contentSet: Set<string>;
  rawSet: Set<string>;
  mass: number;
};

/** A passage's sentences, tokenised. Only the ones long enough to mean anything. */
export type Tokenised = readonly Tokens[];

/**
 * Split and tokenise a passage once.
 *
 * compare() does this for both sides on every call, which is right for the
 * handful of calls a real check makes and wrong for the thousands baseline()
 * makes — there, every passage would be re-split a dozen times over.
 */
export function prepare(
  text: string,
  limits: Thresholds = DEFAULTS,
  weigh: Weigher = UNIFORM,
): Tokenised {
  return sentences(text)
    .map((sentence) => {
      const content = contentWords(sentence);
      const raw = words(sentence);
      return {
        text: sentence,
        content,
        raw,
        contentSet: new Set(content),
        rawSet: new Set(raw),
        mass: mass(content, weigh),
      };
    })
    .filter((s) => s.content.length >= limits.minWords);
}

/**
 * The most a pair of sentences could possibly score, from the words they share.
 *
 * A subsequence can only be built from words both sentences have, and a run of
 * identical words is a subsequence too, so counting the shorter sentence's
 * words that appear in the longer one at all bounds both of the measures below.
 * It is loose — it ignores order entirely, which is the thing being measured —
 * but it is O(words) against the O(words²) it lets us skip, and card-game
 * sentences overwhelmingly share nothing but a verb.
 *
 * Counting the shorter sentence's words is what makes it a ceiling and not a
 * guess: a subsequence can use a word no more often than the sentence with
 * fewer copies of it has it, and the shorter sentence has at least that many.
 * It holds for any weigher that never returns a negative, which rarity() is
 * clamped to be — a negative weight would already have made the score itself
 * nonsense, as rarity() says.
 */
function ceiling(a: Tokens, b: Tokens, weigh: Weigher): { order: number; run: number } {
  const [short, long] = a.content.length <= b.content.length ? [a, b] : [b, a];
  let shared = 0;
  for (const word of short.content) if (long.contentSet.has(word)) shared += weigh(word);

  const [shortRaw, longRaw] = a.raw.length <= b.raw.length ? [a, b] : [b, a];
  let sharedRaw = 0;
  for (const word of shortRaw.raw) if (longRaw.rawSet.has(word)) sharedRaw += 1;

  return { order: shared / Math.min(a.mass, b.mass), run: sharedRaw };
}

/**
 * Slack on the ceiling, so no rounding can hide a match.
 *
 * With UNIFORM the ceiling and the overlap are both sums of ones and agree
 * exactly. A weigher returning reals could round the two sums differently, by
 * an ulp or so — orders of magnitude below the smallest gap between two real
 * scores, but free to allow for.
 */
const CEILING_SLACK = 1e-9;

/** Every one of our sentences that tracks a source sentence too closely. */
export function comparePrepared(
  ours: Tokenised,
  theirs: Tokenised,
  source: string,
  limits: Thresholds = DEFAULTS,
  weigh: Weigher = UNIFORM,
): Match[] {
  const found: Match[] = [];

  for (const a of ours) {
    let worst: Match | null = null;

    for (const b of theirs) {
      // Skip the two O(words²) scans when the words on the page already say
      // they cannot matter. Exact, not approximate: once a match is in hand,
      // only a higher score can replace it, and until then only a score that
      // clears one of the thresholds is reported at all.
      const most = ceiling(a, b, weigh);
      if (
        worst
          ? most.order + CEILING_SLACK < worst.order
          : most.order + CEILING_SLACK < limits.order && most.run < limits.run
      ) {
        continue;
      }

      const order = orderedOverlap(a.content, b.content, weigh) / Math.min(a.mass, b.mass);

      // The run is only ever needed for a match that could still be kept: it
      // breaks ties and it decides the tier of whatever wins. A source sentence
      // already beaten on order does neither, so it does not get scanned.
      if (worst && order < worst.order) continue;

      const run = longestRun(a.raw, b.raw);
      if (order < limits.order && run < limits.run) continue;

      // Keep the single worst source sentence per sentence of ours: a passage
      // matching five pages of a source is one problem, not five.
      if (!worst || order > worst.order || (order === worst.order && run > worst.run)) {
        worst = {
          tier: run >= limits.run ? "reuse" : "candidate",
          ours: a.text,
          theirs: b.text,
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

/** The same, from raw prose. */
export function compare(
  ours: string,
  theirs: string,
  source: string,
  limits: Thresholds = DEFAULTS,
  weigh: Weigher = UNIFORM,
): Match[] {
  return comparePrepared(
    prepare(ours, limits, weigh),
    prepare(theirs, limits, weigh),
    source,
    limits,
    weigh,
  );
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

  return PROSE_FIELDS.flatMap((field) => {
    const ours = game[field];
    if (!ours) return [];
    return [...sources].flatMap(([name, text]) => compare(ours, text, name, limits));
  });
}

/**
 * Record that an entry has been read against its sources.
 *
 * Explicit ids only, never "everything that came back quiet". Stamping is a
 * person saying they read the pairs, and a tool that stamps whatever it failed
 * to flag would be certifying its own blind spot — which, given that thorough
 * paraphrase scores like independent writing, is precisely the thing it cannot
 * see. The date is passed in rather than read from the clock so a run is
 * reproducible.
 */
/**
 * Which attributed sources a set of source files stands for.
 *
 * What a check actually had is the files that were on disk for the comparison,
 * not whatever the entry attributes — `sources_consulted` lists pages that were
 * never pulled, which is the whole reason it cannot answer the question. The
 * filenames are slugs, so they are matched back to the attributed names rather
 * than written raw: a recorded source nobody can trace to an attribution is
 * worse than no record, because it reads like one.
 *
 * Anything unmatched comes back in `stray` rather than being dropped, so the
 * caller refuses instead of silently recording a shorter list than was read.
 */
export function sourcesRead(
  attributed: readonly string[],
  files: readonly string[],
): { read: string[]; stray: string[] } {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const read: string[] = [];
  const stray: string[] = [];
  for (const file of [...files].sort()) {
    const stem = file.replace(/\.txt$/, "");
    const match = attributed.find((name) => slug(name) === slug(stem));
    (match ? read : stray).push(match ?? stem);
  }
  return { read, stray };
}

/** Two, because one source cannot corroborate itself. */
export const SOURCES_PER_CHECK = 2;

function stamp(ids: readonly string[], today: string): number {
  const known = new Map(loadGames().map((g) => [g.id, g]));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    console.error(`No such game: ${unknown.join(", ")}`);
    return 1;
  }

  const stamps = new Map<string, string[]>();
  for (const id of ids) {
    const { read, stray } = sourcesRead(known.get(id)!.sources_consulted, [
      ...sourcesFor(id).keys(),
    ]);
    if (stray.length > 0) {
      console.error(
        `${id}: source file(s) ${stray.map((s) => `"${s}"`).join(", ")} match nothing in ` +
          `sources_consulted. Rename the file to the attributed name, or add the source there.`,
      );
      return 1;
    }
    if (read.length < SOURCES_PER_CHECK) {
      console.error(
        `${id}: only ${read.length} source read. A check needs ${SOURCES_PER_CHECK} -- one ` +
          "source cannot corroborate itself. Fetch another, or leave the entry unstamped.",
      );
      return 1;
    }
    stamps.set(id, read);
  }

  for (const id of ids) {
    const path = join(GAMES_DIR, `${id}.json`);
    const entry = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    entry["checked"] = {
      date: today,
      prose: proseFingerprint(known.get(id)!),
      sources: stamps.get(id),
    };
    writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`);
  }

  console.log(`Stamped ${ids.length} entr${ids.length === 1 ? "y" : "ies"} as checked ${today}.`);
  return 0;
}

function main(): number {
  if (process.argv.includes("--stamp")) {
    const rest = process.argv.slice(process.argv.indexOf("--stamp") + 1);
    const date = rest.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
    const ids = rest.filter((a) => a !== date && !a.startsWith("--"));
    if (!date || ids.length === 0) {
      console.error("Usage: npm run originality -- --stamp YYYY-MM-DD <game-id>...");
      return 1;
    }
    return stamp(ids, date);
  }

  const argv = process.argv;
  const only = argv.includes("--game") ? argv[argv.indexOf("--game") + 1] : undefined;

  // The bar is measured, not chosen: whatever our own entries manage against
  // each other, a real source has to beat.
  const all = loadGames();
  const passages = all.flatMap(passagesOf);
  const chosen = argv.includes("--min");
  const limits: Thresholds = chosen
    ? { ...DEFAULTS, order: Number(argv[argv.indexOf("--min") + 1]) }
    : baseline(passages);

  // Say what the bar was measured over, not just what it came out at. A sample
  // is the honest thing to take a percentile from, but a reader told only the
  // number would reasonably assume every pair went into it. And a bar given on
  // the command line was not measured at all, which this used to claim it was.
  const bar = `Bar: ${(limits.order * 100).toFixed(0)}% in order, or ${limits.run} words verbatim`;
  if (chosen) {
    console.log(`${bar} — given with --min, not measured.\n`);
  } else {
    const drawn = [...samplePairs(passages.length)].length;
    console.log(
      `${bar} — the 99th percentile of\n${drawn} passage pairs sampled from ${all.length} ` +
        "entries that copy nothing from each other.\n",
    );
  }

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
    const follows = PROSE_FIELDS.flatMap((field) => {
      const ours = game[field];
      if (!ours) return [];
      return [...sources]
        .map(([name, text]) => alignPassage(ours, text, `${name}:${field}`))
        .filter((a) => a.follows);
    });

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
