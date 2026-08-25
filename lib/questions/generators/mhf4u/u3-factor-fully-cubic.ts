/**
 * MHF4U Unit 3 — factor a cubic fully, given one factor.
 *
 * The student is handed `(x - r1)` and must divide it out, then factor the
 * quadratic that remains. Two things go wrong reliably: they stop at the
 * partially-factored form, or they read the quadratic's roots straight into the
 * brackets without negating them. Both are distractors here.
 *
 * The cubic is expanded from three chosen roots, so the factorization the
 * question asks for is exact by construction.
 *
 * A factored form is not a number, so `Choice.value` uses the `opaque` hatch
 * with the canonical rendering as its identity.
 */

import { createRng, type Rng } from '../../rng.ts';
import { fromInt } from '../../rational.ts';
import { qOpaque } from '../../value.ts';
import {
  polyDivideByLinear,
  polyFromRoots,
  renderFactoredForm,
  renderLinearFactor,
  renderPoly,
  type Poly,
} from '../shared/polynomial.ts';
import type { Choice, DistractorStrategy, Generator, QuestionInstance } from '../../types.ts';

const PROBLEM_TYPE_ID = 'mhf4u-u3-factor-fully-cubic';
const GENERATOR_ID = `${PROBLEM_TYPE_ID}-d2`;
const UNIT_ID = 'mhf4u-u3-polynomial-equations';

const ROOT_BOUND = 6;
const MAX_DRAWS = 80;

/** One instance: the given factor's root first, then the two to be found. */
export interface FactorCubicParams {
  /** Root of the factor the question supplies. */
  given: number;
  /** The two roots the student has to find. */
  remaining: [number, number];
}

/** Roots 1, -2, 3: x^3 - 2x^2 - 5x + 6, given (x - 1). */
export const FALLBACK_PARAMS: FactorCubicParams = { given: 1, remaining: [-2, 3] };

const STRATEGIES: DistractorStrategy[] = [
  {
    id: 'stopped_at_partially_factored_form',
    label: 'Divided correctly but left the quadratic unfactored',
  },
  {
    id: 'sign_error_on_root',
    label: 'Wrote the quadratic roots straight into the brackets without negating them',
  },
  {
    id: 'reported_quotient_only',
    label: 'Factored the quotient but dropped the given factor',
  },
];

/** All three roots, given first. */
function allRoots(params: FactorCubicParams): number[] {
  return [params.given, ...params.remaining];
}

/** The cubic, expanded from its roots. */
export function buildPolynomial(params: FactorCubicParams): Poly {
  return polyFromRoots(allRoots(params).map((root) => fromInt(root)));
}

/** The quadratic left after dividing out the given factor. */
export function buildQuotient(params: FactorCubicParams): Poly {
  return polyDivideByLinear(buildPolynomial(params), fromInt(params.given)).quotient;
}

/** The fully factored form — the correct answer. */
export function solveFactoredForm(params: FactorCubicParams): string {
  return renderFactoredForm(allRoots(params).map((root) => fromInt(root)));
}

interface Distractor {
  strategyId: string;
  latex: string;
}

function buildDistractors(params: FactorCubicParams): Distractor[] {
  const given = renderLinearFactor(fromInt(params.given));
  const [r2, r3] = params.remaining;
  return [
    {
      // Divided correctly, then stopped — never factored the quadratic.
      strategyId: 'stopped_at_partially_factored_form',
      latex: `${given}(${renderPoly(buildQuotient(params))})`,
    },
    {
      // Solved x^2 + bx + c = 0, got roots r2 and r3, and wrote (x + r2)(x + r3).
      strategyId: 'sign_error_on_root',
      latex: `${given}${renderLinearFactor(fromInt(-r2))}${renderLinearFactor(fromInt(-r3))}`,
    },
    {
      // Factored the quotient and forgot the factor they had divided out.
      strategyId: 'reported_quotient_only',
      latex: renderFactoredForm([fromInt(r2), fromInt(r3)]),
    },
  ];
}

export function isUsable(params: FactorCubicParams): boolean {
  const roots = allRoots(params);
  if (roots.some((root) => root === 0)) return false;
  if (new Set(roots).size !== 3) return false;
  const [r2, r3] = params.remaining;
  // If r3 === -r2 the sign-flipped pair is the same set of brackets as the
  // correct one, so that distractor would be a second correct answer.
  if (r3 === -r2) return false;

  const rendered = [solveFactoredForm(params), ...buildDistractors(params).map((d) => d.latex)];
  return new Set(rendered).size === 4;
}

const PHRASINGS: ((polynomial: string, factor: string) => string)[] = [
  (polynomial, factor) =>
    `Given that ${factor} is a factor of f(x) = ${polynomial}, factor f(x) fully.`,
  (polynomial, factor) =>
    `f(x) = ${polynomial} has ${factor} as a factor. Write f(x) as a product of three linear factors.`,
  (polynomial, factor) =>
    `Factor f(x) = ${polynomial} completely, using the fact that ${factor} divides it exactly.`,
];

function buildSolution(params: FactorCubicParams): string[] {
  const polynomial = renderPoly(buildPolynomial(params));
  const given = renderLinearFactor(fromInt(params.given));
  const quotient = renderPoly(buildQuotient(params));
  const [r2, r3] = params.remaining;
  const answer = solveFactoredForm(params);

  return [
    `You are given one factor, so the first move is to divide it out and see what is left. Divide f(x) = ${polynomial} by ${given} — synthetic division with x = ${params.given} is quickest.`,
    `The division leaves the quadratic ${quotient}, with no remainder, which is what "is a factor" guarantees. So far f(x) = ${given}(${quotient}).`,
    `Now factor that quadratic. You need two numbers that multiply to give the constant term and add to give the middle coefficient; here they give roots x = ${r2} and x = ${r3}.`,
    `Be careful turning roots into brackets: a root of x = ${r2} means the factor is ${renderLinearFactor(fromInt(r2))}, not ${renderLinearFactor(fromInt(-r2))}. The sign flips.`,
    `Putting it together, f(x) = ${answer}. Check it by confirming the three roots are x = ${params.given}, x = ${r2} and x = ${r3} — those are the values that make each bracket zero.`,
  ];
}

function drawParams(rng: Rng): FactorCubicParams {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const roots: number[] = [];
    while (roots.length < 3) {
      const candidate = rng.nonZeroInt(-ROOT_BOUND, ROOT_BOUND);
      if (!roots.includes(candidate)) roots.push(candidate);
    }
    const params: FactorCubicParams = {
      given: roots[0],
      remaining: [roots[1], roots[2]],
    };
    if (isUsable(params)) return params;
  }
  return FALLBACK_PARAMS;
}

export const factorFullyCubic: Generator = {
  id: GENERATOR_ID,
  unitId: UNIT_ID,
  problemTypeId: PROBLEM_TYPE_ID,
  difficulty: 2,
  strategies: STRATEGIES,

  generate(seed: number): QuestionInstance {
    const rng = createRng(seed);
    const params = drawParams(rng);
    const answer = solveFactoredForm(params);

    const choices: Choice[] = [
      { latex: answer, isCorrect: true, value: qOpaque(answer, params.given) },
      ...buildDistractors(params).map((distractor, index) => ({
        latex: distractor.latex,
        isCorrect: false,
        strategyId: distractor.strategyId,
        // The approximation is only an ordering aid; distinctness for a factored
        // form comes from the canonical string, so a distinct index suffices.
        value: qOpaque(distractor.latex, params.given + index + 1),
      })),
    ];

    const phrasing = rng.pick(PHRASINGS);

    return {
      generatorId: GENERATOR_ID,
      seed,
      unitId: UNIT_ID,
      problemTypeId: PROBLEM_TYPE_ID,
      difficulty: 2,
      stem: phrasing(
        renderPoly(buildPolynomial(params)),
        renderLinearFactor(fromInt(params.given)),
      ),
      choices: rng.shuffle(choices),
      solution: buildSolution(params),
      conceptTag: 'Factoring a cubic: divide out a known factor, then factor the quadratic quotient',
    };
  },
};

export const __testing = { buildDistractors, drawParams, PHRASINGS };
