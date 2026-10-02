/**
 * Coverage: the taxonomy joined against the generator registry.
 *
 * Answers one question — *what is built and what is still a gap?* — and that
 * answer is the work queue. Everything here is a report, never a gate: the CLI
 * exits 0 even when coverage is 0%, because on day one it is 1 of 112 and that
 * is not a failure, it is a starting point.
 *
 * **The denominator excludes non-parameterizable types.** A trig identity proof
 * is not a gap waiting for a generator, it is work a generator should never do.
 * Counting it as missing would make the report permanently, uninformatively red.
 * Rejected types are excluded for the same reason.
 */

import { GENERATORS } from '../generators/index.ts';
import { allUnits, getCourse } from './index.ts';
import type { ProblemType, Unit } from './types.ts';
import type { Difficulty, Generator } from '../types.ts';

/** Coverage of a single problem type. */
export interface ProblemTypeCoverage {
  problemTypeId: string;
  label: string;
  status: ProblemType['status'];
  /** `false` means excluded from the denominator. */
  parameterizable: boolean;
  /** Difficulty tiers the taxonomy says this type spans. */
  declaredDifficulties: Difficulty[];
  /** Tiers with at least one registered generator. */
  coveredDifficulties: Difficulty[];
  /** Declared tiers with no generator. Empty when fully covered. */
  missingDifficulties: Difficulty[];
  /** Ids of the generators serving this type. */
  generatorIds: string[];
  /** `true` when at least one generator exists, at any tier. */
  covered: boolean;
  /** `true` when every declared tier has a generator. */
  fullyCovered: boolean;
}

/** Coverage of one unit. */
export interface UnitCoverage {
  unitId: string;
  order: number;
  label: string;
  strand: string;
  /** Every problem type in the unit, including excluded ones. */
  total: number;
  confirmed: number;
  provisional: number;
  rejected: number;
  /** Types excluded from the denominator: non-parameterizable, or rejected. */
  excluded: number;
  /** The denominator: types that could and should have a generator. */
  inScope: number;
  /** In-scope types with at least one generator. */
  covered: number;
  /** In-scope types with a generator at every declared tier. */
  fullyCovered: number;
  /** `covered / inScope`, or 0 when nothing is in scope. */
  coverageRatio: number;
  problemTypes: ProblemTypeCoverage[];
}

/** A gap worth working on, for the ordered queue. */
export interface CoverageGap {
  unitId: string;
  unitOrder: number;
  unitLabel: string;
  problemTypeId: string;
  label: string;
  /** Tiers with no generator. For an uncovered type this is every declared tier. */
  missingDifficulties: Difficulty[];
  /** `true` when the type has no generator at all, as opposed to a partial tier gap. */
  entirelyMissing: boolean;
}

/** The whole report. */
export interface CoverageReport {
  courseCode: string;
  courseLabel: string;
  units: UnitCoverage[];
  /** Course-wide totals, summed over units. */
  totals: {
    total: number;
    confirmed: number;
    provisional: number;
    rejected: number;
    excluded: number;
    inScope: number;
    covered: number;
    fullyCovered: number;
    coverageRatio: number;
    generatorsRegistered: number;
  };
  /**
   * Every gap, ordered by unit order and then by position within the unit.
   *
   * Types with no generator at all come before partial tier gaps within the same
   * unit, since starting a type is worth more than filling in its second tier.
   */
  gaps: CoverageGap[];
  /**
   * Generators whose `problemTypeId` matches nothing in the taxonomy.
   *
   * Almost always a typo or a slug that drifted. Surfaced loudly because such a
   * generator silently contributes to no coverage at all.
   */
  orphanGenerators: { generatorId: string; problemTypeId: string }[];
}

/** Whether a type counts toward the denominator. */
function isInScope(problemType: ProblemType): boolean {
  return problemType.parameterizable && problemType.status !== 'rejected';
}

function coverProblemType(
  problemType: ProblemType,
  generatorsByType: Map<string, Generator[]>,
): ProblemTypeCoverage {
  const generators = generatorsByType.get(problemType.id) ?? [];
  const covered = new Set(generators.map((generator) => generator.difficulty));
  const declared = problemType.difficulties;
  const coveredDifficulties = declared.filter((difficulty) => covered.has(difficulty));
  const missingDifficulties = declared.filter((difficulty) => !covered.has(difficulty));

  return {
    problemTypeId: problemType.id,
    label: problemType.label,
    status: problemType.status,
    parameterizable: problemType.parameterizable,
    declaredDifficulties: declared,
    coveredDifficulties,
    missingDifficulties,
    generatorIds: generators.map((generator) => generator.id),
    covered: generators.length > 0,
    fullyCovered: generators.length > 0 && missingDifficulties.length === 0,
  };
}

function coverUnit(unit: Unit, generatorsByType: Map<string, Generator[]>): UnitCoverage {
  const problemTypes = unit.problemTypes.map((problemType) =>
    coverProblemType(problemType, generatorsByType),
  );
  const inScopeTypes = unit.problemTypes.filter(isInScope);
  const inScopeIds = new Set(inScopeTypes.map((problemType) => problemType.id));
  const inScopeCoverage = problemTypes.filter((coverage) => inScopeIds.has(coverage.problemTypeId));

  const covered = inScopeCoverage.filter((coverage) => coverage.covered).length;
  const inScope = inScopeTypes.length;

  return {
    unitId: unit.id,
    order: unit.order,
    label: unit.label,
    strand: unit.strand,
    total: unit.problemTypes.length,
    confirmed: unit.problemTypes.filter((t) => t.status === 'confirmed').length,
    provisional: unit.problemTypes.filter((t) => t.status === 'provisional').length,
    rejected: unit.problemTypes.filter((t) => t.status === 'rejected').length,
    excluded: unit.problemTypes.length - inScope,
    inScope,
    covered,
    fullyCovered: inScopeCoverage.filter((coverage) => coverage.fullyCovered).length,
    coverageRatio: inScope === 0 ? 0 : covered / inScope,
    problemTypes,
  };
}

/**
 * Builds the coverage report for a course.
 *
 * @param courseCode e.g. `"MHF4U"`, case-insensitive.
 * @param generators defaults to the registry. Injectable so tests can join
 * against a fixture rather than whatever happens to be registered.
 * @throws {Error} if the course code is unknown — unlike the accessors, which
 * return `undefined`, because a report for a course that does not exist is not
 * a meaningful empty result, it is a mistake in the caller.
 */
export function buildCoverageReport(
  courseCode: string,
  generators: Generator[] = GENERATORS,
): CoverageReport {
  const course = getCourse(courseCode);
  if (!course) {
    throw new Error(`Unknown course code ${JSON.stringify(courseCode)}.`);
  }

  const generatorsByType = new Map<string, Generator[]>();
  for (const generator of generators) {
    const existing = generatorsByType.get(generator.problemTypeId);
    if (existing) existing.push(generator);
    else generatorsByType.set(generator.problemTypeId, [generator]);
  }

  const units = allUnits(course.code).map((unit) => coverUnit(unit, generatorsByType));

  const knownProblemTypeIds = new Set(
    course.units.flatMap((unit) => unit.problemTypes.map((problemType) => problemType.id)),
  );
  const orphanGenerators = generators
    .filter((generator) => !knownProblemTypeIds.has(generator.problemTypeId))
    .map((generator) => ({
      generatorId: generator.id,
      problemTypeId: generator.problemTypeId,
    }));

  const gaps: CoverageGap[] = [];
  for (const unit of units) {
    const inScope = unit.problemTypes.filter(
      (coverage) => coverage.parameterizable && coverage.status !== 'rejected',
    );
    // Untouched types first: starting a type is worth more than adding its
    // second difficulty tier.
    const untouched = inScope.filter((coverage) => !coverage.covered);
    const partial = inScope.filter(
      (coverage) => coverage.covered && coverage.missingDifficulties.length > 0,
    );
    for (const coverage of [...untouched, ...partial]) {
      gaps.push({
        unitId: unit.unitId,
        unitOrder: unit.order,
        unitLabel: unit.label,
        problemTypeId: coverage.problemTypeId,
        label: coverage.label,
        missingDifficulties: coverage.missingDifficulties,
        entirelyMissing: !coverage.covered,
      });
    }
  }

  const sum = (pick: (unit: UnitCoverage) => number): number =>
    units.reduce((total, unit) => total + pick(unit), 0);
  const inScopeTotal = sum((unit) => unit.inScope);
  const coveredTotal = sum((unit) => unit.covered);

  return {
    courseCode: course.code,
    courseLabel: course.label,
    units,
    totals: {
      total: sum((unit) => unit.total),
      confirmed: sum((unit) => unit.confirmed),
      provisional: sum((unit) => unit.provisional),
      rejected: sum((unit) => unit.rejected),
      excluded: sum((unit) => unit.excluded),
      inScope: inScopeTotal,
      covered: coveredTotal,
      fullyCovered: sum((unit) => unit.fullyCovered),
      coverageRatio: inScopeTotal === 0 ? 0 : coveredTotal / inScopeTotal,
      generatorsRegistered: generators.length,
    },
    gaps,
    orphanGenerators,
  };
}
