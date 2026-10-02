/**
 * Exact rational arithmetic over `bigint`.
 *
 * Floating point is banned from anything a student sees. `0.1 + 0.2` renders as
 * `0.30000000000000004`, and one such answer choice destroys trust in the whole
 * product — a parent who spots it assumes the tutoring is as sloppy as the
 * worksheet. Every number that reaches a stem, a choice, or a solution step goes
 * through this type.
 *
 * Representation invariant, maintained by `make()` and relied on everywhere else:
 * - `den > 0n` — the sign lives on the numerator, always.
 * - `gcd(|num|, den) === 1n` — stored in lowest terms.
 * - zero is exactly `{ num: 0n, den: 1n }`.
 *
 * Because the invariant is total, `equals` is a plain field comparison and
 * `toLatex` never has to think about a negative denominator.
 *
 * Note on `bigint` literals: this repo targets ES2017, where `0n` is a compile
 * error, so the module uses named `BigInt(...)` constants instead. Do not
 * "clean this up" into literals without bumping `target` in tsconfig.json.
 */

const ZERO_B = BigInt(0);
const ONE_B = BigInt(1);

/**
 * An exact rational number. Treat as immutable — every operation returns a new
 * value. Construct only through `fromInt`, `fromFraction`, or an operation;
 * building the object literal by hand bypasses normalization and breaks
 * `equals`, `compare`, and `toLatex` in ways that surface far from the cause.
 */
export interface Rational {
  /** Numerator. Carries the sign of the value. */
  readonly num: bigint;
  /** Denominator. Always strictly positive, always coprime with `num`. */
  readonly den: bigint;
}

/** Greatest common divisor of two non-negative bigints. `gcd(0, n) === n`. */
function gcd(a: bigint, b: bigint): bigint {
  let x = a < ZERO_B ? -a : a;
  let y = b < ZERO_B ? -b : b;
  while (y !== ZERO_B) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * The only constructor that enforces the representation invariant.
 *
 * Normalizes sign onto the numerator and reduces to lowest terms.
 * @throws {RangeError} if `den` is zero.
 */
function make(num: bigint, den: bigint): Rational {
  if (den === ZERO_B) {
    throw new RangeError('Rational cannot have a zero denominator');
  }
  let n = num;
  let d = den;
  if (d < ZERO_B) {
    n = -n;
    d = -d;
  }
  if (n === ZERO_B) {
    // Canonical zero, so equals() and toLatex() have exactly one case to handle.
    return { num: ZERO_B, den: ONE_B };
  }
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Builds the integer `n` as a `Rational`.
 *
 * Accepts `number` or `bigint`; a non-integer `number` throws rather than
 * silently truncating, because a truncation here would reintroduce exactly the
 * inexactness this module exists to prevent.
 */
export function fromInt(n: number | bigint): Rational {
  if (typeof n === 'number' && !Number.isInteger(n)) {
    throw new TypeError(`fromInt requires an integer, received ${n}`);
  }
  return { num: BigInt(n), den: ONE_B };
}

/**
 * Builds `num / den`, normalized.
 *
 * @throws {RangeError} if `den` is zero.
 * @throws {TypeError} if either argument is a non-integer `number`.
 */
export function fromFraction(num: number | bigint, den: number | bigint): Rational {
  if (typeof num === 'number' && !Number.isInteger(num)) {
    throw new TypeError(`fromFraction requires integer arguments, received numerator ${num}`);
  }
  if (typeof den === 'number' && !Number.isInteger(den)) {
    throw new TypeError(`fromFraction requires integer arguments, received denominator ${den}`);
  }
  return make(BigInt(num), BigInt(den));
}

/** Exact zero. */
export const ZERO: Rational = fromInt(0);
/** Exact one. */
export const ONE: Rational = fromInt(1);

/** `a + b`, exact. */
export function add(a: Rational, b: Rational): Rational {
  return make(a.num * b.den + b.num * a.den, a.den * b.den);
}

/** `a - b`, exact. */
export function sub(a: Rational, b: Rational): Rational {
  return make(a.num * b.den - b.num * a.den, a.den * b.den);
}

/** `a * b`, exact. */
export function mul(a: Rational, b: Rational): Rational {
  return make(a.num * b.num, a.den * b.den);
}

/**
 * `a / b`, exact.
 *
 * @throws {RangeError} if `b` is zero. Division by zero is a generator bug — a
 * question whose answer is undefined must never reach a student — so it throws
 * rather than returning a sentinel that could be rendered.
 */
export function div(a: Rational, b: Rational): Rational {
  if (b.num === ZERO_B) {
    throw new RangeError('Rational division by zero');
  }
  return make(a.num * b.den, a.den * b.num);
}

/** `-a`. */
export function neg(a: Rational): Rational {
  return { num: -a.num, den: a.den };
}

/** `|a|`. */
export function abs(a: Rational): Rational {
  return a.num < ZERO_B ? { num: -a.num, den: a.den } : a;
}

/**
 * `a ** exponent` for integer exponents, including negative ones.
 *
 * `pow(a, 0)` is `1` for every `a`, including zero — the convention every
 * textbook this harness targets uses.
 *
 * @throws {TypeError} if `exponent` is not an integer.
 * @throws {RangeError} if `a` is zero and `exponent` is negative.
 */
export function pow(a: Rational, exponent: number): Rational {
  if (!Number.isInteger(exponent)) {
    throw new TypeError(`pow requires an integer exponent, received ${exponent}`);
  }
  if (exponent === 0) return ONE;
  if (exponent < 0) {
    if (a.num === ZERO_B) {
      throw new RangeError('Rational zero cannot be raised to a negative power');
    }
    return pow(inverse(a), -exponent);
  }
  // Exponentiation by squaring, so a large exponent stays cheap on bigints.
  let result = ONE;
  let base = a;
  let e = exponent;
  while (e > 0) {
    if (e % 2 === 1) result = mul(result, base);
    base = mul(base, base);
    e = Math.floor(e / 2);
  }
  return result;
}

/**
 * `1 / a`.
 * @throws {RangeError} if `a` is zero.
 */
export function inverse(a: Rational): Rational {
  if (a.num === ZERO_B) {
    throw new RangeError('Rational zero has no inverse');
  }
  return make(a.den, a.num);
}

/**
 * Exact value equality.
 *
 * A plain field comparison is sufficient *because* of the representation
 * invariant: `2/4` and `1/2` are both stored as `{1n, 2n}`.
 */
export function equals(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

/** `-1` if `a < b`, `0` if equal, `1` if `a > b`. Exact; no float coercion. */
export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.num * b.den;
  const right = b.num * a.den;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** True when the value is a whole number, i.e. the denominator reduced to 1. */
export function isInteger(a: Rational): boolean {
  return a.den === ONE_B;
}

/** True when the value is exactly zero. */
export function isZero(a: Rational): boolean {
  return a.num === ZERO_B;
}

/** `-1`, `0`, or `1` — the sign of the value. */
export function signOf(a: Rational): -1 | 0 | 1 {
  if (a.num < ZERO_B) return -1;
  if (a.num > ZERO_B) return 1;
  return 0;
}

/**
 * Renders for display, without `$` delimiters.
 *
 * - Integers render bare: `3`, `-3`, `0`.
 * - Fractions render as `\frac{a}{b}`.
 * - Negatives put the minus **outside** the fraction: `-\frac{1}{2}`.
 *   Never `\frac{-1}{2}`, which is mathematically fine but reads as sloppy
 *   handwriting and is not how any textbook this harness targets sets it.
 *
 * The denominator is always positive by the representation invariant, so there
 * is no `\frac{1}{-2}` case to handle.
 */
export function toLatex(a: Rational): string {
  if (a.den === ONE_B) {
    return a.num.toString();
  }
  if (a.num < ZERO_B) {
    return `-\\frac{${(-a.num).toString()}}{${a.den.toString()}}`;
  }
  return `\\frac{${a.num.toString()}}{${a.den.toString()}}`;
}

/**
 * Plain-text rendering for diagnostics and test failure messages, e.g. `-1/2`.
 * Never shown to a student — use `toLatex` for that.
 */
export function toString(a: Rational): string {
  return a.den === ONE_B ? a.num.toString() : `${a.num.toString()}/${a.den.toString()}`;
}

/**
 * Lossy conversion to `number`, for ordering heuristics only.
 *
 * Used by `equivalence.ts` to ask "is this distractor absurdly far from the
 * answer" — a question where float error is irrelevant. **Never** use it to
 * produce a value a student sees; that is the exact bug this module prevents.
 * Returns `Infinity` / `-Infinity` when the value exceeds float range.
 */
export function toNumber(a: Rational): number {
  return Number(a.num) / Number(a.den);
}
