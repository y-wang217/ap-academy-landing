/**
 * MHF4U Unit 3 — find the member of a family of polynomials through a point.
 *
 * Given three zeros, every polynomial with those zeros has the form
 * `a(x - r1)(x - r2)(x - r3)`. One extra point pins `a` down. The whole
 * teaching point is that the zeros determine the *shape* and the point
 * determines the *scale*, and the mistake worth catching is forgetting the
 * second half entirely.
 *
 * A factored equation is not a number, so `Choice.value` uses the `opaque`
 * hatch with the canonical rendering as its identity.
 */

import { createRng, type Rng } from '../../rng.ts';
import {
  type Rational,
  ONE,
  div,
  equals,
  fromInt,
  isZero,
  mul,
  toLatex as rationalToLatex,
} from '../../rational.ts';
import { qOpaque } from '../../value.ts';
import { renderFactoredForm } from '../shared/polynomial.ts';
import type { Choice, DistractorStrategy, Generator, QuestionInstance } from '../../types.ts';

const PROBLEM_TYPE_ID = 'mhf4u-u3-family-of-polynomials-from-roots';
const GENERATOR_ID = `${PROBLEM_TYPE_ID}-d2`;
const UNIT_ID = 'mhf4u-u3-polynomial-equations';

const ROOT_BOUND = 5;
const SCALE_BOUND = 5;
const MAX_DRAWS = 80;

/** One instance. */
export interface FamilyParams {
  /** The three zeros, distinct. */
  roots: [number, number, number];
  /** The leading coefficient the point is chosen to produce. `|a| >= 2`. */
  a: number;
  /** x-coordinate of the given point. Never a root, or the point says nothing. */
  pointX: number;
}

/** Zeros -2, 1, 3 through (0, 12): a(2)(-1)(-3) = 6a = 12, so a = 2. */
export const FALLBACK_PARAMS: FamilyParams = { roots: [-2, 1, 3], a: 2, pointX: 0 };

const STRATEGIES: DistractorStrategy[] = [
  {
    id: 'omitted_leading_coefficient',
    label: 'Wrote the factors but never used the point to find the scale factor',
  },
  {
    id: 'sign_error_on_root',
    label: 'Wrote (x + r) for a zero at x = r instead of (x - r)',
  },
  {
    id: 'inverted_the_leading_coefficient',
    label: 'Divided the wrong way round when solving for the scale factor',
  },
];

/** The product of `(pointX - root)` over the roots — what `a` is scaled against. */
export function productAtPoint(params: FamilyParams): Rational {
  return params.roots.reduce(
    (product, root) => mul(product, fromInt(params.pointX - root)),
    ONE,
  );
}

/** The y-coordinate of the given point, which is `a` times the product. */
export function pointY(params: FamilyParams): Rational {
  return mul(fromInt(params.a), productAtPoint(params));
}

/** The correct answer, rendered. */
export function solveEquation(params: FamilyParams): string {
  return renderFactoredForm(
    params.roots.map((root) => fromInt(root)),
    fromInt(params.a),
  );
}

interface Distractor {
  strategyId: string;
  latex: string;
}

function buildDistractors(params: FamilyParams): Distractor[] {
  const roots = params.roots.map((root) => fromInt(root));
  return [
    {
      // Found the factors, never scaled them.
      strategyId: 'omitted_leading_coefficient',
      latex: renderFactoredForm(roots, ONE),
    },
    {
      // Zeros copied straight into the brackets without flipping sign.
      strategyId: 'sign_error_on_root',
      latex: renderFactoredForm(
        params.roots.map((root) => fromInt(-root)),
        fromInt(params.a),
      ),
    },
    {
      // Solved a * product = y by dividing product by y instead of y by product.
      strategyId: 'inverted_the_leading_coefficient',
      latex: renderFactoredForm(roots, div(ONE, fromInt(params.a))),
    },
  ];
}

export function isUsable(params: FamilyParams): boolean {
  const { roots, a, pointX } = params;
  if (new Set(roots).size !== 3) return false;
  // |a| must be at least 2, or the "forgot to scale" and "inverted the scale"
  // distractors collapse onto the correct answer.
  if (Math.abs(a) < 2) return false;
  // A point sitting on a zero gives 0 = 0 and determines nothing.
  if (roots.includes(pointX)) return false;
  if (isZero(productAtPoint(params))) return false;
  // A root of 0 renders as a bare `x`, and its sign-flipped twin is identical.
  if (roots.includes(0)) return false;

  const rendered = [solveEquation(params), ...buildDistractors(params).map((d) => d.latex)];
  return new Set(rendered).size === 4;
}

const PHRASINGS: ((zeros: string, point: string) => string)[] = [
  (zeros, point) =>
    `A cubic function has zeros at ${zeros} and passes through the point ${point}. Determine its equation in factored form.`,
  (zeros, point) =>
    `Write the equation of the cubic whose zeros are ${zeros} and whose graph contains ${point}.`,
  (zeros, point) =>
    `Members of a family of cubics share the zeros ${zeros}. Find the member that passes through ${point}.`,
];

function renderZeros(params: FamilyParams): string {
  const [r1, r2, r3] = params.roots;
  return `x = ${r1}, x = ${r2} and x = ${r3}`;
}

function renderPoint(params: FamilyParams): string {
  return `(${params.pointX}, ${rationalToLatex(pointY(params))})`;
}

function buildSolution(params: FamilyParams): string[] {
  const [r1, r2, r3] = params.roots;
  const product = productAtPoint(params);
  const y = pointY(params);
  const unscaled = renderFactoredForm(params.roots.map((root) => fromInt(root)), ONE);

  return [
    `Zeros tell you the factors, but they do not tell you the whole function. Every cubic with zeros at ${renderZeros(params)} looks like f(x) = a${unscaled}, for some constant a. That a is what the point is for.`,
    `Watch the signs turning zeros into factors: a zero at x = ${r1} gives the factor ${r1 < 0 ? `(x + ${Math.abs(r1)})` : `(x - ${r1})`}, because that is the bracket that becomes zero when x = ${r1}. The sign flips.`,
    `Now substitute the point ${renderPoint(params)}. That gives ${rationalToLatex(y)} = a(${params.pointX} - ${r1})(${params.pointX} - ${r2})(${params.pointX} - ${r3}).`,
    `The bracket product works out to ${rationalToLatex(product)}, so ${rationalToLatex(y)} = ${rationalToLatex(product)}a. Solve for a by dividing the y-value by the product — that way round, not the other — giving a = ${params.a}.`,
    `So the equation is f(x) = ${solveEquation(params)}. Sanity check it by putting x = ${params.pointX} back in: you should land on ${rationalToLatex(y)}.`,
  ];
}

function drawParams(rng: Rng): FamilyParams {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const roots: number[] = [];
    while (roots.length < 3) {
      const candidate = rng.nonZeroInt(-ROOT_BOUND, ROOT_BOUND);
      if (!roots.includes(candidate)) roots.push(candidate);
    }
    const magnitude = rng.int(2, SCALE_BOUND);
    const params: FamilyParams = {
      roots: [roots[0], roots[1], roots[2]],
      a: magnitude * rng.sign(),
      pointX: rng.intExcluding(-3, 3, roots),
    };
    if (isUsable(params)) return params;
  }
  return FALLBACK_PARAMS;
}

export const familyOfPolynomialsFromRoots: Generator = {
  id: GENERATOR_ID,
  unitId: UNIT_ID,
  problemTypeId: PROBLEM_TYPE_ID,
  difficulty: 2,
  strategies: STRATEGIES,

  generate(seed: number): QuestionInstance {
    const rng = createRng(seed);
    const params = drawParams(rng);
    const answer = solveEquation(params);

    const choices: Choice[] = [
      { latex: answer, isCorrect: true, value: qOpaque(answer, params.a) },
      ...buildDistractors(params).map((distractor, index) => ({
        latex: distractor.latex,
        isCorrect: false,
        strategyId: distractor.strategyId,
        value: qOpaque(distractor.latex, params.a + index + 1),
      })),
    ];

    const phrasing = rng.pick(PHRASINGS);

    return {
      generatorId: GENERATOR_ID,
      seed,
      unitId: UNIT_ID,
      problemTypeId: PROBLEM_TYPE_ID,
      difficulty: 2,
      stem: phrasing(renderZeros(params), renderPoint(params)),
      choices: rng.shuffle(choices),
      solution: buildSolution(params),
      conceptTag:
        'Family of polynomials: the zeros fix the factors, and one extra point fixes the scale factor',
    };
  },
};

/** True when the equation really passes through the stated point. Used by tests. */
export function passesThroughPoint(params: FamilyParams): boolean {
  const evaluated = mul(fromInt(params.a), productAtPoint(params));
  return equals(evaluated, pointY(params));
}

export const __testing = { buildDistractors, drawParams, renderPoint, renderZeros, PHRASINGS };
