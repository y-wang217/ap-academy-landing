/**
 * Distinctness checks used by `validate.ts` to prove a question's distractors
 * are genuinely doing work.
 *
 * Two failure modes this file exists to catch:
 *
 * 1. **Duplicate options.** Two choices with the same value, or the same
 *    rendering, means the question has fewer than four real options. If both
 *    were wrong the question is still answerable, but the student is being
 *    tested on a narrower field than the paper claims.
 * 2. **Giveaway options.** A distractor so implausible that a student can
 *    eliminate it on sight answers the question without doing the mathematics.
 *    Four options where two are absurd is a two-option question.
 *
 * The giveaway heuristics are **deliberately crude** — they are placeholders for
 * judgement that only real student data can supply. They are therefore
 * structured as a named, individually-toggleable list (`TRIVIALITY_HEURISTICS`)
 * so a future session can retune thresholds, disable one, or add another without
 * touching the validator.
 */

import { type Rational, abs, compare, equals, isZero, mul } from './rational.ts';
import type { LatexString } from './types.ts';

/**
 * Exact value equality between two rationals.
 *
 * A thin re-export of `rational.equals`, named for the validator's vocabulary:
 * the validator asks "are these two choices equivalent", and reads better doing
 * so. Exact — `1/2` and `2/4` are equivalent, and no float tolerance is involved.
 */
export function areEquivalent(a: Rational, b: Rational): boolean {
  return equals(a, b);
}

/**
 * Collapses runs of whitespace and trims, so LaTeX that differs only in spacing
 * compares equal. `"\frac{1}{2}"` and `"\frac{1}  {2}"` render identically to a
 * student, so they must count as identical here.
 *
 * Intentionally *not* a full LaTeX normalizer: it does not know that `x^{2}` and
 * `x^2` are the same, and it should not pretend to. Value-level duplication is
 * caught by `areEquivalent`; this catches the textual case.
 *
 * Note the limit this implies: whitespace runs are *collapsed*, not deleted, so
 * `\frac{1} {2}` and `\frac{1}{2}` render alike but do not compare equal. That
 * is the intended trade — deleting whitespace outright would wrongly merge the
 * distinct prose fragments `"a b"` and `"ab"`. It costs nothing in practice
 * because both sides come from `Rational.toLatex`, whose output for a given
 * value is byte-identical.
 */
export function normalizeLatex(latex: LatexString): string {
  return latex.replace(/\s+/g, ' ').trim();
}

/**
 * True when two rendered strings are the same after whitespace normalization.
 *
 * Used on choices whose underlying value the validator cannot see — a generator
 * may emit a choice as an expression rather than a number, and two such choices
 * must still not be textually identical.
 */
export function areLatexIdentical(a: LatexString, b: LatexString): boolean {
  return normalizeLatex(a) === normalizeLatex(b);
}

/**
 * Context a heuristic may consult before judging a distractor.
 */
export interface TrivialityContext {
  /**
   * `true` when at least one of the generator's declared misconceptions could
   * legitimately produce zero.
   *
   * Zero is the ambiguous case: it is usually a giveaway, but "the student
   * subtracted instead of added and got zero" is a real, teachable error. A
   * generator declaring such a strategy opts out of the zero heuristic rather
   * than being forced to suppress a genuine distractor.
   */
  zeroIsPlausible?: boolean;
}

/**
 * One giveaway check. Returns `true` when the distractor is *too implausible* to
 * belong on the paper.
 */
export interface TrivialityHeuristic {
  /** Stable `snake_case` id, reported in the validator error so the cause is obvious. */
  id: string;
  /** One line explaining what the check protects against. Surfaced in reports. */
  description: string;
  /**
   * Toggle. A heuristic switched off here stops firing everywhere at once, which
   * is the point of the registry — thresholds here are guesses awaiting real
   * student data, and turning one off must not require editing the validator.
   */
  enabled: boolean;
  /** `true` means "this distractor is a giveaway". */
  test(correct: Rational, distractor: Rational, context: TrivialityContext): boolean;
}

/**
 * How many times larger (or smaller) than the correct answer a distractor may be
 * before it reads as a typo rather than a misconception.
 *
 * 100 is a guess. It is loose on purpose: a sign error or a dropped term usually
 * lands within one order of magnitude, so this only catches distractors that are
 * wrong by a whole scale — the kind a student eliminates without arithmetic.
 */
export const MAGNITUDE_RATIO_LIMIT = 100;

/**
 * How many times longer a distractor's rendering may be than the correct
 * answer's before its shape alone gives the game away.
 *
 * A choice three times the length of every other one is visually marked. In
 * multiple choice, "the odd-looking one" is a strategy students actively use.
 */
export const LENGTH_RATIO_LIMIT = 3;

/**
 * The giveaway checks, in the order the validator applies them.
 *
 * Each is individually toggleable via `enabled`, and each threshold is a named
 * exported constant, so tuning is a one-line change here rather than a rewrite.
 * These are crude by design — see the module doc.
 */
export const TRIVIALITY_HEURISTICS: TrivialityHeuristic[] = [
  {
    id: 'implausible_zero',
    description:
      'The distractor is 0 while the correct answer is not, and no declared strategy plausibly yields 0. Students discount a lone zero on sight.',
    enabled: true,
    test(correct, distractor, context) {
      if (context.zeroIsPlausible === true) return false;
      return isZero(distractor) && !isZero(correct);
    },
  },
  {
    id: 'magnitude_gap',
    description: `The distractor differs from the correct answer by a factor of more than ${MAGNITUDE_RATIO_LIMIT}. Wrong by a whole scale reads as a typo, not a misconception.`,
    enabled: true,
    test(correct, distractor) {
      // Zero on either side is not a magnitude question; implausible_zero owns it.
      if (isZero(correct) || isZero(distractor)) return false;
      const limit = { num: BigInt(MAGNITUDE_RATIO_LIMIT), den: BigInt(1) };
      const big = abs(correct);
      const small = abs(distractor);
      // |distractor| > limit * |correct|, or |correct| > limit * |distractor|,
      // compared exactly by cross-multiplication rather than by dividing.
      return compare(small, mul(limit, big)) === 1 || compare(big, mul(limit, small)) === 1;
    },
  },
  {
    id: 'length_gap',
    description: `The distractor's rendered length is more than ${LENGTH_RATIO_LIMIT}x the correct answer's. A visually distinct option is eliminated on shape alone.`,
    enabled: true,
    test(correct, distractor) {
      const correctLength = renderedLength(correct);
      const distractorLength = renderedLength(distractor);
      if (correctLength === 0) return false;
      return distractorLength > correctLength * LENGTH_RATIO_LIMIT;
    },
  },
];

/**
 * Rendered length of a value, counted as digits rather than LaTeX characters.
 *
 * `\frac{1}{2}` is 11 characters of markup but reads as two digits on the page.
 * Counting markup would make every fraction look "long" next to every integer
 * and fire the length heuristic constantly.
 */
function renderedLength(value: Rational): number {
  const digits = (b: bigint): number => (b < BigInt(0) ? -b : b).toString().length;
  return value.den === BigInt(1) ? digits(value.num) : digits(value.num) + digits(value.den);
}

/** Which heuristic fired, for reporting. */
export interface TrivialityVerdict {
  /** `true` when at least one enabled heuristic judged the distractor a giveaway. */
  trivial: boolean;
  /** Ids of the heuristics that fired. Empty when `trivial` is `false`. */
  firedHeuristicIds: string[];
  /** Human-readable reasons, one per fired heuristic. */
  reasons: string[];
}

/**
 * Runs every enabled heuristic and reports which fired.
 *
 * Prefer this over `isTriviallyDistinguishable` when you need to tell the author
 * *why* a distractor was rejected — the validator does, so its errors name the
 * heuristic rather than saying "too easy".
 */
export function explainTriviality(
  correct: Rational,
  distractor: Rational,
  context: TrivialityContext = {},
): TrivialityVerdict {
  const fired = TRIVIALITY_HEURISTICS.filter(
    (heuristic) => heuristic.enabled && heuristic.test(correct, distractor, context),
  );
  return {
    trivial: fired.length > 0,
    firedHeuristicIds: fired.map((h) => h.id),
    reasons: fired.map((h) => h.description),
  };
}

/**
 * `true` when a distractor is so implausible that the question is answerable
 * without doing the mathematics.
 *
 * The boolean face of `explainTriviality`, for callers that only need the verdict.
 */
export function isTriviallyDistinguishable(
  correct: Rational,
  distractor: Rational,
  context: TrivialityContext = {},
): boolean {
  return explainTriviality(correct, distractor, context).trivial;
}
