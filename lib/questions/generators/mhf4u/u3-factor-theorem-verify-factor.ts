/**
 * MHF4U Unit 3 — which binomial is a factor?
 *
 * Given a cubic in standard form, pick the `(x - r)` that divides it exactly.
 * The mathematics is the factor theorem read the other way round: `(x - r)` is a
 * factor exactly when `f(r) = 0`, so the work is testing candidates rather than
 * dividing.
 *
 * The polynomial is built by expanding `(x - r1)(x - r2)(x - r3)`, which
 * guarantees the roots are exactly what the question claims. Choosing
 * coefficients and hoping a nice root falls out does not.
 *
 * **On the answer's value:** a binomial is not a number, so `Choice.value` uses
 * the `opaque` escape hatch, with the canonical factor string as its identity
 * and the root as its approximation. This is what the hatch is for — the union
 * has no `linearFactor` kind and inventing one for a single generator would be
 * worse than using the hatch as designed. Distinctness still holds: canonical
 * factor strings differ exactly when the factors differ.
 */

import { createRng, type Rng } from '../../rng.ts';
import { fromInt, isZero } from '../../rational.ts';
import { qOpaque } from '../../value.ts';
import {
  integerDivisors,
  polyEval,
  polyFromRoots,
  renderLinearFactor,
  renderPoly,
  type Poly,
} from '../shared/polynomial.ts';
import type { Choice, DistractorStrategy, Generator, QuestionInstance } from '../../types.ts';

const PROBLEM_TYPE_ID = 'mhf4u-u3-factor-theorem-verify-factor';
const GENERATOR_ID = `${PROBLEM_TYPE_ID}-d1`;
const UNIT_ID = 'mhf4u-u3-polynomial-equations';

/**
 * Roots are bounded so the expanded coefficients stay small enough to test
 * mentally, but not so tightly that 500 seeds start repeating.
 *
 * At 5 the space is C(10,3) = 120 polynomials and the sweep came back at 47.8%
 * distinct stems, under the 60% floor. At 6 it is C(12,3) = 220, which with
 * four phrasings clears it comfortably.
 */
const ROOT_BOUND = 6;
const MAX_DRAWS = 80;

/** One instance: three distinct non-zero roots, and which one is offered as the answer. */
export interface VerifyFactorParams {
  /** The three roots of the cubic. Distinct and non-zero. */
  roots: number[];
  /** Index into `roots` of the factor that is the correct answer. */
  answerIndex: number;
  /** Root of the "candidate from the constant term" distractor. Not a real root. */
  divisorDistractor: number;
  /** Root of the "number lifted from the question" distractor. Not a real root. */
  coefficientDistractor: number;
}

/**
 * A tuple satisfying every constraint, so `generate` is total.
 * Roots 1, -2, 3 expand to x^3 - 2x^2 - 5x + 6.
 */
export const FALLBACK_PARAMS: VerifyFactorParams = {
  roots: [1, -2, 3],
  answerIndex: 0,
  divisorDistractor: 6,
  coefficientDistractor: -5,
};

const STRATEGIES: DistractorStrategy[] = [
  {
    // Shared id: the same misconception as in the other Unit 3 generators.
    id: 'sign_error_on_root',
    label: 'Flipped the sign of the binomial, testing x = -r instead of x = r',
  },
  {
    id: 'picked_rational_root_candidate_without_testing',
    label: 'Chose a divisor of the constant term without substituting to check it',
  },
  {
    id: 'lifted_coefficient_from_the_question',
    label: 'Used a number visible in the polynomial as though it were a root',
  },
];

/** The cubic, expanded from its roots so the roots are exact by construction. */
export function buildPolynomial(params: VerifyFactorParams): Poly {
  return polyFromRoots(params.roots.map((root) => fromInt(root)));
}

/** The root whose binomial is the correct answer. */
export function answerRoot(params: VerifyFactorParams): number {
  return params.roots[params.answerIndex];
}

/** Whether `candidate` is genuinely a root of the cubic. */
function isRoot(params: VerifyFactorParams, candidate: number): boolean {
  return isZero(polyEval(buildPolynomial(params), fromInt(candidate)));
}

interface Distractor {
  strategyId: string;
  root: number;
}

/** The three wrong binomials, each from a nameable mistake. */
function buildDistractors(params: VerifyFactorParams): Distractor[] {
  return [
    { strategyId: 'sign_error_on_root', root: -answerRoot(params) },
    { strategyId: 'picked_rational_root_candidate_without_testing', root: params.divisorDistractor },
    { strategyId: 'lifted_coefficient_from_the_question', root: params.coefficientDistractor },
  ];
}

/**
 * Whether a tuple yields a question with exactly one correct answer.
 *
 * The binding constraint is that **no distractor may itself be a root** — a
 * cubic has three of them, and offering a second real factor would make the
 * question unanswerable. Everything else guards against duplicate options.
 */
export function isUsable(params: VerifyFactorParams): boolean {
  const { roots } = params;
  if (roots.length !== 3) return false;
  if (roots.some((root) => root === 0)) return false;
  if (new Set(roots).size !== 3) return false;

  const distractorRoots = buildDistractors(params).map((d) => d.root);
  // A distractor that is actually a root would be a second correct answer.
  if (distractorRoots.some((root) => isRoot(params, root))) return false;
  // Two distractors offering the same binomial leaves fewer than four options.
  if (new Set(distractorRoots).size !== 3) return false;
  if (distractorRoots.includes(answerRoot(params))) return false;
  // A zero root renders as bare `x`, which reads oddly beside three binomials.
  if (distractorRoots.some((root) => root === 0)) return false;
  return true;
}

const PHRASINGS: ((polynomial: string) => string)[] = [
  (polynomial) => `Which of the following is a factor of f(x) = ${polynomial}?`,
  (polynomial) => `One of these binomials divides f(x) = ${polynomial} exactly. Which one?`,
  (polynomial) => `For f(x) = ${polynomial}, which binomial below is a factor?`,
  (polynomial) =>
    `Exactly one of the binomials below leaves no remainder when it is divided into f(x) = ${polynomial}. Identify it.`,
];

function buildSolution(params: VerifyFactorParams): string[] {
  const polynomial = renderPoly(buildPolynomial(params));
  const root = answerRoot(params);
  const factor = renderLinearFactor(fromInt(root));
  const distractors = buildDistractors(params);
  const wrongRoot = distractors[0].root;
  const wrongValue = polyEval(buildPolynomial(params), fromInt(wrongRoot));
  const otherRoot = distractors[1].root;
  const otherValue = polyEval(buildPolynomial(params), fromInt(otherRoot));

  return [
    `Do not divide anything. The factor theorem says ${factor} is a factor of f(x) exactly when f(${root}) = 0, so this is a testing question: substitute each candidate and look for the one that gives zero.`,
    `Start with the answer. Substituting x = ${root} into f(x) = ${polynomial} gives f(${root}) = 0, so ${factor} is a factor.`,
    `Check that the others are not. Substituting x = ${wrongRoot} gives f(${wrongRoot}) = ${wrongValue.num.toString()}, which is not zero, so ${renderLinearFactor(fromInt(wrongRoot))} is not a factor. This is the one to be careful about: the binomial ${renderLinearFactor(fromInt(wrongRoot))} corresponds to x = ${wrongRoot}, not x = ${-wrongRoot}.`,
    `Similarly f(${otherRoot}) = ${otherValue.num.toString()}, so ${renderLinearFactor(fromInt(otherRoot))} is out too. A number dividing the constant term is only a *candidate* root — it still has to be tested.`,
    `So the factor is ${factor}. If you wanted the other two, you could now divide f(x) by ${factor} and factor the quadratic that comes out.`,
  ];
}

function drawParams(rng: Rng): VerifyFactorParams {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const roots: number[] = [];
    while (roots.length < 3) {
      const candidate = rng.nonZeroInt(-ROOT_BOUND, ROOT_BOUND);
      if (!roots.includes(candidate)) roots.push(candidate);
    }
    const answerIndex = rng.int(0, 2);
    const answer = roots[answerIndex];

    // Candidate roots a student might pick from the constant term: its divisors.
    const constant = polyFromRoots(roots.map((root) => fromInt(root)))[0];
    const divisors = integerDivisors(constant.num).map(Number);
    const signedDivisors = divisors.flatMap((d) => [d, -d]);
    const divisorPool = signedDivisors.filter(
      (d) => d !== 0 && !roots.includes(d) && d !== -answer,
    );

    // Numbers visible in the printed polynomial, which students lift directly.
    const expanded = polyFromRoots(roots.map((root) => fromInt(root)));
    const visible = expanded.map((c) => Number(c.num));
    const coefficientPool = visible.filter(
      (n) => n !== 0 && !roots.includes(n) && n !== -answer,
    );

    if (divisorPool.length === 0 || coefficientPool.length === 0) continue;

    const params: VerifyFactorParams = {
      roots,
      answerIndex,
      divisorDistractor: rng.pick(divisorPool),
      coefficientDistractor: rng.pick(coefficientPool),
    };
    if (isUsable(params)) return params;
  }
  return FALLBACK_PARAMS;
}

export const factorTheoremVerifyFactor: Generator = {
  id: GENERATOR_ID,
  unitId: UNIT_ID,
  problemTypeId: PROBLEM_TYPE_ID,
  difficulty: 1,
  strategies: STRATEGIES,

  generate(seed: number): QuestionInstance {
    const rng = createRng(seed);
    const params = drawParams(rng);
    const correctFactor = renderLinearFactor(fromInt(answerRoot(params)));

    const choices: Choice[] = [
      {
        latex: correctFactor,
        isCorrect: true,
        // opaque: a binomial is not in the numeric union. The canonical factor
        // string is its identity; the root is its approximation.
        value: qOpaque(correctFactor, answerRoot(params)),
      },
      ...buildDistractors(params).map((distractor) => {
        const rendered = renderLinearFactor(fromInt(distractor.root));
        return {
          latex: rendered,
          isCorrect: false,
          strategyId: distractor.strategyId,
          value: qOpaque(rendered, distractor.root),
        };
      }),
    ];

    const phrasing = rng.pick(PHRASINGS);

    return {
      generatorId: GENERATOR_ID,
      seed,
      unitId: UNIT_ID,
      problemTypeId: PROBLEM_TYPE_ID,
      difficulty: 1,
      stem: phrasing(renderPoly(buildPolynomial(params))),
      choices: rng.shuffle(choices),
      solution: buildSolution(params),
      conceptTag: 'Factor theorem: (x - r) is a factor of f(x) exactly when f(r) = 0',
    };
  },
};

export const __testing = { buildDistractors, buildPolynomial, drawParams, isRoot, PHRASINGS };
