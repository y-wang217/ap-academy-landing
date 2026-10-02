import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSES,
  allProblemTypes,
  allUnits,
  getCourse,
  getCourseForUnit,
  getProblemType,
  getUnit,
  validateAllCourses,
  validateCourse,
  type TaxonomyErrorCode,
} from './index.ts';
import { MHF4U } from './mhf4u.ts';
import type { Course, ProblemType, Unit } from './types.ts';

/** A minimal valid course. Every broken fixture below is this with one defect. */
function validCourse(): Course {
  const makeType = (unitId: string, id: string): ProblemType => ({
    id,
    unitId,
    label: 'A problem type',
    outcome: 'I can do the thing.',
    difficulties: [2],
    status: 'provisional',
    parameterizable: true,
  });
  const unit = (order: number, id: string): Unit => ({
    id,
    order,
    label: `Unit ${order}`,
    strand: 'X. A strand',
    problemTypes: [makeType(id, `${id}-alpha`), makeType(id, `${id}-beta`)],
  });
  return {
    code: 'TEST1U',
    label: 'A test course',
    units: [unit(1, 'test1u-u1-first'), unit(2, 'test1u-u2-second')],
  };
}

function codesFor(course: Course): TaxonomyErrorCode[] {
  return [...new Set(validateCourse(course).errors.map((e) => e.code))].sort();
}

function assertRejects(course: Course, code: TaxonomyErrorCode): void {
  const result = validateCourse(course);
  assert.equal(result.valid, false, `expected ${code}, but the tree validated clean`);
  assert.ok(
    result.errors.some((e) => e.code === code),
    `expected ${code}, got [${result.errors.map((e) => e.code).join(', ')}]`,
  );
  for (const error of result.errors) {
    assert.ok(error.message.length > 0);
    assert.ok(error.path.length > 0);
  }
}

// --- the real tree ------------------------------------------------------------

test('taxonomy: the MHF4U tree validates', () => {
  const result = validateCourse(MHF4U);
  assert.deepEqual(result.errors, [], JSON.stringify(result.errors, null, 2));
});

test('taxonomy: every registered course validates', () => {
  const result = validateAllCourses();
  assert.deepEqual(result.errors, [], JSON.stringify(result.errors, null, 2));
});

test('taxonomy: MHF4U covers the eight units in course-outline order', () => {
  assert.deepEqual(
    allUnits('MHF4U').map((unit) => unit.order),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.deepEqual(
    allUnits('MHF4U').map((unit) => unit.label),
    [
      'Characteristics of functions',
      'Polynomial functions',
      'Polynomial equations and inequalities',
      'Rational functions',
      'Trigonometric functions',
      'Trigonometric identities and equations',
      'Exponential and logarithmic functions',
      'Combining functions',
    ],
  );
});

test('taxonomy: every MHF4U problem type is provisional', () => {
  // Nothing has been checked against an extracted bank yet. If this ever fails,
  // it means someone marked a type confirmed — which only a human should do.
  for (const problemType of allProblemTypes('MHF4U')) {
    assert.equal(
      problemType.status,
      'provisional',
      `${problemType.id} is ${problemType.status}, but nothing has been reconciled yet`,
    );
  }
});

test('taxonomy: every non-parameterizable type explains itself', () => {
  const excluded = allProblemTypes('MHF4U').filter((t) => !t.parameterizable);
  assert.ok(excluded.length > 0, 'expected some types to be honestly excluded');
  for (const problemType of excluded) {
    assert.ok(
      (problemType.notes ?? '').trim().length > 20,
      `${problemType.id} is excluded from coverage without a real reason`,
    );
  }
});

test('taxonomy: every unit belongs to a named strand', () => {
  for (const unit of allUnits('MHF4U')) {
    assert.match(unit.strand, /^[A-D]\. /, `${unit.id} has an unexpected strand: ${unit.strand}`);
  }
});

test('taxonomy: problem type ids are namespaced by course and unit number', () => {
  for (const unit of allUnits('MHF4U')) {
    const prefix = unit.id.split('-').slice(0, 2).join('-');
    for (const problemType of unit.problemTypes) {
      assert.ok(
        problemType.id.startsWith(`${prefix}-`),
        `${problemType.id} does not carry the prefix ${prefix}`,
      );
      assert.match(problemType.id, /^[a-z0-9]+(-[a-z0-9]+)+$/);
    }
  }
});

test('taxonomy: the reference generator has a matching slot', () => {
  const slot = getProblemType('mhf4u-u3-factor-theorem-find-k');
  assert.ok(slot, 'the reference generator has no taxonomy slot to join against');
  assert.equal(slot.unitId, 'mhf4u-u3-polynomial-equations');
  assert.ok(slot.difficulties.includes(2));
});

// --- accessors ----------------------------------------------------------------

test('taxonomy: getCourse is case-insensitive and returns undefined for the unknown', () => {
  assert.equal(getCourse('MHF4U'), MHF4U);
  assert.equal(getCourse('mhf4u'), MHF4U);
  assert.equal(getCourse('  Mhf4u  '), MHF4U);
  assert.equal(getCourse('MCV4U'), undefined);
});

test('taxonomy: getUnit and getProblemType resolve by id', () => {
  const unit = getUnit('mhf4u-u3-polynomial-equations');
  assert.ok(unit);
  assert.equal(unit.order, 3);
  assert.equal(getUnit('not-a-unit'), undefined);
  assert.equal(getProblemType('not-a-type'), undefined);
});

test('taxonomy: getCourseForUnit finds the owning course', () => {
  assert.equal(getCourseForUnit('mhf4u-u1-characteristics-of-functions'), MHF4U);
  assert.equal(getCourseForUnit('nope'), undefined);
});

test('taxonomy: allProblemTypes is flattened in course order', () => {
  const flattened = allProblemTypes('MHF4U');
  const expected = allUnits('MHF4U').flatMap((unit) => unit.problemTypes);
  assert.deepEqual(flattened.map((t) => t.id), expected.map((t) => t.id));
  assert.equal(new Set(flattened.map((t) => t.id)).size, flattened.length);
});

test('taxonomy: allProblemTypes returns empty for an unknown course rather than throwing', () => {
  assert.deepEqual(allProblemTypes('NOPE4U'), []);
  assert.deepEqual(allUnits('NOPE4U'), []);
});

test('taxonomy: every problem type resolves back through getProblemType', () => {
  for (const problemType of allProblemTypes('MHF4U')) {
    assert.equal(getProblemType(problemType.id), problemType);
  }
});

test('taxonomy: COURSES has unique course codes', () => {
  const codes = COURSES.map((course) => course.code);
  assert.equal(new Set(codes).size, codes.length);
});

// --- validation against deliberately broken fixtures --------------------------

test('taxonomy validation: the fixture course is valid to begin with', () => {
  assert.deepEqual(validateCourse(validCourse()).errors, []);
});

test('taxonomy validation: rejects a duplicate unit id', () => {
  const course = validCourse();
  course.units[1].id = course.units[0].id;
  course.units[1].problemTypes.forEach((t) => { t.unitId = course.units[0].id; });
  assertRejects(course, 'DUPLICATE_UNIT_ID');
});

test('taxonomy validation: rejects a duplicate problem type id', () => {
  const course = validCourse();
  course.units[1].problemTypes[0].id = course.units[0].problemTypes[0].id;
  assertRejects(course, 'DUPLICATE_PROBLEM_TYPE_ID');
});

test('taxonomy validation: rejects a problem type whose unitId does not exist', () => {
  const course = validCourse();
  course.units[0].problemTypes[0].unitId = 'test1u-u9-ghost';
  assertRejects(course, 'ORPHAN_UNIT_ID');
});

test('taxonomy validation: rejects a problem type nested under the wrong unit', () => {
  const course = validCourse();
  // The unit exists, but it is not the one this type is nested in.
  course.units[0].problemTypes[0].unitId = course.units[1].id;
  assertRejects(course, 'ORPHAN_UNIT_ID');
});

test('taxonomy validation: rejects non-contiguous unit order', () => {
  const course = validCourse();
  course.units[1].order = 3;
  assertRejects(course, 'NON_CONTIGUOUS_ORDER');
});

test('taxonomy validation: rejects unit order that does not start at 1', () => {
  const course = validCourse();
  course.units[0].order = 2;
  course.units[1].order = 3;
  assertRejects(course, 'NON_CONTIGUOUS_ORDER');
});

test('taxonomy validation: rejects two units sharing an order', () => {
  const course = validCourse();
  course.units[1].order = 1;
  assertRejects(course, 'DUPLICATE_ORDER');
});

test('taxonomy validation: rejects empty labels and outcomes', () => {
  const emptyLabel = validCourse();
  emptyLabel.units[0].problemTypes[0].label = '   ';
  assertRejects(emptyLabel, 'EMPTY_FIELD');

  const emptyOutcome = validCourse();
  emptyOutcome.units[0].problemTypes[0].outcome = '';
  assertRejects(emptyOutcome, 'EMPTY_FIELD');

  const emptyUnitLabel = validCourse();
  emptyUnitLabel.units[0].label = '';
  assertRejects(emptyUnitLabel, 'EMPTY_FIELD');

  const emptyStrand = validCourse();
  emptyStrand.units[0].strand = '  ';
  assertRejects(emptyStrand, 'EMPTY_FIELD');
});

test('taxonomy validation: rejects an empty difficulties list', () => {
  const course = validCourse();
  course.units[0].problemTypes[0].difficulties = [];
  assertRejects(course, 'EMPTY_DIFFICULTIES');
});

test('taxonomy validation: rejects a difficulty outside 1..3', () => {
  const course = validCourse();
  // Cast past the union, which is exactly what bad data does at runtime.
  course.units[0].problemTypes[0].difficulties = [4 as 1];
  assertRejects(course, 'INVALID_DIFFICULTY');
});

test('taxonomy validation: rejects a malformed id', () => {
  const badType = validCourse();
  badType.units[0].problemTypes[0].id = 'NotASlug';
  assertRejects(badType, 'MALFORMED_ID');

  const unNamespaced = validCourse();
  unNamespaced.units[0].problemTypes[0].id = 'alpha';
  assertRejects(unNamespaced, 'MALFORMED_ID');

  const badUnit = validCourse();
  badUnit.units[0].id = 'Unit One';
  assertRejects(badUnit, 'MALFORMED_ID');
});

test('taxonomy validation: rejects an empty unit', () => {
  const course = validCourse();
  course.units[0].problemTypes = [];
  assertRejects(course, 'EMPTY_UNIT');
});

test('taxonomy validation: rejects a non-parameterizable type with no reason', () => {
  const course = validCourse();
  course.units[0].problemTypes[0].parameterizable = false;
  assertRejects(course, 'MISSING_NOTES');

  course.units[0].problemTypes[0].notes = 'Output is a graph; no rendering pipeline exists.';
  assert.deepEqual(validateCourse(course).errors, []);
});

test('taxonomy validation: rejects an empty course code or label', () => {
  const noCode = validCourse();
  noCode.code = '';
  assertRejects(noCode, 'EMPTY_FIELD');

  const noLabel = validCourse();
  noLabel.label = '  ';
  assertRejects(noLabel, 'EMPTY_FIELD');
});

test('taxonomy validation: reports every defect in one pass', () => {
  const course = validCourse();
  course.units[1].order = 5;
  course.units[0].problemTypes[0].label = '';
  course.units[0].problemTypes[1].difficulties = [];
  const found = codesFor(course);
  assert.ok(found.includes('NON_CONTIGUOUS_ORDER'));
  assert.ok(found.includes('EMPTY_FIELD'));
  assert.ok(found.includes('EMPTY_DIFFICULTIES'));
});

test('taxonomy validation: never throws on a structurally absent tree', () => {
  const wrecked = { code: 'X', label: 'Y' } as unknown as Course;
  const result = validateCourse(wrecked);
  assert.equal(typeof result.valid, 'boolean');
});
