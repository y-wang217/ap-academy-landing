import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoverageReport } from './coverage.ts';
import { allProblemTypes } from './index.ts';
import { GENERATORS } from '../generators/index.ts';
import type { Difficulty, Generator } from '../types.ts';

/** A generator stub. Coverage only reads the declared fields, never generates. */
function stub(id: string, problemTypeId: string, difficulty: Difficulty): Generator {
  return {
    id,
    unitId: 'ignored-by-coverage',
    problemTypeId,
    difficulty,
    strategies: [{ id: 'x', label: 'X' }],
    generate() {
      throw new Error('coverage never calls generate');
    },
  };
}

const REFERENCE_TYPE = 'mhf4u-u3-factor-theorem-find-k';

// --- the real join ------------------------------------------------------------

test('coverage: the reference generator covers exactly one slot', () => {
  const report = buildCoverageReport('MHF4U');
  assert.equal(report.totals.covered, 1, 'the taxonomy/generator join is broken');
  assert.equal(report.totals.generatorsRegistered, GENERATORS.length);
  const covered = report.units
    .flatMap((unit) => unit.problemTypes)
    .filter((coverage) => coverage.covered);
  assert.equal(covered.length, 1);
  assert.equal(covered[0].problemTypeId, REFERENCE_TYPE);
  assert.deepEqual(covered[0].generatorIds, ['mhf4u-u3-factor-theorem-find-k-d2']);
  assert.equal(covered[0].fullyCovered, true, 'the slot declares only tier 2, which is built');
});

test('coverage: no generator is orphaned', () => {
  const report = buildCoverageReport('MHF4U');
  assert.deepEqual(
    report.orphanGenerators,
    [],
    'a generator declares a problemTypeId that no taxonomy slot matches',
  );
});

test('coverage: totals agree with the taxonomy', () => {
  const report = buildCoverageReport('MHF4U');
  const types = allProblemTypes('MHF4U');
  assert.equal(report.totals.total, types.length);
  assert.equal(report.totals.provisional, types.length);
  assert.equal(report.totals.confirmed, 0);
  assert.equal(report.totals.rejected, 0);
  assert.equal(
    report.totals.inScope + report.totals.excluded,
    report.totals.total,
    'in-scope plus excluded must account for every type',
  );
});

test('coverage: unit totals sum to the course totals', () => {
  const report = buildCoverageReport('MHF4U');
  const sum = (pick: (u: (typeof report.units)[number]) => number): number =>
    report.units.reduce((total, unit) => total + pick(unit), 0);
  assert.equal(sum((u) => u.total), report.totals.total);
  assert.equal(sum((u) => u.inScope), report.totals.inScope);
  assert.equal(sum((u) => u.covered), report.totals.covered);
  assert.equal(sum((u) => u.excluded), report.totals.excluded);
});

test('coverage: units come back in course-outline order', () => {
  const report = buildCoverageReport('MHF4U');
  assert.deepEqual(report.units.map((unit) => unit.order), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('coverage: an unknown course code throws', () => {
  assert.throws(() => buildCoverageReport('MCV4U'), /Unknown course code/);
});

test('coverage: the course code is matched case-insensitively', () => {
  assert.equal(buildCoverageReport('mhf4u').courseCode, 'MHF4U');
});

// --- the non-parameterizable exclusion ----------------------------------------

test('coverage: non-parameterizable types are excluded from the denominator', () => {
  const report = buildCoverageReport('MHF4U');
  const excludedTypes = allProblemTypes('MHF4U').filter((t) => !t.parameterizable);
  assert.ok(excludedTypes.length > 0);
  assert.equal(report.totals.excluded, excludedTypes.length);
  assert.equal(report.totals.inScope, report.totals.total - excludedTypes.length);
});

test('coverage: an excluded type never appears as a gap', () => {
  const report = buildCoverageReport('MHF4U');
  const excludedIds = new Set(
    allProblemTypes('MHF4U').filter((t) => !t.parameterizable).map((t) => t.id),
  );
  for (const gap of report.gaps) {
    assert.ok(!excludedIds.has(gap.problemTypeId), `${gap.problemTypeId} is excluded but listed as a gap`);
  }
});

test('coverage: an excluded type is still counted in the unit total', () => {
  const report = buildCoverageReport('MHF4U');
  const unit6 = report.units.find((u) => u.order === 6);
  assert.ok(unit6);
  // Unit 6 contains the trig identity proof, which is non-parameterizable.
  assert.equal(unit6.excluded, 1);
  assert.equal(unit6.inScope, unit6.total - 1);
  assert.equal(unit6.problemTypes.length, unit6.total, 'excluded types stay visible in the detail');
});

test('coverage: gap count is in-scope types minus covered ones', () => {
  const report = buildCoverageReport('MHF4U');
  const entirelyMissing = report.gaps.filter((gap) => gap.entirelyMissing).length;
  assert.equal(entirelyMissing, report.totals.inScope - report.totals.covered);
});

// --- coverage math against fixture generators ---------------------------------

test('coverage: a generator at one tier partially covers a two-tier type', () => {
  // mhf4u-u1-average-rate-of-change declares tiers [1, 2].
  const report = buildCoverageReport('MHF4U', [
    stub('rate-d1', 'mhf4u-u1-average-rate-of-change', 1),
  ]);
  const coverage = report.units
    .flatMap((u) => u.problemTypes)
    .find((c) => c.problemTypeId === 'mhf4u-u1-average-rate-of-change');
  assert.ok(coverage);
  assert.equal(coverage.covered, true);
  assert.equal(coverage.fullyCovered, false);
  assert.deepEqual(coverage.coveredDifficulties, [1]);
  assert.deepEqual(coverage.missingDifficulties, [2]);
  assert.equal(report.totals.covered, 1);
  assert.equal(report.totals.fullyCovered, 0);
});

test('coverage: generators at every tier fully cover a type', () => {
  const report = buildCoverageReport('MHF4U', [
    stub('rate-d1', 'mhf4u-u1-average-rate-of-change', 1),
    stub('rate-d2', 'mhf4u-u1-average-rate-of-change', 2),
  ]);
  const coverage = report.units
    .flatMap((u) => u.problemTypes)
    .find((c) => c.problemTypeId === 'mhf4u-u1-average-rate-of-change');
  assert.ok(coverage);
  assert.equal(coverage.fullyCovered, true);
  assert.deepEqual(coverage.missingDifficulties, []);
  assert.deepEqual(coverage.generatorIds, ['rate-d1', 'rate-d2']);
  assert.equal(report.totals.fullyCovered, 1);
});

test('coverage: a generator at an undeclared tier still counts as covering the type', () => {
  // The taxonomy says tier 1 only; a tier-3 generator is a taxonomy/generator
  // disagreement worth seeing, not a reason to report zero coverage.
  const report = buildCoverageReport('MHF4U', [
    stub('interval-d3', 'mhf4u-u1-interval-notation-conversion', 3),
  ]);
  const coverage = report.units
    .flatMap((u) => u.problemTypes)
    .find((c) => c.problemTypeId === 'mhf4u-u1-interval-notation-conversion');
  assert.ok(coverage);
  assert.equal(coverage.covered, true);
  assert.equal(coverage.fullyCovered, false);
  assert.deepEqual(coverage.missingDifficulties, [1]);
});

test('coverage: an orphan generator is reported and contributes nothing', () => {
  const report = buildCoverageReport('MHF4U', [stub('ghost', 'mhf4u-u9-not-a-real-type', 2)]);
  assert.deepEqual(report.orphanGenerators, [
    { generatorId: 'ghost', problemTypeId: 'mhf4u-u9-not-a-real-type' },
  ]);
  assert.equal(report.totals.covered, 0);
});

test('coverage: with no generators at all, coverage is zero and every in-scope type is a gap', () => {
  const report = buildCoverageReport('MHF4U', []);
  assert.equal(report.totals.covered, 0);
  assert.equal(report.totals.coverageRatio, 0);
  assert.equal(report.gaps.length, report.totals.inScope);
  assert.ok(report.gaps.every((gap) => gap.entirelyMissing));
});

test('coverage: coverageRatio is covered over in-scope', () => {
  const report = buildCoverageReport('MHF4U', [stub('a', REFERENCE_TYPE, 2)]);
  assert.equal(report.totals.coverageRatio, 1 / report.totals.inScope);
  const unit3 = report.units.find((u) => u.order === 3);
  assert.ok(unit3);
  assert.equal(unit3.coverageRatio, unit3.covered / unit3.inScope);
});

// --- the gap queue ------------------------------------------------------------

test('coverage: gaps are ordered by unit order', () => {
  const report = buildCoverageReport('MHF4U');
  const orders = report.gaps.map((gap) => gap.unitOrder);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});

test('coverage: untouched types come before partial tier gaps within a unit', () => {
  // Cover one tier of a unit-1 type, leaving the rest of unit 1 untouched.
  const report = buildCoverageReport('MHF4U', [
    stub('rate-d1', 'mhf4u-u1-average-rate-of-change', 1),
  ]);
  const unit1Gaps = report.gaps.filter((gap) => gap.unitOrder === 1);
  const partialIndex = unit1Gaps.findIndex((gap) => !gap.entirelyMissing);
  assert.ok(partialIndex >= 0, 'expected a partial gap');
  assert.ok(
    unit1Gaps.slice(0, partialIndex).every((gap) => gap.entirelyMissing),
    'a partial gap was queued before an untouched type',
  );
  assert.equal(unit1Gaps[unit1Gaps.length - 1].problemTypeId, 'mhf4u-u1-average-rate-of-change');
});

test('coverage: a gap carries the tiers that are missing', () => {
  const report = buildCoverageReport('MHF4U', []);
  const gap = report.gaps.find((g) => g.problemTypeId === 'mhf4u-u1-average-rate-of-change');
  assert.ok(gap);
  assert.deepEqual(gap.missingDifficulties, [1, 2]);
  assert.equal(gap.unitLabel, 'Characteristics of functions');
});

test('coverage: a fully covered type is not a gap', () => {
  const report = buildCoverageReport('MHF4U');
  assert.ok(!report.gaps.some((gap) => gap.problemTypeId === REFERENCE_TYPE));
});
