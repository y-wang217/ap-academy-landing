/**
 * The curriculum taxonomy contract.
 *
 * Where `../types.ts` describes what a *generated question* is, this file
 * describes what the *curriculum* is: the tree of units and problem types a
 * course contains, independent of whether anything can generate them yet.
 * Joining the two is what produces a coverage report — what is built versus
 * what is still a gap.
 *
 * The tree is **data, not code**. `mhf4u.ts` is a literal. Nothing in here
 * computes, infers, or scans the filesystem; a curriculum is a thing a human
 * decides and a machine records.
 *
 * A note on honesty, which is the whole reason `status` and `parameterizable`
 * exist: this tree is built from the standard Ontario course structure, not from
 * an extracted question bank. Every entry is `provisional` until it has been
 * checked against real textbook content. A tree that claims more confidence than
 * it has is worse than no tree, because it hides the work still to do.
 */

import type { Difficulty, ProblemTypeId, UnitId } from '../types.ts';

/**
 * How much confidence there is that a problem type belongs in the course.
 *
 * - `provisional` — written from the standard course outline, not yet checked
 *   against an extracted question bank. The default, and the only honest value
 *   before extraction has been run.
 * - `confirmed` — matched against real questions from the textbook or an
 *   existing worksheet. Only a human sets this.
 * - `rejected` — checked and found not to be a real problem type in this course.
 *   Kept rather than deleted so the same wrong guess is not made twice; excluded
 *   from every coverage denominator.
 */
export type ProblemTypeStatus = 'provisional' | 'confirmed' | 'rejected';

/**
 * One problem archetype: the finest grain at which a single generator could
 * serve every question of that kind.
 *
 * Granularity rule, applied throughout `mhf4u.ts`: "solve trig equations" is too
 * coarse, "solve a linear trig equation over [0, 2pi]" is right. Err finer.
 * Merging two slots later is a one-line edit; splitting a slot after a generator
 * exists means rewriting the generator and orphaning any stored attempts against
 * its id.
 */
export interface ProblemType {
  /**
   * Stable, slug-cased, unit-namespaced id, e.g.
   * `mhf4u-u3-factor-theorem-find-k`.
   *
   * **Permanent once written.** Generators reference it via
   * `Generator.problemTypeId`, and stored student attempts will reference it
   * after that. Renaming one silently orphans history.
   */
  id: ProblemTypeId;
  /** The `Unit.id` this belongs to. Must resolve to a real unit in the same course. */
  unitId: UnitId;
  /**
   * Short name as a tutor would say it out loud, e.g.
   * `"Find k given a known factor"`. Sentence case, no trailing period. This is
   * what appears in the coverage table and, later, the curation UI.
   */
  label: string;
  /**
   * The learning outcome this serves, in **student-facing** language — what the
   * student can do, not what the curriculum document calls it. "I can find an
   * unknown coefficient when I am told one factor" rather than "C2.4".
   */
  outcome: string;
  /**
   * The difficulty band this type spans. Non-empty.
   *
   * A type listing `[1, 2]` needs at least two generators to be fully covered,
   * one per tier — `Generator` declares a single `Difficulty`, so a tier is the
   * unit of coverage.
   */
  difficulties: Difficulty[];
  /** See `ProblemTypeStatus`. Everything starts `provisional`. */
  status: ProblemTypeStatus;
  /**
   * Whether this type is worth parameterizing at all.
   *
   * `false` for anything genuinely bespoke: identity proofs, open-ended
   * modelling, anything needing a written justification, and anything whose
   * *input* is a graph the harness cannot render. These are **excluded from the
   * coverage denominator** — they are not gaps, they are work a generator should
   * never do. Every `false` entry carries a `notes` explaining why.
   */
  parameterizable: boolean;
  /**
   * Anything a human needs to know: why `parameterizable` is `false`, what this
   * was guessed from, whether it might merge with a neighbouring type.
   *
   * Uncertainty belongs here rather than in a silent omission. If unsure whether
   * a type belongs, include it and say so.
   */
  notes?: string;
}

/**
 * One unit of the course, in course-outline order.
 */
export interface Unit {
  /**
   * Stable, slug-cased, course-namespaced id, e.g.
   * `mhf4u-u3-polynomial-equations`. Permanent, for the same reason as
   * `ProblemType.id`.
   */
  id: UnitId;
  /**
   * Position in the course outline, 1-based and contiguous across the course.
   * The validator enforces `1..n` with no gaps and no duplicates, because a gap
   * means a unit was deleted rather than rejected.
   */
  order: number;
  /** Human-readable unit name, e.g. `"Polynomial equations and inequalities"`. */
  label: string;
  /**
   * The Ontario MHF4U strand this unit serves, e.g.
   * `"C. Polynomial and Rational Functions"`.
   *
   * Course-outline order and strand order are **not** the same: a course teaches
   * units in a teaching order, while the curriculum document groups expectations
   * by strand. Both are recorded so a coverage report can be read either way.
   */
  strand: string;
  /** The unit's problem types, in the order a course would teach them. */
  problemTypes: ProblemType[];
}

/**
 * A whole course.
 */
export interface Course {
  /** Ministry course code, uppercase, e.g. `"MHF4U"`. */
  code: string;
  /** Full course name, e.g. `"Advanced Functions, Grade 12, University Preparation"`. */
  label: string;
  /** Units in course-outline order. `Unit.order` must agree with this ordering. */
  units: Unit[];
}
