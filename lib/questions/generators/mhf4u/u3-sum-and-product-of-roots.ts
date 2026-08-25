/**
 * MHF4U Unit 3 — sum and product of the roots from the coefficients.
 *
 * For `ax^3 + bx^2 + cx + d = 0`, expanding `a(x - r1)(x - r2)(x - r3)` and
 * matching coefficients gives:
 *
 *   sum of roots     = -b/a
 *   product of roots = -d/a
 *
 * The point is that you get both without finding a single root. Each instance
 * asks for one of the two, which also doubles the stem space.
 *
 * The three distractors are the three ways the relation gets misremembered:
 * dropping the negation, ignoring the leading coefficient, and reaching for the
 * wrong coefficient entirely.
 */

import { createRng, type Rng } from '../../rng.ts';
import { type Rational, div, equals, fromInt, isZero, neg, toLatex } from '../../rational.ts';
import { isTriviallyDistinguishable } from '../../equivalence.ts';
import { qRational } from '../../value.ts';
import { strategiesFor } from '../../strategies.ts';
import { polyFromDescending, renderPoly } from '../shared/polynomial.ts';
import type { Choice, Generator, QuestionInstance } from '../../types.ts';

const PROBLEM_TYPE_ID = 'mhf4u-u3-sum-and-product-of-roots';
const GENERATOR_ID = `${PROBLEM_TYPE_ID}-d2`;
const UNIT_ID = 'mhf4u-u3-polynomial-equations';

const COEFFICIENT_BOUND = 9;
const LEADING_BOUND = 6;
const MAX_DRAWS = 80;

/** Which of the two relations the instance asks for. */
export type Mode = 'sum' | 'product';

/** One instance: the four coefficients and which relation is asked. */
export interface RootsRelationParams {
  a: number;
  b: number;
  c: number;
  d: number;
  mode: Mode;
}

/** 2x^3 - 5x^2 + 4x - 6 = 0, asking for the sum: -(-5)/2 = 5/2. */
export const FALLBACK_PARAMS: RootsRelationParams = { a: 2, b: -5, c: 4, d: -6, mode: 'sum' };

/**
 * The misconceptions this generator expresses, from the shared registry in
 * `strategies.ts`. Declaring ids inline would let the same mistake acquire a
 * different name in every unit, which fragments per-misconception reporting.
 */
const STRATEGIES = strategiesFor(
  'dropped_the_negation_in_the_root_relation',
  'ignored_the_leading_coefficient',
  'used_the_wrong_coefficient',
);

/** The correct value for the mode being asked. */
export function solveRelation(params: RootsRelationParams): Rational {
  const { a, b, d, mode } = params;
  const numerator = mode === 'sum' ? b : d;
  return neg(div(fromInt(numerator), fromInt(a)));
}

interface Distractor {
  strategyId: string;
  value: Rational;
}

function buildDistractors(params: RootsRelationParams): Distractor[] {
  const { a, b, c, d, mode } = params;
  const numerator = mode === 'sum' ? b : d;
  return [
    {
      // Recalled "sum = b/a" rather than "sum = -b/a".
      strategyId: 'dropped_the_negation_in_the_root_relation',
      value: div(fromInt(numerator), fromInt(a)),
    },
    {
      // Divided by nothing, as though the cubic were monic.
      strategyId: 'ignored_the_leading_coefficient',
      value: neg(fromInt(numerator)),
    },
    {
      // Grabbed the middle coefficient, which belongs to neither relation.
      strategyId: 'used_the_wrong_coefficient',
      value: neg(div(fromInt(c), fromInt(a))),
    },
  ];
}

export function isUsable(params: RootsRelationParams): boolean {
  const { a, b, c, d } = params;
  if (a === 0 || b === 0 || c === 0 || d === 0) return false;
  // |a| = 1 collapses the "ignored the leading coefficient" distractor onto
  // either the answer or the negation distractor.
  if (Math.abs(a) < 2) return false;

  const answer = solveRelation(params);
  if (isZero(answer)) return false;

  const distractors = buildDistractors(params);
  if (distractors.some((distractor) => isZero(distractor.value))) return false;

  const values = [answer, ...distractors.map((distractor) => distractor.value)];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (equals(values[i], values[j])) return false;
    }
  }
  return !distractors.some((distractor) => isTriviallyDistinguishable(answer, distractor.value));
}

const PHRASINGS: Record<Mode, ((equation: string) => string)[]> = {
  sum: [
    (equation) => `The equation ${equation} = 0 has three roots. Find the sum of the roots.`,
    (equation) =>
      `Without solving it, determine the sum of the roots of ${equation} = 0.`,
    (equation) => `What is the sum of the three roots of ${equation} = 0?`,
  ],
  product: [
    (equation) => `The equation ${equation} = 0 has three roots. Find the product of the roots.`,
    (equation) =>
      `Without solving it, determine the product of the roots of ${equation} = 0.`,
    (equation) => `What is the product of the three roots of ${equation} = 0?`,
  ],
};

function buildEquation(params: RootsRelationParams): string {
  return renderPoly(polyFromDescending(params.a, params.b, params.c, params.d));
}

function buildSolution(params: RootsRelationParams): string[] {
  const { a, b, d, mode } = params;
  const relevant = mode === 'sum' ? b : d;
  const position = mode === 'sum' ? 'x^2 coefficient' : 'constant term';
  const answer = solveRelation(params);

  return [
    `You are not being asked to solve anything, and you should not try. The roots are hiding in the coefficients already, because ${buildEquation(params)} is the expanded form of ${a}(x - r_1)(x - r_2)(x - r_3).`,
    `Multiply that out and match terms. The x^2 coefficient comes out as -${a}(r_1 + r_2 + r_3), and the constant term as -${a}r_1r_2r_3. So the sum of the roots is -b/a and the product is -d/a.`,
    `Here you want the ${mode}, so take the ${position}, which is ${relevant}, put it over the leading coefficient ${a}, and negate.`,
    `That gives ${mode === 'sum' ? 'sum' : 'product'} = -(${relevant})/(${a}) = ${toLatex(answer)}.`,
    `Two things to keep straight: the minus sign is part of the relation and not optional, and you divide by the leading coefficient even when it is not 1. Skip either and you land on one of the other options here.`,
  ];
}

function drawParams(rng: Rng): RootsRelationParams {
  const modes: Mode[] = ['sum', 'product'];
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const magnitude = rng.int(2, LEADING_BOUND);
    const params: RootsRelationParams = {
      a: magnitude * rng.sign(),
      b: rng.nonZeroInt(-COEFFICIENT_BOUND, COEFFICIENT_BOUND),
      c: rng.nonZeroInt(-COEFFICIENT_BOUND, COEFFICIENT_BOUND),
      d: rng.nonZeroInt(-COEFFICIENT_BOUND, COEFFICIENT_BOUND),
      mode: rng.pick(modes),
    };
    if (isUsable(params)) return params;
  }
  return FALLBACK_PARAMS;
}

export const sumAndProductOfRoots: Generator = {
  id: GENERATOR_ID,
  unitId: UNIT_ID,
  problemTypeId: PROBLEM_TYPE_ID,
  difficulty: 2,
  strategies: STRATEGIES,

  generate(seed: number): QuestionInstance {
    const rng = createRng(seed);
    const params = drawParams(rng);
    const answer = solveRelation(params);

    const choices: Choice[] = [
      { latex: toLatex(answer), isCorrect: true, value: qRational(answer) },
      ...buildDistractors(params).map((distractor) => ({
        latex: toLatex(distractor.value),
        isCorrect: false,
        strategyId: distractor.strategyId,
        value: qRational(distractor.value),
      })),
    ];

    const phrasing = rng.pick(PHRASINGS[params.mode]);

    return {
      generatorId: GENERATOR_ID,
      seed,
      unitId: UNIT_ID,
      problemTypeId: PROBLEM_TYPE_ID,
      difficulty: 2,
      stem: phrasing(buildEquation(params)),
      choices: rng.shuffle(choices),
      solution: buildSolution(params),
      conceptTag:
        'Root relations: for ax^3 + bx^2 + cx + d, the roots sum to -b/a and multiply to -d/a',
    };
  },
};

export const __testing = { buildDistractors, buildEquation, drawParams, PHRASINGS };
