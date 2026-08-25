/**
 * The shared misconception registry.
 *
 * Every distractor in this codebase names the mistake that produced it. If each
 * generator declares those names inline, the same misconception acquires a
 * different id in every unit — `sign_error_on_root` here, `flipped_the_sign`
 * there, `wrong_root_sign` somewhere else — and per-misconception diagnostics
 * fragment into noise. A student who keeps making one mistake would show up as
 * making three.
 *
 * So ids live here, once, grouped by theme. Generators import them rather than
 * writing them out. `validate.ts` rejects any `strategyId` that does not resolve
 * to an entry below, which makes a typo a build failure instead of a silent
 * hole in the reporting.
 *
 * **Ids are permanent.** They will be written into stored student attempts.
 * Renaming one orphans that history. Adding one is free; merging two is a
 * migration.
 *
 * ## When to reuse and when to add
 *
 * Reuse when the *student's mental error* is the same, even if the surface
 * mathematics differs. Substituting `x = -r` for a factor `(x - r)` is the same
 * error whether the question is a remainder, a factor test, or a family of
 * curves — one id, `sign_error_on_root`, used by all of them.
 *
 * Add a new id when the error is genuinely different, even if the wrong answer
 * looks similar. Note `omitted_leading_coefficient` and
 * `ignored_the_leading_coefficient` below: both produce an answer missing a
 * factor of `a`, but one is a student who never looked for the scale factor and
 * the other is a student who found the relation and forgot to divide. Those are
 * different lessons, so they stay separate — and having them adjacent here is
 * what makes the distinction reviewable.
 */

import type { DistractorStrategy } from './types.ts';

/**
 * Broad families of misconception, for grouping in reports and in the curation
 * UI. Themes are a reporting convenience — nothing depends on them being right,
 * and a strategy can only carry one.
 */
export type StrategyTheme =
  /** A sign was dropped, flipped, or attached to the wrong thing. */
  | 'sign'
  /** A remembered rule was applied with a piece missing or inverted. */
  | 'law-misapplication'
  /** The right method, stopped too early or applied to too few cases. */
  | 'incomplete'
  /** A number or structure was read off the page instead of being derived. */
  | 'misreading-the-form'
  /** A method from an easier case was carried somewhere it does not apply. */
  | 'method-confusion'
  /** A domain, restriction, or endpoint condition was mishandled. */
  | 'domain-and-restrictions';

/** A registry entry: a strategy plus the theme it belongs to. */
export interface RegisteredStrategy extends DistractorStrategy {
  theme: StrategyTheme;
  /**
   * Why this exists as its own id, when a neighbouring id looks similar.
   * Present only where the distinction is easy to get wrong.
   */
  notes?: string;
}

/** Builds an entry, keeping the literal id as the key's type. */
function define<Id extends string>(
  id: Id,
  theme: StrategyTheme,
  label: string,
  notes?: string,
): RegisteredStrategy & { id: Id } {
  return { id, theme, label, notes };
}

/**
 * Every misconception this codebase can express, keyed by id.
 *
 * Grouped in source order by theme so related errors sit together and a new
 * generator's author can see whether their mistake already has a name.
 */
export const STRATEGIES = {
  // --- sign errors ----------------------------------------------------------
  sign_error_on_root: define(
    'sign_error_on_root',
    'sign',
    'Read the constant out of the bracket instead of solving it, so the sign is inverted',
    'The single most common error in Unit 3. Covers substituting x = -r for a factor (x - r), and writing (x + r) for a root at x = r. Same mental slip, so one id across every generator that can express it.',
  ),
  arithmetic_sign_slip: define(
    'arithmetic_sign_slip',
    'sign',
    'Right method, one sign dropped partway through the evaluation',
    'Distinct from sign_error_on_root: the method is understood, a single term simply lost its sign during the arithmetic.',
  ),
  solved_for_the_opposite_sign: define(
    'solved_for_the_opposite_sign',
    'sign',
    'Built the sign chart correctly, then read the intervals of the wrong sign',
  ),
  dropped_the_negation_in_the_root_relation: define(
    'dropped_the_negation_in_the_root_relation',
    'sign',
    'Recalled a root relation without its minus sign',
  ),

  // --- law misapplication ---------------------------------------------------
  ignored_the_leading_coefficient: define(
    'ignored_the_leading_coefficient',
    'law-misapplication',
    'Used a coefficient directly, as though the leading coefficient were 1',
    'The student knows the relation and forgot the division. Compare omitted_leading_coefficient, where they never looked for a scale factor at all.',
  ),
  inverted_the_leading_coefficient: define(
    'inverted_the_leading_coefficient',
    'law-misapplication',
    'Divided the wrong way round when solving for a scale factor',
  ),
  applied_log_law_to_sum_of_args: define(
    'applied_log_law_to_sum_of_args',
    'law-misapplication',
    'Read log A + log B as log(A + B) rather than log(AB)',
    'Not a slip but a wrong rule: the student has fused the addition outside the log with addition inside it. Distinct from any arithmetic error.',
  ),
  used_the_wrong_coefficient: define(
    'used_the_wrong_coefficient',
    'law-misapplication',
    'Reached for a neighbouring coefficient that belongs to a different relation',
  ),

  // --- incomplete work ------------------------------------------------------
  omitted_leading_coefficient: define(
    'omitted_leading_coefficient',
    'incomplete',
    'Wrote the factors but never used the given point to find the scale factor',
    'Half the method is missing. Compare ignored_the_leading_coefficient, where the method is complete but the division was skipped.',
  ),
  stopped_at_partially_factored_form: define(
    'stopped_at_partially_factored_form',
    'incomplete',
    'Divided correctly but left the remaining quadratic unfactored',
  ),
  dropped_a_root: define(
    'dropped_a_root',
    'incomplete',
    'Stopped after finding some of the roots and never solved for the rest',
  ),
  reported_quotient_only: define(
    'reported_quotient_only',
    'incomplete',
    'Factored the quotient but dropped the factor that was divided out',
  ),

  // --- misreading the form --------------------------------------------------
  remainder_read_off_constant_term: define(
    'remainder_read_off_constant_term',
    'misreading-the-form',
    'Reported the constant term as the remainder without substituting',
  ),
  lifted_coefficient_from_the_question: define(
    'lifted_coefficient_from_the_question',
    'misreading-the-form',
    'Used a number visible in the polynomial as though it were a root',
  ),
  reported_factor_constants_not_roots: define(
    'reported_factor_constants_not_roots',
    'misreading-the-form',
    'Reported the constants inside the factors rather than the values of x',
  ),
  counted_multiplicity_as_separate_roots: define(
    'counted_multiplicity_as_separate_roots',
    'misreading-the-form',
    'Counted a repeated factor as several distinct roots',
  ),
  counted_factors_not_roots: define(
    'counted_factors_not_roots',
    'misreading-the-form',
    'Counted the number of factors rather than the number of roots',
  ),

  // --- method confusion -----------------------------------------------------
  solved_for_wrong_variable: define(
    'solved_for_wrong_variable',
    'method-confusion',
    'Reported an intermediate quantity instead of the one the question asked for',
  ),
  picked_rational_root_candidate_without_testing: define(
    'picked_rational_root_candidate_without_testing',
    'method-confusion',
    'Chose a divisor of the constant term without substituting to check it',
  ),
  treated_cubic_like_a_quadratic: define(
    'treated_cubic_like_a_quadratic',
    'method-confusion',
    'Gave a single interval between the outer roots, as a quadratic would have',
  ),
  counted_irreducible_quadratic_as_real_roots: define(
    'counted_irreducible_quadratic_as_real_roots',
    'method-confusion',
    'Assumed a quadratic factor contributes two real roots',
  ),

  // --- domain and restrictions ----------------------------------------------
  dropped_extraneous_root_check: define(
    'dropped_extraneous_root_check',
    'domain-and-restrictions',
    'Solved correctly but never checked the roots against the domain, so kept one that breaks it',
    'The highest-value distractor in the course. A student who picks it did the algebra right and skipped the last step, which is a different lesson from getting the algebra wrong.',
  ),
  reported_extraneous_root_only: define(
    'reported_extraneous_root_only',
    'domain-and-restrictions',
    'Checked the domain but rejected the wrong root, keeping the one that fails',
  ),
  wrong_bracket_type_on_endpoints: define(
    'wrong_bracket_type_on_endpoints',
    'domain-and-restrictions',
    'Used the wrong bracket type for a strict or inclusive inequality',
  ),
} as const;

/** Every id the registry knows. Useful for exhaustiveness checks in tests. */
export type StrategyId = keyof typeof STRATEGIES;

/** Every registered strategy, in source order. */
export const ALL_STRATEGIES: RegisteredStrategy[] = Object.values(STRATEGIES);

/** Whether an arbitrary string is a registered strategy id. */
export function isRegisteredStrategy(id: string): id is StrategyId {
  return Object.prototype.hasOwnProperty.call(STRATEGIES, id);
}

/**
 * Looks up a strategy by id.
 *
 * @throws {Error} on an unknown id. Generators call this at module load, so a
 * typo fails the import rather than producing a question whose distractor
 * points at a misconception nobody has defined.
 */
export function strategy(id: StrategyId): RegisteredStrategy {
  const found = STRATEGIES[id];
  if (!found) {
    throw new Error(`Unknown strategy id ${JSON.stringify(id)}. Add it to strategies.ts.`);
  }
  return found;
}

/**
 * The `DistractorStrategy[]` a generator declares.
 *
 * Written as `strategiesFor('sign_error_on_root', 'dropped_a_root', ...)`, which
 * both reads as a list of misconceptions and fails to compile on a typo.
 */
export function strategiesFor(...ids: StrategyId[]): DistractorStrategy[] {
  return ids.map((id) => {
    const { id: strategyId, label } = strategy(id);
    return { id: strategyId, label };
  });
}

/** Every registered strategy in one theme. For grouping in reports. */
export function strategiesByTheme(theme: StrategyTheme): RegisteredStrategy[] {
  return ALL_STRATEGIES.filter((entry) => entry.theme === theme);
}
