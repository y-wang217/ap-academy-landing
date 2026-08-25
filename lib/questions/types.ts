/**
 * The question-generation contract.
 *
 * Every generator, validator, and verifier in `lib/questions/` compiles against
 * this file. Treat it as the spec: the TSDoc on each symbol states an invariant
 * that something downstream relies on. Changing a shape here means auditing
 * `validate.ts` and `verify.ts` in the same commit.
 *
 * Design rules that hold across the whole module:
 * - Generators are **pure**. No I/O, no clock, no `Math.random` (see `rng.ts`).
 * - Exact arithmetic only. Numbers that reach a student go through `rational.ts`,
 *   never through floating point. `0.30000000000000004` in an answer choice
 *   destroys trust in the product.
 * - LaTeX is produced without `$` delimiters. The rendering layer wraps it.
 */

/**
 * Stable identifier for a curriculum unit, e.g. `"mhf4u-u3-polynomial-equations"`.
 *
 * Convention: `<course>-u<n>-<kebab-topic>`, lowercase. Not validated at runtime —
 * it is a grouping key for reporting and for the future curation UI. The only
 * hard invariant is that `QuestionInstance.unitId` equals the `unitId` of the
 * generator that produced it (validator rule `UNIT_MISMATCH`).
 */
export type UnitId = string;

/**
 * Stable identifier for a problem archetype within a unit, e.g. `"factor-theorem-find-k"`.
 *
 * Convention: kebab-case, verb-ish, describes what the student *does*. Two
 * generators may share a `problemTypeId` when they differ only in difficulty.
 * Must match between generator and emitted instance (validator rule
 * `PROBLEM_TYPE_MISMATCH`).
 */
export type ProblemTypeId = string;

/**
 * House difficulty convention, rendered on worksheets as ■ / ■■ / ■■■.
 *
 * 1 = single-step, mechanical recall of the method.
 * 2 = the standard textbook exercise; two or three chained steps.
 * 3 = requires choosing the method, or an extra inference before the method applies.
 *
 * Deliberately a closed union rather than `number` so a generator cannot declare
 * a difficulty the worksheet templates have no glyph for.
 */
export type Difficulty = 1 | 2 | 3;

/**
 * A fragment of LaTeX **without** `$` or `\(` delimiters — the caller wraps it.
 *
 * May mix prose and math (`"Given $f(x)$..."` is wrong; write
 * `"Given f(x) = x^3 + 2x, find k."` and let the renderer decide). Validated for
 * balanced braces and well-formed `\frac` by `validate.ts`; nothing else about
 * it is checked, so producing sane LaTeX is the generator's responsibility.
 */
export type LatexString = string;

/**
 * A named misconception a generator can deliberately express as a wrong answer.
 *
 * The point of the whole harness: a distractor is only useful if it is the
 * answer a real student would arrive at by making a specific, nameable mistake.
 * Random wrong numbers teach nothing and are trivially eliminated.
 *
 * Every generator declares its full strategy list up front; `verify.ts` flags any
 * declared strategy that never actually appears across 500 seeds, which catches
 * the common bug of a distractor branch that is unreachable in practice.
 */
export interface DistractorStrategy {
  /**
   * Stable `snake_case` key, e.g. `"sign_error_on_root"`. Referenced by
   * `Choice.strategyId`. Stable across releases — diagnostics aggregate on it,
   * so renaming one silently breaks historical reporting.
   */
  id: string;
  /**
   * Human-readable name shown in the curation UI, e.g. `"Sign error on the root"`.
   * Sentence case, no trailing period.
   */
  label: string;
}

/**
 * One of the four answer options presented to the student.
 */
export interface Choice {
  /** The rendered option. No `$` delimiters. */
  latex: LatexString;
  /** Exactly one `Choice` in a `QuestionInstance` has this set to `true`. */
  isCorrect: boolean;
  /**
   * Which misconception produced this option.
   *
   * **Required on every incorrect choice**, and must be the `id` of one of the
   * strategies its generator declares (validator rules `MISSING_STRATEGY_ID` and
   * `UNKNOWN_STRATEGY_ID`). Omitted on the correct choice; a `strategyId` on the
   * correct choice is meaningless but not currently an error.
   */
  strategyId?: string;
}

/**
 * A single generated question, fully realised and ready to render.
 *
 * Produced only by `Generator.generate(seed)`. The same `(generator, seed)` pair
 * must always produce a deeply identical instance — `verify.ts` treats any
 * variation as a fatal error, because non-determinism means a worksheet cannot be
 * regenerated from its seed and an answer key can silently stop matching.
 */
export interface QuestionInstance {
  /** The `id` of the `Generator` that produced this instance. */
  generatorId: string;
  /** The seed passed to `generate`. Together with `generatorId`, reproduces this instance exactly. */
  seed: number;
  /** Must equal the producing generator's `unitId`. */
  unitId: UnitId;
  /** Must equal the producing generator's `problemTypeId`. */
  problemTypeId: ProblemTypeId;
  /** Must equal the producing generator's `difficulty`. */
  difficulty: Difficulty;
  /** The question as posed. May mix prose and math. Non-empty, no unfilled placeholders. */
  stem: LatexString;
  /**
   * Exactly 4 options, exactly one with `isCorrect: true`, **already shuffled**.
   *
   * The generator owns the shuffle (via `Rng.shuffle`, so it stays seed-reproducible).
   * Consumers must render them in array order — re-shuffling downstream would break
   * the answer key. `verify.ts` checks the correct answer's index distribution across
   * seeds and flags a generator that parks the answer in one slot too often.
   */
  choices: Choice[];
  /**
   * The worked solution, one array element per step, in order.
   *
   * Written for a tutor to read aloud to a student, not as bare algebra: say what
   * is being done and why before showing the line. At least two steps — a one-line
   * solution is an answer, not a worked solution (validator rule `SOLUTION_TOO_SHORT`).
   */
  solution: LatexString[];
  /**
   * Short prose naming the concept under test, e.g. `"Factor theorem: a factor
   * (x - r) means f(r) = 0"`.
   *
   * Used for diagnostics — when a student misses a question, this is the line that
   * shows up in their report. Non-empty; not a slug, write it as a sentence fragment.
   */
  conceptTag: string;
}

/**
 * A parameterized question factory for one problem archetype at one difficulty.
 *
 * Implementations live under `lib/questions/generators/<course>/` and are registered
 * by hand in `lib/questions/generators/index.ts`. See
 * `generators/mhf4u/u3-factor-theorem-find-k.ts` for the reference implementation —
 * new generators are written by copying it.
 */
export interface Generator {
  /**
   * Globally unique, stable id, e.g. `"mhf4u-u3-factor-theorem-find-k"`.
   * Doubles as the CLI argument to `verify:questions` and as
   * `QuestionInstance.generatorId`.
   */
  id: string;
  /** Declared unit. Every emitted instance must carry this same value. */
  unitId: UnitId;
  /** Declared problem archetype. Every emitted instance must carry this same value. */
  problemTypeId: ProblemTypeId;
  /** Declared difficulty. Every emitted instance must carry this same value. */
  difficulty: Difficulty;
  /**
   * Every misconception this generator can express.
   *
   * The validator rejects any distractor whose `strategyId` is not in this list,
   * and `verify.ts` warns about entries that never appear across all seeds. Keep
   * it exhaustive and keep it honest: a strategy listed but never produced is a
   * dead branch.
   */
  strategies: DistractorStrategy[];
  /**
   * Build the instance for `seed`.
   *
   * **Must be pure and total.** Same seed in, deeply identical instance out, forever.
   * All randomness comes from `createRng(seed)`; `Math.random` is banned module-wide
   * and there is a test that greps for it. Must not throw for any non-negative
   * integer seed — `verify.ts` reports a throw as a crash against that seed.
   */
  generate(seed: number): QuestionInstance;
}
