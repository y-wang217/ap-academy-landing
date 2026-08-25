/**
 * The overnight safety net.
 *
 * `verifyGenerator` runs a generator across a sweep of seeds and answers the
 * question this whole harness exists to answer: *is this generator
 * mathematically sound and pedagogically non-trivial, across the whole space it
 * can produce?* Spot-checking three seeds by hand proves nothing — the failures
 * that matter are the ones that appear at seed 214 and nowhere near seed 0.
 *
 * Findings are graded:
 * - **fatal** — the generator is broken. Non-determinism, an invalid instance, a
 *   crash. `verify:questions` exits non-zero.
 * - **warning** — the generator works but the questions are weak. Repeated
 *   stems, a predictable answer position, a declared misconception that never
 *   actually fires. These do not fail the build; they are the queue of things
 *   worth fixing before the questions reach a student.
 */

import { validateInstance, type ValidateOptions, type ValidationError } from './validate.ts';
import type { Generator, QuestionInstance } from './types.ts';

/** Severity of a single finding. Only `fatal` fails the run. */
export type FindingSeverity = 'fatal' | 'warning';

/** Stable finding codes, groupable across runs. */
export type FindingCode =
  /** The same seed produced two different instances. The generator is not pure. */
  | 'NON_DETERMINISTIC'
  /** `generate` threw. */
  | 'CRASH'
  /** An instance failed `validate.ts`. */
  | 'INVALID_INSTANCE'
  /** Distinct stems fell below the variety floor. */
  | 'LOW_VARIETY'
  /** The correct answer sits in one position too often. */
  | 'POSITION_BIAS'
  /** A declared strategy never appeared across the whole sweep. */
  | 'UNUSED_STRATEGY'
  /** An instance raised validator warnings. Does not fail the sweep. */
  | 'INSTANCE_WARNING';

/** One thing the sweep found. */
export interface Finding {
  code: FindingCode;
  severity: FindingSeverity;
  /** One sentence naming the specific numbers involved. */
  message: string;
  /** The seed that produced it, when the finding is seed-specific. */
  seed?: number;
  /** Validation errors, when `code` is `INVALID_INSTANCE`. */
  errors?: ValidationError[];
}

/** Everything the sweep measured about one generator. */
export interface VerificationReport {
  generatorId: string;
  /** How many seeds were swept: `0 .. seedCount - 1`. */
  seedCount: number;
  /** `true` when no fatal finding was recorded. */
  passed: boolean;
  /** Seeds that produced a valid instance. */
  validCount: number;
  /** Seeds where `generate` threw. */
  crashCount: number;
  /** Seeds whose instance raised at least one validator warning. */
  warningInstanceCount: number;
  /** Distinct stem strings seen. */
  distinctStems: number;
  /** `distinctStems / seedCount`, as a fraction of 1. */
  varietyRatio: number;
  /** How often the correct answer landed at index 0, 1, 2, 3. */
  answerPositionCounts: number[];
  /** Declared strategy ids that never appeared in any instance. */
  unusedStrategies: string[];
  /** How many times each declared strategy appeared. */
  strategyCounts: Record<string, number>;
  /** Every finding, fatal first. */
  findings: Finding[];
}

/**
 * Minimum share of seeds that must produce a distinct stem.
 *
 * Below this the parameter space is too small for the sweep size and students
 * will see the same question twice. 0.6 is the brief's figure; it is a judgement
 * call, not a theorem.
 */
export const VARIETY_FLOOR = 0.6;

/**
 * Maximum share of correct answers allowed to land in any single position.
 *
 * A generator that parks the answer in slot C is exploitable — students notice
 * this faster than teachers do. 0.4 leaves room for ordinary sampling noise
 * around the 0.25 an unbiased shuffle produces.
 */
export const POSITION_BIAS_LIMIT = 0.4;

/**
 * How many failing seeds to report per category before truncating.
 *
 * A broken generator fails every seed; printing 500 identical reports buries the
 * one line that matters. Each reported failure names its seed, so it is
 * reproducible directly.
 */
export const MAX_REPORTED_FAILURES = 5;

/** Options for one sweep. */
export interface VerifyOptions {
  /**
   * Passed through to `validateInstance`. The seed count is the positional
   * argument, not a field here — two sources of truth for the same number is
   * how a sweep silently runs 500 seeds when you asked for 10.
   */
  validate?: ValidateOptions;
}

/**
 * `JSON.stringify` replacer that survives `bigint`.
 *
 * `Choice.value` carries `Rational`s, whose numerator and denominator are
 * `bigint`, and `JSON.stringify` throws on those rather than serializing them.
 * Tagging with a trailing `n` keeps the output unambiguous — `1` and `"1n"`
 * do not collide — so the fingerprint stays a faithful structural comparison.
 */
export function bigintSafeReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? `${value.toString()}n` : value;
}

/**
 * Deep structural comparison used for the determinism check.
 *
 * `JSON.stringify` is the right tool here precisely because it is
 * order-sensitive: two instances that differ in choice *order* are a
 * determinism failure, and a comparison that normalized order would hide
 * exactly the bug being looked for.
 */
export function fingerprint(instance: QuestionInstance): string {
  return JSON.stringify(instance, bigintSafeReplacer);
}

/**
 * Sweeps `generator` across `seedCount` seeds and reports what it found.
 *
 * Never throws: a generator that crashes on every seed produces a report full of
 * `CRASH` findings, because the caller is an unattended CLI whose job is to say
 * what is wrong rather than to die alongside it.
 */
export function verifyGenerator(
  generator: Generator,
  seedCount = 500,
  options: VerifyOptions = {},
): VerificationReport {
  const seeds = seedCount;
  const findings: Finding[] = [];

  const stemCounts = new Map<string, number>();
  const answerPositionCounts = [0, 0, 0, 0];
  const strategyCounts: Record<string, number> = {};
  for (const strategy of generator.strategies ?? []) {
    strategyCounts[strategy.id] = 0;
  }

  let validCount = 0;
  let crashCount = 0;
  let reportedCrashes = 0;
  let reportedInvalid = 0;
  let reportedNonDeterministic = 0;
  let reportedWarnings = 0;
  let warningInstanceCount = 0;

  for (let seed = 0; seed < seeds; seed += 1) {
    // --- crash safety: a throw is data, not the end of the run ---------------
    let first: QuestionInstance;
    try {
      first = generator.generate(seed);
    } catch (error) {
      crashCount += 1;
      if (reportedCrashes < MAX_REPORTED_FAILURES) {
        reportedCrashes += 1;
        findings.push({
          code: 'CRASH',
          severity: 'fatal',
          seed,
          message: `generate(${seed}) threw: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      continue;
    }

    // --- determinism: the same seed twice must be byte-identical -------------
    try {
      const second = generator.generate(seed);
      if (fingerprint(first) !== fingerprint(second)) {
        if (reportedNonDeterministic < MAX_REPORTED_FAILURES) {
          reportedNonDeterministic += 1;
          findings.push({
            code: 'NON_DETERMINISTIC',
            severity: 'fatal',
            seed,
            message: `generate(${seed}) produced two different instances. The generator is not pure — check for the global RNG, Date, or module-level mutable state.`,
          });
        }
      }
    } catch (error) {
      crashCount += 1;
      if (reportedCrashes < MAX_REPORTED_FAILURES) {
        reportedCrashes += 1;
        findings.push({
          code: 'CRASH',
          severity: 'fatal',
          seed,
          message: `generate(${seed}) succeeded once then threw on the repeat run: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      continue;
    }

    // --- validity ------------------------------------------------------------
    const result = validateInstance(first, generator, options.validate);
    if (result.valid) {
      validCount += 1;
    } else if (reportedInvalid < MAX_REPORTED_FAILURES) {
      reportedInvalid += 1;
      findings.push({
        code: 'INVALID_INSTANCE',
        severity: 'fatal',
        seed,
        message: `generate(${seed}) is invalid: ${result.errors.map((e) => `${e.code} at ${e.path || 'instance'}`).join('; ')}`,
        errors: result.errors,
      });
    }
    // Validator warnings do not invalidate an instance, but they are worth
    // surfacing: a value/rendering mismatch on every seed is a real bug even
    // though the question still renders.
    if (result.warnings.length > 0) {
      warningInstanceCount += 1;
      if (reportedWarnings < MAX_REPORTED_FAILURES) {
        reportedWarnings += 1;
        findings.push({
          code: 'INSTANCE_WARNING',
          severity: 'warning',
          seed,
          message: `generate(${seed}) raised ${result.warnings.length} validator warning${result.warnings.length === 1 ? '' : 's'}: ${result.warnings.map((w) => `${w.code} at ${w.path || 'instance'}`).join('; ')}`,
          errors: result.warnings,
        });
      }
    }

    // --- variety, position, and strategy coverage ----------------------------
    const stem = typeof first.stem === 'string' ? first.stem : '';
    stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1);

    const choices = Array.isArray(first.choices) ? first.choices : [];
    const correctIndex = choices.findIndex((choice) => choice?.isCorrect === true);
    if (correctIndex >= 0 && correctIndex < answerPositionCounts.length) {
      answerPositionCounts[correctIndex] += 1;
    }
    for (const choice of choices) {
      if (choice?.isCorrect === true) continue;
      const id = choice?.strategyId;
      if (id !== undefined && id in strategyCounts) {
        strategyCounts[id] += 1;
      }
    }
  }

  // --- aggregate findings ----------------------------------------------------
  const distinctStems = stemCounts.size;
  const varietyRatio = seeds === 0 ? 0 : distinctStems / seeds;
  if (seeds > 0 && varietyRatio < VARIETY_FLOOR) {
    const worst = [...stemCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    findings.push({
      code: 'LOW_VARIETY',
      severity: 'warning',
      message: `Only ${distinctStems} distinct stems across ${seeds} seeds (${formatPercent(varietyRatio)}, floor ${formatPercent(VARIETY_FLOOR)}). The generator is over-constrained and students will see repeats.${worst ? ` Most repeated stem appeared ${worst[1]} times.` : ''}`,
    });
  }

  const placedAnswers = answerPositionCounts.reduce((sum, n) => sum + n, 0);
  if (placedAnswers > 0) {
    answerPositionCounts.forEach((count, index) => {
      const share = count / placedAnswers;
      if (share > POSITION_BIAS_LIMIT) {
        findings.push({
          code: 'POSITION_BIAS',
          severity: 'warning',
          message: `The correct answer lands in position ${index + 1} (${'ABCD'[index]}) ${formatPercent(share)} of the time, over the ${formatPercent(POSITION_BIAS_LIMIT)} limit. A predictable answer slot is exploitable — check the shuffle.`,
        });
      }
    });
  }

  const unusedStrategies = Object.entries(strategyCounts)
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
  for (const id of unusedStrategies) {
    findings.push({
      code: 'UNUSED_STRATEGY',
      severity: 'warning',
      message: `Strategy ${JSON.stringify(id)} is declared but never produced across ${seeds} seeds. Either it is a dead branch or it should be removed from the declaration.`,
    });
  }

  findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return {
    generatorId: generator.id,
    seedCount: seeds,
    passed: !findings.some((finding) => finding.severity === 'fatal'),
    validCount,
    crashCount,
    warningInstanceCount,
    distinctStems,
    varietyRatio,
    answerPositionCounts,
    unusedStrategies,
    strategyCounts,
    findings,
  };
}

/** Sweeps every generator given. Convenience wrapper for the CLI. */
export function verifyAll(
  generators: Generator[],
  seedCount = 500,
  options: VerifyOptions = {},
): VerificationReport[] {
  return generators.map((generator) => verifyGenerator(generator, seedCount, options));
}

function severityRank(severity: FindingSeverity): number {
  return severity === 'fatal' ? 0 : 1;
}

/** `0.6` renders as `60.0%`. Kept here so the CLI and the messages agree. */
export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
