/**
 * MHF4U Unit 3 — solve a factorable polynomial equation.
 *
 * `(x - r1)(x - r2)(x - r3) = 0` expanded into standard form. The student
 * factors and reads off the roots.
 *
 * The answer is a **solution set**, so `Choice.value` is a `QValue.set`. That
 * matters: sets compare equal regardless of member order, so `{1, -2, 3}` and
 * `{3, 1, -2}` cannot both appear as separate options — which is exactly the
 * collision a string comparison would miss.
 */

import { createRng, type Rng } from '../../rng.ts';
import { fromInt } from '../../rational.ts';
import { qInt, qSet, toLatex as valueToLatex, valuesEqual, type QValue } from '../../value.ts';
import { polyFromRoots, renderFactoredForm, renderPoly, type Poly } from '../shared/polynomial.ts';
import type { Choice, DistractorStrategy, Generator, QuestionInstance } from '../../types.ts';

const PROBLEM_TYPE_ID = 'mhf4u-u3-solve-polynomial-equation-factorable';
const GENERATOR_ID = `${PROBLEM_TYPE_ID}-d2`;
const UNIT_ID = 'mhf4u-u3-polynomial-equations';

const ROOT_BOUND = 6;
const MAX_DRAWS = 80;

/** One instance: the three roots of the equation. */
export interface SolveEquationParams {
  roots: [number, number, number];
}

/** Roots 1, -2, 3 give x^3 - 2x^2 - 5x + 6 = 0. */
export const FALLBACK_PARAMS: SolveEquationParams = { roots: [1, -2, 3] };

const STRATEGIES: DistractorStrategy[] = [
  {
    id: 'sign_error_on_root',
    label: 'Read the bracket constants off as the roots without flipping their signs',
  },
  {
    id: 'dropped_a_root',
    label: 'Stopped after finding two roots and never solved the remaining factor',
  },
  {
    id: 'reported_factor_constants_not_roots',
    label: 'Reported the constants inside the factors rather than the values of x',
  },
];

export function buildPolynomial(params: SolveEquationParams): Poly {
  return polyFromRoots(params.roots.map((root) => fromInt(root)));
}

/** The correct answer: the solution set. */
export function solveRoots(params: SolveEquationParams): QValue {
  return qSet(params.roots.map((root) => qInt(root)));
}

interface Distractor {
  strategyId: string;
  value: QValue;
}

function buildDistractors(params: SolveEquationParams): Distractor[] {
  const [r1, r2, r3] = params.roots;
  return [
    {
      // Every sign flipped: the classic "(x - 2) means x = -2" error.
      strategyId: 'sign_error_on_root',
      value: qSet([qInt(-r1), qInt(-r2), qInt(-r3)]),
    },
    {
      // Found two roots and never divided out to get the third.
      strategyId: 'dropped_a_root',
      value: qSet([qInt(r1), qInt(r2)]),
    },
    {
      // Reported the bracket constants, which is the sign error applied to only
      // the two roots found after the division — a partial version of the same slip.
      strategyId: 'reported_factor_constants_not_roots',
      value: qSet([qInt(r1), qInt(-r2), qInt(-r3)]),
    },
  ];
}

export function isUsable(params: SolveEquationParams): boolean {
  const { roots } = params;
  if (roots.some((root) => root === 0)) return false;
  if (new Set(roots).size !== 3) return false;

  const values = [solveRoots(params), ...buildDistractors(params).map((d) => d.value)];
  for (let a = 0; a < values.length; a += 1) {
    for (let b = a + 1; b < values.length; b += 1) {
      // Set equality ignores member order, so this catches the reorderings a
      // string comparison would let through.
      if (valuesEqual(values[a], values[b])) return false;
    }
  }
  // Distinct as sets but identical on the page would still be a duplicate.
  const rendered = values.map(valueToLatex);
  return new Set(rendered).size === 4;
}

const PHRASINGS: ((polynomial: string) => string)[] = [
  (polynomial) => `Solve ${polynomial} = 0.`,
  (polynomial) => `Find all real solutions of the equation ${polynomial} = 0.`,
  (polynomial) => `Determine the values of x that satisfy ${polynomial} = 0.`,
];

function buildSolution(params: SolveEquationParams): string[] {
  const [r1, r2, r3] = params.roots;
  const polynomial = renderPoly(buildPolynomial(params));
  const factored = renderFactoredForm(params.roots.map((root) => fromInt(root)));

  return [
    `A polynomial equation set equal to zero is asking you to factor, because a product is zero only when one of its factors is zero. So the whole job is turning ${polynomial} into brackets.`,
    `Start by hunting for one root. Try the divisors of the constant term until one gives zero; x = ${r1} works, so ${`(x - ${r1})`.replace('- -', '+ ')} is a factor. Divide it out and factor the quadratic that is left.`,
    `That gives ${polynomial} = ${factored}.`,
    `Now set each bracket to zero in turn. This is the step to slow down on: the bracket that reads with a ${r2 < 0 ? 'plus' : 'minus'} sign gives x = ${r2}, because you solve the bracket rather than copying the number out of it.`,
    `Doing that for all three brackets gives x = ${r1}, x = ${r2} and x = ${r3}. So the solution set is ${valueToLatex(solveRoots(params))}.`,
  ];
}

function drawParams(rng: Rng): SolveEquationParams {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const roots: number[] = [];
    while (roots.length < 3) {
      const candidate = rng.nonZeroInt(-ROOT_BOUND, ROOT_BOUND);
      if (!roots.includes(candidate)) roots.push(candidate);
    }
    const params: SolveEquationParams = { roots: [roots[0], roots[1], roots[2]] };
    if (isUsable(params)) return params;
  }
  return FALLBACK_PARAMS;
}

export const solvePolynomialEquationFactorable: Generator = {
  id: GENERATOR_ID,
  unitId: UNIT_ID,
  problemTypeId: PROBLEM_TYPE_ID,
  difficulty: 2,
  strategies: STRATEGIES,

  generate(seed: number): QuestionInstance {
    const rng = createRng(seed);
    const params = drawParams(rng);
    const answer = solveRoots(params);

    const choices: Choice[] = [
      { latex: valueToLatex(answer), isCorrect: true, value: answer },
      ...buildDistractors(params).map((distractor) => ({
        latex: valueToLatex(distractor.value),
        isCorrect: false,
        strategyId: distractor.strategyId,
        value: distractor.value,
      })),
    ];

    const phrasing = rng.pick(PHRASINGS);

    return {
      generatorId: GENERATOR_ID,
      seed,
      unitId: UNIT_ID,
      problemTypeId: PROBLEM_TYPE_ID,
      difficulty: 2,
      stem: phrasing(renderPoly(buildPolynomial(params))),
      choices: rng.shuffle(choices),
      solution: buildSolution(params),
      conceptTag: 'Solving by factoring: a product is zero exactly when one factor is zero',
    };
  },
};

export const __testing = { buildDistractors, drawParams, PHRASINGS };
