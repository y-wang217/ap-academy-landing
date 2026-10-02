import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POSITION_BIAS_LIMIT,
  VARIETY_FLOOR,
  MAX_REPORTED_FAILURES,
  formatPercent,
  verifyAll,
  verifyGenerator,
  type FindingCode,
} from './verify.ts';
import { createRng } from './rng.ts';
import { qInt } from './value.ts';
import type { Choice, Generator, QuestionInstance } from './types.ts';

/**
 * A fixture generator factory. Every broken generator below is this one with a
 * single defect injected, so a finding can only be caused by the defect under
 * test.
 */
function makeFixture(overrides: {
  id?: string;
  generate?: (seed: number, base: QuestionInstance) => QuestionInstance;
  strategies?: { id: string; label: string }[];
} = {}): Generator {
  const strategies = overrides.strategies ?? [
    { id: 'sign_error', label: 'Sign error' },
    { id: 'off_by_one', label: 'Off by one' },
    { id: 'wrong_variable', label: 'Wrong variable' },
  ];
  const generator: Generator = {
    id: overrides.id ?? 'fixture',
    unitId: 'fixture-u1',
    problemTypeId: 'fixture-type',
    difficulty: 2,
    strategies,
    generate(seed: number): QuestionInstance {
      const rng = createRng(seed);
      // A wide parameter space so the healthy fixture clears the variety floor.
      // 0, 1 and -1 are excluded because at those values the fixture's own
      // distractors collide (k = 1 makes k+1 and k*2 both 2) or produce a bare
      // zero. The harness caught this on its first run against the fixture.
      const k = rng.intExcluding(-400, 400, [0, 1, -1]);
      const choices: Choice[] = rng.shuffle([
        { latex: String(k), isCorrect: true, value: qInt(k) },
        { latex: String(-k), isCorrect: false, strategyId: 'sign_error', value: qInt(-k) },
        { latex: String(k + 1), isCorrect: false, strategyId: 'off_by_one', value: qInt(k + 1) },
        { latex: String(k * 2), isCorrect: false, strategyId: 'wrong_variable', value: qInt(k * 2) },
      ]);
      const base: QuestionInstance = {
        generatorId: overrides.id ?? 'fixture',
        seed,
        unitId: 'fixture-u1',
        problemTypeId: 'fixture-type',
        difficulty: 2,
        stem: `Find k when the constant is ${k}.`,
        choices,
        solution: [`Set up the equation with ${k}.`, `Therefore k = ${k}.`],
        conceptTag: 'Fixture concept',
      };
      return overrides.generate ? overrides.generate(seed, base) : base;
    },
  };
  return generator;
}

/** The finding codes a report contains, deduplicated. */
function codes(report: { findings: { code: FindingCode }[] }): FindingCode[] {
  return [...new Set(report.findings.map((f) => f.code))];
}

// --- the healthy baseline -----------------------------------------------------

test('verify: a healthy fixture passes with no findings', () => {
  const report = verifyGenerator(makeFixture(), 200);
  assert.deepEqual(report.findings, [], JSON.stringify(report.findings, null, 2));
  assert.equal(report.passed, true);
  assert.equal(report.validCount, 200);
  assert.equal(report.crashCount, 0);
  assert.equal(report.seedCount, 200);
});

test('verify: sweeps exactly seeds 0..n-1', () => {
  const seen: number[] = [];
  const generator = makeFixture({
    generate(seed, base) {
      seen.push(seed);
      return base;
    },
  });
  verifyGenerator(generator, 10);
  // Each seed is generated twice: once for the instance, once for determinism.
  assert.deepEqual([...new Set(seen)].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

// --- determinism (fatal) ------------------------------------------------------

test('verify: catches a non-deterministic generator', () => {
  let counter = 0;
  const generator = makeFixture({
    generate(seed, base) {
      counter += 1;
      // Module-level mutable state: the classic way purity is lost.
      return { ...base, stem: `${base.stem} (call ${counter})` };
    },
  });
  const report = verifyGenerator(generator, 20);
  assert.equal(report.passed, false);
  assert.ok(codes(report).includes('NON_DETERMINISTIC'));
  const finding = report.findings.find((f) => f.code === 'NON_DETERMINISTIC');
  assert.ok(finding);
  assert.equal(finding.severity, 'fatal');
  assert.equal(typeof finding.seed, 'number');
});

test('verify: a difference in choice order alone is non-determinism', () => {
  let flip = false;
  const generator = makeFixture({
    generate(seed, base) {
      flip = !flip;
      return { ...base, choices: flip ? base.choices : base.choices.slice().reverse() };
    },
  });
  const report = verifyGenerator(generator, 10);
  assert.ok(codes(report).includes('NON_DETERMINISTIC'));
});

// --- crash safety (fatal) -----------------------------------------------------

test('verify: catches a crashing generator without dying itself', () => {
  const generator = makeFixture({
    generate(seed) {
      throw new Error(`boom on ${seed}`);
    },
  });
  const report = verifyGenerator(generator, 20);
  assert.equal(report.passed, false);
  assert.equal(report.crashCount, 20);
  assert.equal(report.validCount, 0);
  const finding = report.findings.find((f) => f.code === 'CRASH');
  assert.ok(finding);
  assert.equal(finding.severity, 'fatal');
  assert.match(finding.message, /boom on/);
  assert.equal(typeof finding.seed, 'number');
});

test('verify: catches a generator that crashes on only some seeds', () => {
  const generator = makeFixture({
    generate(seed, base) {
      if (seed === 7) throw new Error('unlucky seed');
      return base;
    },
  });
  const report = verifyGenerator(generator, 20);
  assert.equal(report.crashCount, 1);
  assert.equal(report.validCount, 19);
  const finding = report.findings.find((f) => f.code === 'CRASH');
  assert.ok(finding);
  assert.equal(finding.seed, 7, 'the crashing seed must be reported so it is reproducible');
});

test('verify: survives a generator that throws a non-Error', () => {
  const generator = makeFixture({
    generate() {
      throw 'a bare string';
    },
  });
  const report = verifyGenerator(generator, 3);
  assert.equal(report.crashCount, 3);
  assert.match(report.findings[0].message, /a bare string/);
});

// --- validity (fatal) ---------------------------------------------------------

test('verify: catches an invalid instance and carries its validation errors', () => {
  const generator = makeFixture({
    generate(seed, base) {
      // Duplicate the first choice onto the third: fewer than 4 real options.
      const choices = base.choices.slice();
      choices[2] = { ...choices[2], latex: choices[0].latex };
      return { ...base, choices };
    },
  });
  const report = verifyGenerator(generator, 20);
  assert.equal(report.passed, false);
  assert.equal(report.validCount, 0);
  const finding = report.findings.find((f) => f.code === 'INVALID_INSTANCE');
  assert.ok(finding);
  assert.equal(finding.severity, 'fatal');
  assert.ok(finding.errors && finding.errors.length > 0);
  assert.ok(finding.errors.some((e) => e.code === 'DUPLICATE_LATEX'));
});

test('verify: reports the seed of each invalid instance', () => {
  const generator = makeFixture({
    generate(seed, base) {
      return seed === 3 ? { ...base, solution: ['one step only'] } : base;
    },
  });
  const report = verifyGenerator(generator, 20);
  assert.equal(report.validCount, 19);
  const finding = report.findings.find((f) => f.code === 'INVALID_INSTANCE');
  assert.ok(finding);
  assert.equal(finding.seed, 3);
});

test('verify: truncates repeated failures rather than printing 500 of them', () => {
  const generator = makeFixture({
    generate(seed, base) {
      return { ...base, solution: ['one step only'] };
    },
  });
  const report = verifyGenerator(generator, 100);
  const invalid = report.findings.filter((f) => f.code === 'INVALID_INSTANCE');
  assert.equal(invalid.length, MAX_REPORTED_FAILURES);
  // The count itself is not truncated, only the reports.
  assert.equal(report.validCount, 0);
});

// --- variety (warning) --------------------------------------------------------

test('verify: flags an over-constrained generator', () => {
  const generator = makeFixture({
    generate(seed, base) {
      // Two stems for the whole sweep: 2/100 distinct.
      return { ...base, stem: `Find k when the constant is ${seed % 2}.` };
    },
  });
  const report = verifyGenerator(generator, 100);
  assert.equal(report.distinctStems, 2);
  assert.ok(report.varietyRatio < VARIETY_FLOOR);
  const finding = report.findings.find((f) => f.code === 'LOW_VARIETY');
  assert.ok(finding);
  assert.equal(finding.severity, 'warning');
  assert.equal(report.passed, true, 'low variety is a warning, not a build failure');
});

test('verify: does not flag variety comfortably above the floor', () => {
  const report = verifyGenerator(makeFixture(), 200);
  assert.ok(report.varietyRatio >= VARIETY_FLOOR);
  assert.ok(!codes(report).includes('LOW_VARIETY'));
});

test('verify: variety is measured on distinct stems, not distinct instances', () => {
  const generator = makeFixture({
    generate(seed, base) {
      // Same stem every time, but the choices differ. Still a repeat to a student.
      return { ...base, stem: 'Identical stem every seed.' };
    },
  });
  const report = verifyGenerator(generator, 50);
  assert.equal(report.distinctStems, 1);
  assert.ok(codes(report).includes('LOW_VARIETY'));
});

// --- answer position (warning) ------------------------------------------------

test('verify: flags a generator that parks the answer in one slot', () => {
  const generator = makeFixture({
    generate(seed, base) {
      const correct = base.choices.find((c) => c.isCorrect);
      const rest = base.choices.filter((c) => !c.isCorrect);
      assert.ok(correct);
      return { ...base, choices: [correct, ...rest] };
    },
  });
  const report = verifyGenerator(generator, 100);
  assert.deepEqual(report.answerPositionCounts, [100, 0, 0, 0]);
  const finding = report.findings.find((f) => f.code === 'POSITION_BIAS');
  assert.ok(finding);
  assert.equal(finding.severity, 'warning');
  assert.match(finding.message, /position 1/);
  assert.equal(report.passed, true, 'position bias is a warning, not a build failure');
});

test('verify: does not flag a fair shuffle', () => {
  const report = verifyGenerator(makeFixture(), 400);
  const total = report.answerPositionCounts.reduce((sum, n) => sum + n, 0);
  assert.equal(total, 400);
  for (const count of report.answerPositionCounts) {
    assert.ok(count / total <= POSITION_BIAS_LIMIT, `position share ${count / total} exceeded the limit`);
  }
  assert.ok(!codes(report).includes('POSITION_BIAS'));
});

test('verify: counts answer positions across all four slots', () => {
  const report = verifyGenerator(makeFixture(), 200);
  assert.equal(report.answerPositionCounts.length, 4);
  assert.ok(report.answerPositionCounts.every((count) => count > 0));
});

// --- strategy coverage (warning) ----------------------------------------------

test('verify: flags a declared strategy that never appears', () => {
  const generator = makeFixture({
    strategies: [
      { id: 'sign_error', label: 'Sign error' },
      { id: 'off_by_one', label: 'Off by one' },
      { id: 'wrong_variable', label: 'Wrong variable' },
      { id: 'never_produced', label: 'A branch that is dead' },
    ],
  });
  const report = verifyGenerator(generator, 50);
  assert.deepEqual(report.unusedStrategies, ['never_produced']);
  const finding = report.findings.find((f) => f.code === 'UNUSED_STRATEGY');
  assert.ok(finding);
  assert.equal(finding.severity, 'warning');
  assert.match(finding.message, /never_produced/);
  assert.equal(report.passed, true);
});

test('verify: counts how often each strategy is produced', () => {
  const report = verifyGenerator(makeFixture(), 50);
  assert.deepEqual(report.strategyCounts, {
    sign_error: 50,
    off_by_one: 50,
    wrong_variable: 50,
  });
  assert.deepEqual(report.unusedStrategies, []);
});

test('verify: a strategy produced on only some seeds is not flagged as unused', () => {
  const generator = makeFixture({
    generate(seed, base) {
      if (seed % 10 !== 0) return base;
      const choices = base.choices.map((c) =>
        c.strategyId === 'off_by_one' ? { ...c, strategyId: 'wrong_variable' } : c,
      );
      return { ...base, choices };
    },
  });
  const report = verifyGenerator(generator, 50);
  assert.ok(report.strategyCounts.off_by_one > 0);
  assert.ok(!codes(report).includes('UNUSED_STRATEGY'));
});

// --- severity and reporting ---------------------------------------------------

test('verify: only fatal findings fail the run', () => {
  const warningsOnly = makeFixture({
    strategies: [
      { id: 'sign_error', label: 'Sign error' },
      { id: 'off_by_one', label: 'Off by one' },
      { id: 'wrong_variable', label: 'Wrong variable' },
      { id: 'never_produced', label: 'Dead branch' },
    ],
    generate(seed, base) {
      return { ...base, stem: 'One stem forever.' };
    },
  });
  const report = verifyGenerator(warningsOnly, 50);
  assert.ok(report.findings.length >= 2);
  assert.ok(report.findings.every((f) => f.severity === 'warning'));
  assert.equal(report.passed, true);
});

test('verify: findings are sorted fatal first', () => {
  const generator = makeFixture({
    strategies: [
      { id: 'sign_error', label: 'Sign error' },
      { id: 'off_by_one', label: 'Off by one' },
      { id: 'wrong_variable', label: 'Wrong variable' },
      { id: 'never_produced', label: 'Dead branch' },
    ],
    generate(seed, base) {
      return { ...base, stem: 'One stem forever.', solution: ['single step'] };
    },
  });
  const report = verifyGenerator(generator, 50);
  const severities = report.findings.map((f) => f.severity);
  const firstWarning = severities.indexOf('warning');
  assert.ok(firstWarning > 0, 'expected at least one fatal finding before the warnings');
  assert.ok(!severities.slice(firstWarning).includes('fatal'));
});

test('verify: defaults to 500 seeds', () => {
  const report = verifyGenerator(makeFixture());
  assert.equal(report.seedCount, 500);
  assert.equal(report.validCount, 500);
});

test('verify: verifyAll reports every generator given', () => {
  const reports = verifyAll([makeFixture({ id: 'one' }), makeFixture({ id: 'two' })], 20);
  assert.deepEqual(reports.map((r) => r.generatorId), ['one', 'two']);
  assert.ok(reports.every((r) => r.passed));
});

test('verify: formatPercent renders one decimal place', () => {
  assert.equal(formatPercent(0.6), '60.0%');
  assert.equal(formatPercent(0.9502), '95.0%');
  assert.equal(formatPercent(1), '100.0%');
});
