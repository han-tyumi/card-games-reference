/**
 * The closeness detector.
 *
 * The whole point is the case a phrase search cannot see: a sentence that
 * follows a source's clause order with different words in the slots. Nothing is
 * quoted, so nothing is searchable, and every pass on this corpus that relied on
 * searching phrases missed exactly this. So the fixtures below are real examples
 * of that shape, and the detector has to catch them while leaving genuinely
 * independent writing alone.
 *
 * Both directions matter. A detector that flags everything is as useless as one
 * that flags nothing — it just moves the work to whoever reads the report.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { loadGames } from "naibi";
import {
  DEFAULTS,
  alignPassage,
  baseline,
  compare,
  contentWords,
  longestRun,
  orderedOverlap,
  sentences,
  SOURCES_PER_CHECK,
  sourcesRead,
  words,
} from "../originality.ts";

const flags = (ours: string, theirs: string) => compare(ours, theirs, "fixture");
const flagged = (ours: string, theirs: string) => flags(ours, theirs).length > 0;

// --- the pieces -----------------------------------------------------------

test("prose splits into sentences, bullets included", () => {
  assert.deepEqual(sentences("One thing. Two things!\n- Three things"), [
    "One thing.",
    "Two things!",
    "Three things",
  ]);
});

test("function words are dropped but card vocabulary is not", () => {
  // "deal", "trick", "trump" are the signal, not noise: two sentences naming
  // the same actions in the same order is the thing being looked for.
  assert.deepEqual(contentWords("The dealer deals a trick to the player with the trump"), [
    "dealer",
    "deals",
    "trick",
    "player",
    "trump",
  ]);
});

test("ordered overlap counts matches in sequence, allowing gaps", () => {
  assert.equal(orderedOverlap(["a", "b", "c"], ["a", "x", "b", "y", "c"]), 3);
  assert.equal(orderedOverlap(["a", "b", "c"], ["c", "b", "a"]), 1, "order matters");
  assert.equal(orderedOverlap(["a", "b"], ["x", "y"]), 0);
  assert.equal(orderedOverlap([], ["a"]), 0);
});

test("longest run counts only consecutive words", () => {
  assert.equal(longestRun(words("one two three four"), words("zero one two three nine")), 3);
  assert.equal(longestRun(words("one two three"), words("three two one")), 1);
  assert.equal(longestRun(words("nothing alike"), words("totally different")), 0);
});

// --- the failure mode this project actually has ---------------------------

test("a sentence following a source's clause order is caught, though it quotes nothing", () => {
  const theirs =
    "The dealer deals five cards to each player, one at a time, and places the " +
    "remaining cards face down in the middle of the table to form the stock.";
  // Same things named in the same order; every joining word changed. No shared
  // phrase for a search to find.
  const ours =
    "Each player receives five cards, dealt singly by the dealer, after which " +
    "what is left of the pack goes face down at the centre as a stock.";

  const [match] = flags(ours, theirs);
  assert.ok(match, "the exact shape this detector exists for went unflagged");
  assert.ok(match.order >= DEFAULTS.order, `order was only ${match.order.toFixed(2)}`);
  assert.ok(match.run < DEFAULTS.run, "fixture accidentally shares a long phrase");

  // Not a verdict. Nothing is quoted, so this is a pair worth reading, and the
  // report says so rather than pretending to have decided.
  assert.equal(match.tier, "candidate");
});

test("near-verbatim reuse is a finding, not a suggestion", () => {
  const [match] = flags(
    "The player to the left of the dealer leads the first trick.",
    "The player to the left of the dealer leads to the first trick.",
  );
  assert.equal(match!.tier, "reuse");
});

test("the two tiers are separated by a measured gap, not a guess", () => {
  const source =
    "The dealer deals five cards to each player, one at a time, and places the " +
    "remaining cards face down in the middle of the table to form the stock.";

  const copy = flags(
    "Each player receives five cards, dealt singly by the dealer, after which " +
      "what is left of the pack goes face down at the centre as a stock.",
    source,
  );
  const rewrite = compare(
    "Set the undealt pack down as a stock before anyone picks up. Hands are " +
      "five, and it does not matter whether you deal them singly or in one go.",
    source,
    "f",
    { ...DEFAULTS, order: 0 },
  );

  // The threshold has to sit between these two, or it is decoration.
  assert.ok(copy[0]!.order > DEFAULTS.order, "the copy scores below the bar");
  assert.ok(
    Math.max(...rewrite.map((m) => m.order)) < DEFAULTS.order,
    "an independent rewrite scores above the bar",
  );
});

test("a near-verbatim sentence is caught on the run alone", () => {
  const theirs = "The player to the left of the dealer leads to the first trick.";
  const ours = "The player to the left of the dealer leads the first trick.";

  const [match] = flags(ours, theirs);
  assert.ok(match);
  assert.ok(match.run >= DEFAULTS.run, `longest run was only ${match.run}`);
});

test("genuinely independent writing about the same rule is left alone", () => {
  const theirs =
    "The dealer deals five cards to each player, one at a time, and places the " +
    "remaining cards face down in the middle of the table to form the stock.";
  // Same rule, reorganised: the stock first, the hand size as a consequence,
  // different emphasis. This is what a rewrite is supposed to look like.
  const ours =
    "Set the undealt pack down as a stock before anyone picks up. Hands are " +
    "five, and it does not matter whether you deal them singly or in one go.";

  assert.equal(flagged(ours, theirs), false, "a legitimate rewrite was flagged");
});

test("two entries about unrelated games do not match each other", () => {
  const theirs = "Aces are low and the game ends when a player has no cards left.";
  const ours = "Shuffle the tiles and build a wall two rows high around the table.";
  assert.equal(flagged(ours, theirs), false);
});

test("shared card-game boilerplate alone is not a match", () => {
  // Every rulebook says these. Flagging them would bury the real findings.
  const theirs = "Shuffle the deck. The player to the dealer's left goes first.";
  const ours = "Shuffle the deck. The player to the dealer's left goes first.";
  const found = flags(ours, theirs);

  // They ARE identical, so being flagged is correct — but only because they are
  // identical, not because they are short and common.
  assert.ok(found.length > 0);
  assert.ok(
    flags("Shuffle the deck.", "Shuffle the deck. Then deal.").length === 0,
    "a sentence too short to carry structure was flagged",
  );
});

// --- reporting ------------------------------------------------------------

test("one sentence of ours yields one finding, not one per source sentence", () => {
  const theirs =
    "The dealer deals five cards to each player one at a time. " +
    "The dealer deals five cards to each player one at a time, then stops. " +
    "The dealer deals five cards to each player one at a time again.";
  const ours = "The dealer deals five cards to each player one at a time.";

  assert.equal(flags(ours, theirs).length, 1, "the same problem reported three times");
});

test("a finding carries both sentences, so it can be judged rather than trusted", () => {
  const theirs = "The player to the left of the dealer leads to the first trick.";
  const [match] = flags("The player to the left of the dealer leads the first trick.", theirs);

  assert.ok(match);
  assert.equal(match.theirs, theirs, "the source sentence is not reported");
  assert.ok(match.ours.length > 0);
  assert.equal(match.source, "fixture");
});

test("thresholds can be loosened without touching the code", () => {
  const theirs = "Deal seven cards each and turn the next card up to start the discard pile.";
  const ours = "Give everyone seven cards, then turn one card up as the discard pile.";

  const strict = compare(ours, theirs, "f", { ...DEFAULTS, order: 0.95 });
  const loose = compare(ours, theirs, "f", { ...DEFAULTS, order: 0.3 });
  assert.ok(loose.length >= strict.length);
  assert.equal(strict.length, 0);
});

test("empty or missing source text finds nothing rather than throwing", () => {
  assert.deepEqual(flags("Some prose here about dealing cards.", ""), []);
  assert.deepEqual(flags("", "Some source prose about dealing cards."), []);
});

// --- against the corpus ---------------------------------------------------

test("a fixed threshold cannot separate copying from formulaic prose", () => {
  // Not a failing test — a recorded measurement, and the reason baseline()
  // exists. Sixty entries that copy nothing from each other still match each
  // other in their hundreds at any fixed bar, because there is one natural way
  // to write "deal seven cards to each player, one at a time".
  const games = loadGames();
  let matches = 0;

  for (let i = 0; i < games.length; i += 1) {
    for (let j = i + 1; j < games.length; j += 1) {
      matches += compare(games[i]!.play, games[j]!.play, games[j]!.id).length;
    }
  }

  assert.ok(
    matches > 100,
    `only ${matches} — if this has dropped, the corpus or the metric changed ` +
      "and the claim in DEFAULTS' comment needs re-measuring",
  );
});

test("the bar is measured from the corpus, and our own entries mostly clear it", () => {
  const games = loadGames();
  const passages = games.flatMap((g) => [g.setup, g.play, g.goal_and_scoring]);
  const bar = baseline(passages);

  // A percentile bar has to land above the floor, or it is not measuring
  // anything and the tool is back to a guessed constant.
  assert.ok(bar.order > DEFAULTS.order, `bar ${bar.order} did not beat the floor`);
  assert.ok(bar.order <= 1, "an impossible bar flags nothing");

  let over = 0;
  let pairs = 0;
  for (let i = 0; i < passages.length; i += 1) {
    for (let k = 1; k < passages.length; k += 7) {
      const j = (i + k) % passages.length;
      if (j === i) continue;
      pairs += 1;
      if (compare(passages[i]!, passages[j]!, "x", bar).length > 0) over += 1;
    }
  }

  // Two independent 99th-percentile conditions, so a couple of per cent is
  // right. Much more and the bar is decoration; much less and it is unreachable.
  const rate = over / pairs;
  assert.ok(rate > 0.001 && rate < 0.06, `${(rate * 100).toFixed(1)}% cleared their own bar`);
});

test("a verbatim copy clears the measured bar that formulaic prose does not", () => {
  const games = loadGames();
  const bar = baseline(games.flatMap((g) => [g.setup, g.play, g.goal_and_scoring]));

  // The end-to-end property: paste an entry back at itself and it must be
  // caught by the same bar our own unrelated entries sit under.
  const self = compare(games[0]!.play, games[0]!.play, "itself", bar);
  assert.ok(self.length > 0, "an exact copy of an entry did not clear the bar");
});

// --- passage order --------------------------------------------------------

test("a passage that walks a source in the source's own order is flagged", () => {
  // No sentence here is close to its counterpart. What gives it away is that
  // the same points arrive in the same sequence.
  const theirs = [
    "The dealer shuffles and deals seven cards to each player.",
    "The rest of the pack is placed face down to form the stock.",
    "The top card of the stock is turned over to start the discard pile.",
    "The player to the dealer's left plays first.",
    "A player who cannot play must draw from the stock.",
  ].join(" ");
  const ours = [
    "Whoever deals gives out seven apiece after a shuffle.",
    "What remains of the pack sits face down as a stock.",
    "Flip the stock's top card over to begin the discard pile.",
    "Play opens with the person on the dealer's left.",
    "Anyone unable to play draws from the stock instead.",
  ].join(" ");

  const alignment = alignPassage(ours, theirs, "fixture");
  assert.equal(alignment.follows, true, "a passage tracking the source went unflagged");
  assert.ok(alignment.monotonic >= 0.75, `only ${alignment.monotonic} moved forward`);
});

test("the same points in a different order are not flagged", () => {
  // Covering the same ground is not copying. Covering it in someone else's
  // sequence is the signal.
  const theirs = [
    "The dealer shuffles and deals seven cards to each player.",
    "The rest of the pack is placed face down to form the stock.",
    "The top card of the stock is turned over to start the discard pile.",
    "The player to the dealer's left plays first.",
    "A player who cannot play must draw from the stock.",
  ].join(" ");
  const ours = [
    "Anyone unable to play draws from the stock instead.",
    "Play opens with the person on the dealer's left.",
    "What remains of the pack sits face down as a stock.",
    "Whoever deals gives out seven apiece after a shuffle.",
  ].join(" ");

  assert.equal(alignPassage(ours, theirs, "fixture").follows, false);
});

test("a short passage cannot establish an order", () => {
  const alignment = alignPassage(
    "The dealer shuffles and deals seven cards to each player.",
    "The dealer shuffles and deals seven cards to each player. Then play begins.",
    "fixture",
  );
  assert.equal(alignment.follows, false, "one sentence was treated as a sequence");
});

// --- what this cannot do --------------------------------------------------

test("paraphrase that replaces the vocabulary scores like independent writing", () => {
  // Documented, not tolerated. A rewrite that keeps a source's structure but
  // swaps nearly every noun and verb is not mechanically separable from honest
  // writing, which is exactly why the report calls these reading lists and why
  // nothing here can certify an entry clean.
  const theirs = "The dealer deals five cards to each player one at a time.";
  const ours = "Five go to everybody, handed out singly by whoever is dealing.";

  const found = compare(ours, theirs, "f", { ...DEFAULTS, order: 0 });
  assert.ok(found[0]!.order < DEFAULTS.order, "if this now scores high, tighten the docs");
});

// --- what a stamp is allowed to record ------------------------------------

test("source files are recorded under the names the entry attributes", () => {
  // The files are slugs and the attribution is prose. Recording the slug would
  // leave a name no reader could match to anything, so they are mapped back.
  const { read, stray } = sourcesRead(
    ["Pagat", "Bicycle Cards", "Wikibooks Solitaire card games"],
    ["bicycle-cards.txt", "pagat.txt"],
  );
  assert.deepEqual(read, ["Bicycle Cards", "Pagat"]);
  assert.deepEqual(stray, [], "a file that matches an attribution was treated as stray");
});

test("punctuation and case in an attribution do not stop it matching", () => {
  const { read, stray } = sourcesRead(["CardGames.io", "Wikipedia"], ["cardgames-io.txt"]);
  assert.deepEqual(read, ["CardGames.io"]);
  assert.deepEqual(stray, []);
});

test("a source the entry does not attribute comes back as stray, not dropped", () => {
  // Dropping it would record a shorter list than was actually read, which is
  // the failure mode worth guarding: the record would look complete and be
  // wrong. The caller refuses the whole stamp on any stray.
  const { read, stray } = sourcesRead(
    ["Pagat", "Wikipedia"],
    ["pagat.txt", "some-random-blog.txt", "wikipedia.txt"],
  );
  assert.deepEqual(read, ["Pagat", "Wikipedia"]);
  assert.deepEqual(stray, ["some-random-blog"], "an unattributed source was silently accepted");
});

test("one source is never enough for a check", () => {
  // Not a style rule. One source cannot corroborate itself, so a check with a
  // single source is the exact thing `checked.sources` exists to make visible.
  const { read } = sourcesRead(["Pagat", "Wikipedia"], ["pagat.txt"]);
  assert.equal(read.length, 1);
  assert.ok(read.length < SOURCES_PER_CHECK, "the floor no longer rejects a single source");
});

test("no sources on disk records nothing rather than an empty check", () => {
  const { read, stray } = sourcesRead(["Pagat"], []);
  assert.deepEqual(read, []);
  assert.deepEqual(stray, []);
  assert.ok(read.length < SOURCES_PER_CHECK, "an entry with no source text could be stamped");
});
