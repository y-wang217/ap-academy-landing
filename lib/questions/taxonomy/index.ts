/**
 * Taxonomy accessors and structural validation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  IDS ARE PERMANENT ONCE WRITTEN.
 *
 *  `Unit.id` and `ProblemType.id` are referenced by generators
 *  (`Generator.unitId`, `Generator.problemTypeId`), by the coverage report, and
 *  — once accounts are switched on — by stored student attempt rows. Renaming
 *  one does not migrate anything: it silently orphans every attempt recorded
 *  against the old id, and a student's history quietly loses a topic.
 *
 *  Adding an id is free. Changing one is not. If a slug turns out to be wrong,
 *  prefer marking the type `status: 'rejected'` and adding a correctly named
 *  one beside it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Conventions enforced by `validateCourse`, which the test suite runs against
 * every registered course:
 * - ids are slug-cased and namespaced: `mhf4u-u3-factor-theorem-find-k`
 * - unit `order` runs `1..n`, contiguous, no duplicates
 * - every `ProblemType.unitId` resolves to a unit in the same course
 * - labels, outcomes, and `difficulties` are non-empty
 */

import { MHF4U } from './mhf4u.ts';
import type { Course, ProblemType, Unit } from './types.ts';

/** Every course this codebase knows about. Hand-maintained, like the generator registry. */
export const COURSES: Course[] = [MHF4U];

/** Slug-case with at least two dash-separated segments, e.g. `mhf4u-u3-thing`. */
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)+$/;

/** Valid difficulty values, mirroring the `Difficulty` union in `../types.ts`. */
const VALID_DIFFICULTIES = new Set([1, 2, 3]);

/**
 * Looks up a course by its code, case-insensitively.
 *
 * @returns the course, or `undefined` if no such code is registered.
 */
export function getCourse(code: string): Course | undefined {
  const wanted = code.trim().toUpperCase();
  return COURSES.find((course) => course.code.toUpperCase() === wanted);
}

/**
 * Looks up a unit by id across every registered course.
 *
 * Ids are globally unique by convention (they carry their course code), so this
 * does not need a course argument.
 */
export function getUnit(unitId: string): Unit | undefined {
  for (const course of COURSES) {
    const unit = course.units.find((candidate) => candidate.id === unitId);
    if (unit) return unit;
  }
  return undefined;
}

/** Looks up a problem type by id across every registered course. */
export function getProblemType(problemTypeId: string): ProblemType | undefined {
  for (const course of COURSES) {
    for (const unit of course.units) {
      const found = unit.problemTypes.find((candidate) => candidate.id === problemTypeId);
      if (found) return found;
    }
  }
  return undefined;
}

/** The course a unit belongs to, or `undefined`. */
export function getCourseForUnit(unitId: string): Course | undefined {
  return COURSES.find((course) => course.units.some((unit) => unit.id === unitId));
}

/**
 * Every problem type in a course, flattened, in course order.
 *
 * Course order means units sorted by `order`, and within a unit the order the
 * types are written in `mhf4u.ts` — which is teaching order, not alphabetical.
 * The coverage report and the work queue both depend on this ordering.
 *
 * @returns `[]` for an unknown course code rather than throwing, since the CLI
 * asks for whatever the user typed.
 */
export function allProblemTypes(courseCode: string): ProblemType[] {
  const course = getCourse(courseCode);
  if (!course) return [];
  return [...course.units]
    .sort((a, b) => a.order - b.order)
    .flatMap((unit) => unit.problemTypes);
}

/** Units of a course in `order`, or `[]` for an unknown code. */
export function allUnits(courseCode: string): Unit[] {
  const course = getCourse(courseCode);
  if (!course) return [];
  return [...course.units].sort((a, b) => a.order - b.order);
}

/** One structural problem with a course tree. */
export interface TaxonomyError {
  /** Stable, groupable code. */
  code: TaxonomyErrorCode;
  /** One sentence naming the offending ids. */
  message: string;
  /** Path into the tree, e.g. `units[2].problemTypes[4].outcome`. */
  path: string;
}

/** Stable codes for `validateCourse` findings. */
export type TaxonomyErrorCode =
  | 'DUPLICATE_UNIT_ID'
  | 'DUPLICATE_PROBLEM_TYPE_ID'
  | 'ORPHAN_UNIT_ID'
  | 'NON_CONTIGUOUS_ORDER'
  | 'DUPLICATE_ORDER'
  | 'EMPTY_FIELD'
  | 'EMPTY_DIFFICULTIES'
  | 'INVALID_DIFFICULTY'
  | 'MALFORMED_ID'
  | 'EMPTY_UNIT'
  | 'MISSING_NOTES';

/** The outcome of validating a course tree. */
export interface TaxonomyValidationResult {
  valid: boolean;
  errors: TaxonomyError[];
}

/**
 * Validates a course tree structurally.
 *
 * Run by the test suite against every registered course, so a malformed tree
 * fails CI rather than producing a quietly wrong coverage report. Like
 * `validateInstance`, it collects every problem rather than stopping at the
 * first, and never throws.
 */
export function validateCourse(course: Course): TaxonomyValidationResult {
  const errors: TaxonomyError[] = [];
  const units = Array.isArray(course.units) ? course.units : [];

  if (course.code.trim() === '') {
    errors.push({ code: 'EMPTY_FIELD', message: 'Course code is empty.', path: 'code' });
  }
  if (course.label.trim() === '') {
    errors.push({ code: 'EMPTY_FIELD', message: 'Course label is empty.', path: 'label' });
  }

  const unitIds = new Set<string>();
  const problemTypeIds = new Set<string>();
  const knownUnitIds = new Set(units.map((unit) => unit.id));
  const orders: number[] = [];

  units.forEach((unit, unitIndex) => {
    const unitPath = `units[${unitIndex}]`;

    if (unitIds.has(unit.id)) {
      errors.push({
        code: 'DUPLICATE_UNIT_ID',
        message: `Unit id ${JSON.stringify(unit.id)} appears more than once. Ids are permanent and must be unique.`,
        path: `${unitPath}.id`,
      });
    }
    unitIds.add(unit.id);

    if (!ID_PATTERN.test(unit.id)) {
      errors.push({
        code: 'MALFORMED_ID',
        message: `Unit id ${JSON.stringify(unit.id)} is not a namespaced slug (expected e.g. "mhf4u-u3-polynomial-equations").`,
        path: `${unitPath}.id`,
      });
    }
    for (const [field, value] of [['label', unit.label], ['strand', unit.strand]] as const) {
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push({
          code: 'EMPTY_FIELD',
          message: `Unit ${JSON.stringify(unit.id)} has an empty ${field}.`,
          path: `${unitPath}.${field}`,
        });
      }
    }

    orders.push(unit.order);

    const problemTypes = Array.isArray(unit.problemTypes) ? unit.problemTypes : [];
    if (problemTypes.length === 0) {
      errors.push({
        code: 'EMPTY_UNIT',
        message: `Unit ${JSON.stringify(unit.id)} has no problem types. An empty unit is a gap nobody will notice.`,
        path: `${unitPath}.problemTypes`,
      });
    }

    problemTypes.forEach((problemType, typeIndex) => {
      const typePath = `${unitPath}.problemTypes[${typeIndex}]`;

      if (problemTypeIds.has(problemType.id)) {
        errors.push({
          code: 'DUPLICATE_PROBLEM_TYPE_ID',
          message: `Problem type id ${JSON.stringify(problemType.id)} appears more than once. Ids are permanent and must be unique.`,
          path: `${typePath}.id`,
        });
      }
      problemTypeIds.add(problemType.id);

      if (!ID_PATTERN.test(problemType.id)) {
        errors.push({
          code: 'MALFORMED_ID',
          message: `Problem type id ${JSON.stringify(problemType.id)} is not a namespaced slug (expected e.g. "mhf4u-u3-factor-theorem-find-k").`,
          path: `${typePath}.id`,
        });
      }

      if (!knownUnitIds.has(problemType.unitId)) {
        errors.push({
          code: 'ORPHAN_UNIT_ID',
          message: `Problem type ${JSON.stringify(problemType.id)} claims unitId ${JSON.stringify(problemType.unitId)}, which is not a unit of ${course.code}.`,
          path: `${typePath}.unitId`,
        });
      } else if (problemType.unitId !== unit.id) {
        errors.push({
          code: 'ORPHAN_UNIT_ID',
          message: `Problem type ${JSON.stringify(problemType.id)} is nested under ${JSON.stringify(unit.id)} but declares unitId ${JSON.stringify(problemType.unitId)}.`,
          path: `${typePath}.unitId`,
        });
      }

      for (const [field, value] of [
        ['label', problemType.label],
        ['outcome', problemType.outcome],
      ] as const) {
        if (typeof value !== 'string' || value.trim() === '') {
          errors.push({
            code: 'EMPTY_FIELD',
            message: `Problem type ${JSON.stringify(problemType.id)} has an empty ${field}.`,
            path: `${typePath}.${field}`,
          });
        }
      }

      const difficulties = Array.isArray(problemType.difficulties) ? problemType.difficulties : [];
      if (difficulties.length === 0) {
        errors.push({
          code: 'EMPTY_DIFFICULTIES',
          message: `Problem type ${JSON.stringify(problemType.id)} declares no difficulties. A type nobody can place in a tier cannot be scheduled.`,
          path: `${typePath}.difficulties`,
        });
      }
      for (const difficulty of difficulties) {
        if (!VALID_DIFFICULTIES.has(difficulty)) {
          errors.push({
            code: 'INVALID_DIFFICULTY',
            message: `Problem type ${JSON.stringify(problemType.id)} declares difficulty ${String(difficulty)}; only 1, 2 and 3 exist.`,
            path: `${typePath}.difficulties`,
          });
        }
      }

      // A non-parameterizable type is excluded from the coverage denominator, so
      // it has to say why or it reads as an unexplained hole in the queue.
      if (problemType.parameterizable === false && (problemType.notes ?? '').trim() === '') {
        errors.push({
          code: 'MISSING_NOTES',
          message: `Problem type ${JSON.stringify(problemType.id)} is marked non-parameterizable but gives no reason. It is excluded from coverage, so the reason has to be written down.`,
          path: `${typePath}.notes`,
        });
      }
    });
  });

  // Unit order must be exactly 1..n, contiguous, no repeats. A gap means a unit
  // was deleted rather than rejected, and the tree no longer matches the outline.
  const seenOrders = new Set<number>();
  for (const [index, order] of orders.entries()) {
    if (seenOrders.has(order)) {
      errors.push({
        code: 'DUPLICATE_ORDER',
        message: `Two units share order ${order}. Course-outline order must be unique.`,
        path: `units[${index}].order`,
      });
    }
    seenOrders.add(order);
  }
  const sorted = [...orders].sort((a, b) => a - b);
  const expected = orders.map((_, index) => index + 1);
  if (orders.length > 0 && JSON.stringify(sorted) !== JSON.stringify(expected)) {
    errors.push({
      code: 'NON_CONTIGUOUS_ORDER',
      message: `Unit order values are ${sorted.join(', ')}; expected a contiguous 1..${orders.length}.`,
      path: 'units',
    });
  }

  return { valid: errors.length === 0, errors };
}

/** Validates every registered course. Used by the test suite. */
export function validateAllCourses(): TaxonomyValidationResult {
  const errors = COURSES.flatMap((course) =>
    validateCourse(course).errors.map((error) => ({
      ...error,
      path: `${course.code}.${error.path}`,
    })),
  );
  return { valid: errors.length === 0, errors };
}

export { MHF4U } from './mhf4u.ts';
export type { Course, ProblemType, ProblemTypeStatus, Unit } from './types.ts';
