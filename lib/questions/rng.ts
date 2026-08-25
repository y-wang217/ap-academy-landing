/**
 * Deterministic seeded randomness for question generation.
 *
 * `Math.random` is banned throughout `lib/questions/` — there is a test
 * (`no-math-random.test.ts`) that greps the tree and fails the build if it
 * appears outside a comment. A generator that reaches for the global RNG stops
 * being reproducible from its seed, which means a printed worksheet can no
 * longer be regenerated and its answer key can silently drift.
 *
 * The algorithm is `mulberry32` — a well-known 32-bit generator, chosen because
 * it is four lines, has no state beyond one uint32, and is stable across Node
 * versions. Do not swap it for something "better": every seed in every committed
 * worksheet depends on this exact bit pattern.
 */

/**
 * Core mulberry32 step. Returns a float in `[0, 1)`.
 *
 * Reference implementation by Tommy Ettinger / bryc (public domain). Kept
 * verbatim; the `>>>` and `|0` coercions are load-bearing, not stylistic.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded random source. Every method advances the same internal stream, so the
 * *sequence* of calls a generator makes is part of its identity: inserting an
 * extra `rng.int()` early changes every value after it. That is expected and is
 * why `verify.ts` re-runs determinism checks rather than trusting past output.
 *
 * All ranges are **inclusive on both ends** — the single most common source of
 * off-by-one bugs in generators is a half-open range, so this module does not
 * offer one.
 */
export interface Rng {
  /**
   * Raw float in `[0, 1)`. Prefer the typed helpers; reach for this only when
   * building a new primitive.
   */
  next(): number;
  /**
   * Integer in `[min, max]`, both ends inclusive. Throws if `min > max`.
   */
  int(min: number, max: number): number;
  /**
   * Integer in `[min, max]` that is not in `excluded`.
   *
   * Rejection-samples, then falls back to an exhaustive scan, so it is safe on
   * dense exclusion sets. Throws if every value in the range is excluded — a
   * generator asking for the impossible is a bug, not a case to paper over.
   */
  intExcluding(min: number, max: number, excluded: number[]): number;
  /**
   * Integer in `[min, max]`, never `0`.
   *
   * A primitive rather than a caller-side loop because "I forgot the coefficient
   * could be zero" is the single most common generator bug: a zero leading
   * coefficient collapses a cubic to a quadratic, a zero root makes the factor
   * theorem trivial. Throws if the range contains only `0`.
   */
  nonZeroInt(min: number, max: number): number;
  /** Uniformly picks one element. Throws on an empty array. */
  pick<T>(items: T[]): T;
  /**
   * Fisher–Yates shuffle. Returns a **new** array; the input is not mutated,
   * because generators routinely shuffle a `choices` array they also hold a
   * reference to.
   */
  shuffle<T>(items: T[]): T[];
  /** Returns `1` or `-1` with equal probability. For varying sign patterns across seeds. */
  sign(): 1 | -1;
}

/**
 * Builds an `Rng` for `seed`.
 *
 * Seeds are non-negative integers; `verify.ts` sweeps `0..n-1`. Seed `0` is
 * valid and must produce a usable question — mulberry32 handles it fine, but a
 * generator that special-cases falsy seeds will not.
 */
export function createRng(seed: number): Rng {
  if (!Number.isInteger(seed)) {
    throw new TypeError(`Rng seed must be an integer, received ${String(seed)}`);
  }
  const next = mulberry32(seed);

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new TypeError(`Rng.int bounds must be integers, received (${min}, ${max})`);
    }
    if (min > max) {
      throw new RangeError(`Rng.int called with min ${min} greater than max ${max}`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  const intExcluding = (min: number, max: number, excluded: number[]): number => {
    const banned = new Set(excluded);
    // Rejection sampling is O(1) for the usual case of one or two exclusions.
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = int(min, max);
      if (!banned.has(candidate)) return candidate;
    }
    // Dense exclusion set: enumerate what is left and pick from it, so the
    // result stays uniform and the call still terminates.
    const allowed: number[] = [];
    for (let v = min; v <= max; v += 1) {
      if (!banned.has(v)) allowed.push(v);
    }
    if (allowed.length === 0) {
      throw new RangeError(
        `Rng.intExcluding has no candidates left in [${min}, ${max}] after exclusions`,
      );
    }
    return allowed[int(0, allowed.length - 1)];
  };

  const rng: Rng = {
    next,
    int,
    intExcluding,
    nonZeroInt(min: number, max: number): number {
      if (min === 0 && max === 0) {
        throw new RangeError('Rng.nonZeroInt called with the range [0, 0]');
      }
      return intExcluding(min, max, [0]);
    },
    pick<T>(items: T[]): T {
      if (items.length === 0) {
        throw new RangeError('Rng.pick called with an empty array');
      }
      return items[int(0, items.length - 1)];
    },
    shuffle<T>(items: T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    sign(): 1 | -1 {
      return next() < 0.5 ? -1 : 1;
    },
  };

  return rng;
}
