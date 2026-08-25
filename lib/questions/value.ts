/**
 * Canonical answer values.
 *
 * A `Choice` carries both what it *renders as* (`latex`) and what it *is*
 * (`value`). This module is the second half.
 *
 * The original design had the validator parse LaTeX back into a `Rational` to
 * prove two distractors were different. That works for integers and simple
 * fractions and falls apart the moment a unit produces `\frac{\pi}{3}`,
 * `\log_2 5`, `2\sqrt{3}`, or a solution set — the parser either throws or,
 * far worse, silently declines to compare and ships a question with two correct
 * answers under a green test suite. The generator already knows the value it
 * computed. It says so, instead of the validator reverse-engineering it.
 *
 * **Exact arithmetic throughout.** `Rational` and `bigint` everywhere;
 * `approx` is the only function in this file that produces a float, and its
 * output is never shown to a student or used to grade an answer.
 */

import {
  type Rational,
  ONE,
  ZERO,
  compare as compareRational,
  equals as equalsRational,
  fromFraction,
  fromInt,
  isInteger,
  isZero,
  mul,
  pow as powRational,
  signOf,
  toLatex as rationalToLatex,
  toNumber,
  toString as rationalToString,
} from './rational.ts';
import type { LatexString } from './types.ts';

const ZERO_B = BigInt(0);
const ONE_B = BigInt(1);

/** Tokens for answers that are not numbers at all. */
export type SpecialToken = 'no-solution' | 'all-reals' | 'undefined';

/**
 * Every answer shape the algebraic units of MHF4U produce.
 *
 * Construct through the helper constructors below rather than as object
 * literals, and pass results through `canonicalize` before comparing — the
 * comparison functions do that for you, but a hand-built literal that skips it
 * will not compare the way you expect.
 */
export type QValue =
  /** An exact rational number. The common case. */
  | { kind: 'rational'; value: Rational }
  /** `coeff * sqrt(radicand)`. `radicand` is a non-negative integer. */
  | { kind: 'surd'; coeff: Rational; radicand: bigint }
  /** `coeff * pi`. Kept symbolic so `\frac{\pi}{3}` never becomes `1.047...`. */
  | { kind: 'piMultiple'; coeff: Rational }
  /** `log_base(argument)`. Both strictly positive; `base` is not 1. */
  | { kind: 'log'; base: Rational; argument: Rational }
  /** `base ^ exponent`. */
  | { kind: 'power'; base: Rational; exponent: Rational }
  /** A solution set, e.g. the answers to a trig equation over `[0, 2pi)`. */
  | { kind: 'set'; members: QValue[] }
  /** An answer that is not a number. */
  | { kind: 'special'; token: SpecialToken }
  /**
   * Escape hatch for a value this union cannot express.
   *
   * **Use sparingly.** Two opaque values compare equal only when their
   * `canonical` strings match exactly, so a generator that leans on this gets
   * weaker distinctness checking — precisely the failure this module exists to
   * remove. If a shape shows up more than twice, add a kind for it instead.
   */
  | { kind: 'opaque'; canonical: string; approx: number };

// --- constructors -------------------------------------------------------------

/** `QValue` for an exact rational. */
export function qRational(value: Rational): QValue {
  return { kind: 'rational', value };
}

/** `QValue` for an integer. */
export function qInt(n: number | bigint): QValue {
  return { kind: 'rational', value: fromInt(n) };
}

/** `QValue` for `num / den`. */
export function qFraction(num: number | bigint, den: number | bigint): QValue {
  return { kind: 'rational', value: fromFraction(num, den) };
}

/** `QValue` for `coeff * sqrt(radicand)`. */
export function qSurd(coeff: Rational, radicand: number | bigint): QValue {
  return { kind: 'surd', coeff, radicand: BigInt(radicand) };
}

/** `QValue` for `coeff * pi`. */
export function qPi(coeff: Rational): QValue {
  return { kind: 'piMultiple', coeff };
}

/** `QValue` for `log_base(argument)`. */
export function qLog(base: Rational, argument: Rational): QValue {
  return { kind: 'log', base, argument };
}

/** `QValue` for `base ^ exponent`. */
export function qPower(base: Rational, exponent: Rational): QValue {
  return { kind: 'power', base, exponent };
}

/** `QValue` for a solution set. Members are canonicalized, sorted and de-duplicated. */
export function qSet(members: QValue[]): QValue {
  return { kind: 'set', members };
}

/** `QValue` for a non-numeric answer. */
export function qSpecial(token: SpecialToken): QValue {
  return { kind: 'special', token };
}

/** Escape-hatch `QValue`. See the warning on the `opaque` variant. */
export function qOpaque(canonical: string, approxValue: number): QValue {
  return { kind: 'opaque', canonical, approx: approxValue };
}

// --- canonicalization ---------------------------------------------------------

/** Integer square root of a non-negative bigint, by Newton's method. */
function bigintSqrt(n: bigint): bigint {
  if (n < ZERO_B) throw new RangeError('bigintSqrt of a negative value');
  if (n < BigInt(2)) return n;
  let x = n;
  let y = (x + ONE_B) / BigInt(2);
  while (y < x) {
    x = y;
    y = (x + n / x) / BigInt(2);
  }
  return x;
}

/**
 * Splits `radicand` into `(outside, inside)` with `radicand = outside^2 * inside`
 * and `inside` square-free.
 *
 * `sqrt(12)` becomes `(2, 3)`, so the value renders as `2\sqrt{3}` rather than
 * `\sqrt{12}` — and, more importantly, so `\sqrt{12}` and `2\sqrt{3}` are
 * recognised as the same number instead of shipping as two choices.
 */
function extractSquareFactor(radicand: bigint): { outside: bigint; inside: bigint } {
  let outside = ONE_B;
  let inside = radicand;
  let factor = BigInt(2);
  while (factor * factor <= inside) {
    const square = factor * factor;
    while (inside % square === ZERO_B) {
      inside /= square;
      outside *= factor;
    }
    factor += ONE_B;
  }
  return { outside, inside };
}

/**
 * Whether `argument` is an exact integer power of `base`, and if so which.
 *
 * Used to collapse `log_2(8)` to `3`. Without it a generator can put
 * `\log_2 8` and `3` on the same paper as two different options.
 * Only handles positive integer bases and arguments — the fractional cases do
 * not arise in this course and guessing at them would add risk for nothing.
 */
function integerLogExponent(base: Rational, argument: Rational): number | null {
  if (!isInteger(base) || !isInteger(argument)) return null;
  if (base.num < BigInt(2) || argument.num < ONE_B) return null;
  let acc = ONE_B;
  for (let exponent = 0; exponent <= 64; exponent += 1) {
    if (acc === argument.num) return exponent;
    if (acc > argument.num) return null;
    acc *= base.num;
  }
  return null;
}

/**
 * Normalizes a value so that structurally-equal values become identical objects.
 *
 * **Idempotent** — `canonicalize(canonicalize(v))` deep-equals `canonicalize(v)`,
 * and there is a test asserting it over every kind. Anything that breaks
 * idempotency breaks `valuesEqual`, because comparison canonicalizes both sides
 * and then compares structurally.
 *
 * @throws {RangeError} on a value that is not well formed: a negative radicand,
 * a non-positive log argument or base, a base of 1, `0^negative`. Validator rule
 * 9 catches these, so a generator that computes nonsense fails its sweep rather
 * than rendering it.
 */
export function canonicalize(value: QValue): QValue {
  switch (value.kind) {
    case 'rational':
      return value;

    case 'surd': {
      if (value.radicand < ZERO_B) {
        throw new RangeError(`surd has a negative radicand: ${value.radicand.toString()}`);
      }
      // Zero coefficient or a zero radicand: the whole term is zero.
      if (isZero(value.coeff) || value.radicand === ZERO_B) return qRational(ZERO);
      const { outside, inside } = extractSquareFactor(value.radicand);
      const coeff = mul(value.coeff, fromInt(outside));
      // A square-free part of 1 means the root was perfect; it is a rational.
      if (inside === ONE_B) return qRational(coeff);
      return { kind: 'surd', coeff, radicand: inside };
    }

    case 'piMultiple':
      return isZero(value.coeff) ? qRational(ZERO) : value;

    case 'log': {
      if (signOf(value.base) !== 1 || equalsRational(value.base, ONE)) {
        throw new RangeError(`log has an invalid base: ${rationalToString(value.base)}`);
      }
      if (signOf(value.argument) !== 1) {
        throw new RangeError(
          `log has a non-positive argument: ${rationalToString(value.argument)}`,
        );
      }
      // log_b(1) = 0 for every base.
      if (equalsRational(value.argument, ONE)) return qRational(ZERO);
      const exponent = integerLogExponent(value.base, value.argument);
      if (exponent !== null) return qRational(fromInt(exponent));
      return value;
    }

    case 'power': {
      if (isZero(value.exponent)) {
        if (isZero(value.base)) {
          throw new RangeError('power 0^0 is undefined');
        }
        return qRational(ONE);
      }
      if (isZero(value.base)) {
        if (signOf(value.exponent) === -1) {
          throw new RangeError('power 0 raised to a negative exponent is undefined');
        }
        return qRational(ZERO);
      }
      if (equalsRational(value.base, ONE)) return qRational(ONE);
      // An integer exponent is computable exactly, so it collapses to a rational.
      // This is what stops 2^{3} and 8 shipping as two separate choices.
      if (isInteger(value.exponent)) {
        return qRational(powRational(value.base, Number(value.exponent.num)));
      }
      return value;
    }

    case 'set': {
      const canonicalMembers = value.members.map(canonicalize);
      const deduped: QValue[] = [];
      for (const member of canonicalMembers) {
        if (!deduped.some((existing) => sameCanonicalValue(existing, member))) {
          deduped.push(member);
        }
      }
      // Sorted by approximation so that {a, b} and {b, a} are the same value.
      // The tie-break on rendering keeps the order total when two members
      // approximate alike (a near-collision the validator will flag anyway).
      deduped.sort((a, b) => {
        const delta = approx(a) - approx(b);
        if (delta !== 0 && !Number.isNaN(delta)) return delta;
        return toLatex(a).localeCompare(toLatex(b));
      });
      return { kind: 'set', members: deduped };
    }

    case 'special':
      return value;

    case 'opaque':
      return value;
  }
}

// --- approximation ------------------------------------------------------------

/**
 * Floating-point approximation of a value.
 *
 * **Only for cross-kind comparison and for ordering set members.** Never for
 * display, never for grading, never for anything a student sees. The whole
 * reason `rational.ts` exists is that `0.1 + 0.2` renders as
 * `0.30000000000000004`; routing a displayed value through here would put that
 * back on the paper.
 *
 * Returns `NaN` for `special`, which makes every epsilon comparison against it
 * false — the correct outcome, since "no solution" is not near any number.
 */
export function approx(value: QValue): number {
  switch (value.kind) {
    case 'rational':
      return toNumber(value.value);
    case 'surd':
      return toNumber(value.coeff) * Math.sqrt(Number(value.radicand));
    case 'piMultiple':
      return toNumber(value.coeff) * Math.PI;
    case 'log':
      return Math.log(toNumber(value.argument)) / Math.log(toNumber(value.base));
    case 'power':
      return Math.pow(toNumber(value.base), toNumber(value.exponent));
    case 'set':
      // A set needs *a* number for ordering against other sets. The sum is
      // deterministic and order-independent, which is all that is required —
      // it is never used to decide whether two sets are equal.
      return value.members.reduce((total, member) => total + approx(member), 0);
    case 'special':
      return Number.NaN;
    case 'opaque':
      return value.approx;
  }
}

// --- comparison ---------------------------------------------------------------

/**
 * Tolerance for cross-kind comparison.
 *
 * Tight, because it is only ever reached when two values of *different* kinds
 * land on the same number — `\log_2 8` against `3`, say, if canonicalization
 * did not already collapse it.
 */
export const CROSS_KIND_EPSILON = 1e-9;

/** Structural comparison of two already-canonical values of the same kind. */
function sameCanonicalValue(a: QValue, b: QValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'rational':
      return equalsRational(a.value, (b as typeof a).value);
    case 'surd': {
      const other = b as typeof a;
      return equalsRational(a.coeff, other.coeff) && a.radicand === other.radicand;
    }
    case 'piMultiple':
      return equalsRational(a.coeff, (b as typeof a).coeff);
    case 'log': {
      const other = b as typeof a;
      return equalsRational(a.base, other.base) && equalsRational(a.argument, other.argument);
    }
    case 'power': {
      const other = b as typeof a;
      return equalsRational(a.base, other.base) && equalsRational(a.exponent, other.exponent);
    }
    case 'set': {
      const other = b as typeof a;
      if (a.members.length !== other.members.length) return false;
      // Both sides are canonical, so members are already in the same order.
      return a.members.every((member, index) => sameCanonicalValue(member, other.members[index]));
    }
    case 'special':
      return a.token === (b as typeof a).token;
    case 'opaque':
      return a.canonical === (b as typeof a).canonical;
  }
}

/**
 * Whether two values are the same number.
 *
 * Canonicalizes both sides. Same kind means an exact structural comparison,
 * through `Rational.equals` and bigint equality — no float involved. Different
 * kinds fall back to comparing `approx` within `CROSS_KIND_EPSILON`.
 *
 * **The cross-kind fallback is deliberately generous**, and that direction is
 * chosen on purpose: a false positive makes the validator flag a collision that
 * turns out to be fine, which costs a minute of a human's attention. A false
 * negative ships a question with two correct answers. Sets and specials are
 * exempt from it — a set is not "nearly" a number, and summing its members to
 * compare against a scalar would invent collisions that do not exist.
 */
export function valuesEqual(a: QValue, b: QValue): boolean {
  const left = canonicalize(a);
  const right = canonicalize(b);
  if (left.kind === right.kind) return sameCanonicalValue(left, right);

  // Cross-kind: only meaningful between scalar kinds.
  const scalarOnly = (value: QValue): boolean =>
    value.kind !== 'set' && value.kind !== 'special';
  if (!scalarOnly(left) || !scalarOnly(right)) return false;

  const leftApprox = approx(left);
  const rightApprox = approx(right);
  if (!Number.isFinite(leftApprox) || !Number.isFinite(rightApprox)) return false;
  return Math.abs(leftApprox - rightApprox) < CROSS_KIND_EPSILON;
}

/** Whether a value canonicalizes to exactly zero. Handy for non-degeneracy guards. */
export function isZeroValue(value: QValue): boolean {
  const canonical = canonicalize(value);
  return canonical.kind === 'rational' && isZero(canonical.value);
}

/**
 * Orders two values by approximation, for sorting answers into a natural order.
 * Not a total order across every kind — use only where ties are harmless.
 */
export function compareValues(a: QValue, b: QValue): number {
  const left = approx(canonicalize(a));
  const right = approx(canonicalize(b));
  if (Number.isNaN(left) || Number.isNaN(right)) return 0;
  return left < right ? -1 : left > right ? 1 : 0;
}

// --- rendering ----------------------------------------------------------------

/**
 * Renders `coeff * symbol`, folding the coefficient into the symbol the way it
 * is written by hand: `\pi`, `-\pi`, `2\pi`, `\frac{2\pi}{3}`, `-\frac{\pi}{3}`.
 *
 * The sign always sits outside the fraction, never in the numerator.
 */
function renderCoefficientTimesSymbol(coeff: Rational, symbol: string): string {
  const negative = signOf(coeff) === -1;
  const magnitude = negative ? { num: -coeff.num, den: coeff.den } : coeff;
  const sign = negative ? '-' : '';

  if (magnitude.den === ONE_B) {
    if (magnitude.num === ONE_B) return `${sign}${symbol}`;
    return `${sign}${magnitude.num.toString()}${symbol}`;
  }
  const numerator =
    magnitude.num === ONE_B ? symbol : `${magnitude.num.toString()}${symbol}`;
  return `${sign}\\frac{${numerator}}{${magnitude.den.toString()}}`;
}

/**
 * Canonical LaTeX for a value, without `$` delimiters.
 *
 * This is what validator rule 10 compares a choice's own `latex` against, so a
 * generator that computes one thing and displays another gets caught.
 */
export function toLatex(value: QValue): LatexString {
  const canonical = canonicalize(value);
  switch (canonical.kind) {
    case 'rational':
      return rationalToLatex(canonical.value);

    case 'surd':
      return renderCoefficientTimesSymbol(
        canonical.coeff,
        `\\sqrt{${canonical.radicand.toString()}}`,
      );

    case 'piMultiple':
      return renderCoefficientTimesSymbol(canonical.coeff, '\\pi');

    case 'log':
      return `\\log_{${rationalToLatex(canonical.base)}}\\left(${rationalToLatex(canonical.argument)}\\right)`;

    case 'power': {
      const base = isInteger(canonical.base) && signOf(canonical.base) >= 0
        ? rationalToLatex(canonical.base)
        : `\\left(${rationalToLatex(canonical.base)}\\right)`;
      return `${base}^{${rationalToLatex(canonical.exponent)}}`;
    }

    case 'set':
      // Escaped braces: the validator treats \{ and \} as literal characters.
      return `\\{${canonical.members.map(toLatex).join(', ')}\\}`;

    case 'special':
      switch (canonical.token) {
        case 'no-solution':
          return '\\text{no solution}';
        case 'all-reals':
          return '\\mathbb{R}';
        case 'undefined':
          return '\\text{undefined}';
      }
      break;

    case 'opaque':
      return canonical.canonical;
  }
  // Unreachable while QValue stays a closed union; kept so a future variant
  // added without a render arm fails loudly rather than returning undefined.
  throw new RangeError(`toLatex has no arm for ${JSON.stringify(value)}`);
}

/** Plain-text rendering for diagnostics and test failure messages. Never shown to a student. */
export function toDebugString(value: QValue): string {
  const canonical = canonicalize(value);
  switch (canonical.kind) {
    case 'rational':
      return rationalToString(canonical.value);
    case 'surd':
      return `${rationalToString(canonical.coeff)}*sqrt(${canonical.radicand.toString()})`;
    case 'piMultiple':
      return `${rationalToString(canonical.coeff)}*pi`;
    case 'log':
      return `log_${rationalToString(canonical.base)}(${rationalToString(canonical.argument)})`;
    case 'power':
      return `${rationalToString(canonical.base)}^${rationalToString(canonical.exponent)}`;
    case 'set':
      return `{${canonical.members.map(toDebugString).join(', ')}}`;
    case 'special':
      return canonical.token;
    case 'opaque':
      return `opaque(${canonical.canonical})`;
  }
}

/** Re-exported so generators can build ordered sets without importing rational.ts directly. */
export { compareRational };
