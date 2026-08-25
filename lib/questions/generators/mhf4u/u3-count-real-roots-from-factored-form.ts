/**
 * MHF4U Unit 3 — how many distinct real roots?
 *
 * The polynomial is handed over already factored, so no algebra is needed. The
 * question is whether the student can read a factored form correctly, and it
 * separates three things students routinely conflate:
 *
 * - a repeated factor `(x - r)^3` is **one** root, not three
 * - an irreducible quadratic like `x^2 + 4` contributes **no** real roots
 * - the number of *factors* is not the number of *roots*
 *
 * Each of those is a distractor.
 */

import { createRng, type Rng } from '../../rng.ts';
import { qInt, toLatex as valueToLatex } from '../../value.ts';
import { strategiesFor } from '../../strategies.ts';
import { fromInt } from '../../rational.ts';
import { renderLinearFactor, renderPower } from '../shared/polynomial.ts';
import type { Choice, Generator, QuestionInstance } from '../../types.ts';

const PROBLEM_TYPE_ID = 'mhf4u-u3-count-real-roots-from-factored-form';
const GENERATOR_ID = `${PROBLEM_TYPE_ID}-d2`;
const UNIT_ID = 'mhf4u-u3-polynomial-equations';

const ROOT_BOUND = 5;
const MAX_MULTIPLICITY = 3;
const MAX_DRAWS = 80;

/** One linear factor and how many times it appears. */
export interface LinearFactorSpec {
  root: number;
  multiplicity: number;
}

/** One instance. */
export interface CountRootsParams {
  /** Distinct linear factors with their multiplicities. */
  factors: LinearFactorSpec[];
  /**
   * Constant of the irreducible quadratic `x^2 + c`, always positive so it has
   * no real roots. Present on every instance — without it the
   * `counted_factors_not_roots` distractor equals the correct answer.
   */
  irreducibleConstant: number;
}

/** (x - 1)^3 (x + 2)^2 (x - 4)(x^2 + 4): 3 distinct real roots. */
export const FALLBACK_PARAMS: CountRootsParams = {
  factors: [
    { root: 1, multiplicity: 3 },
    { root: -2, multiplicity: 2 },
    { root: 4, multiplicity: 1 },
  ],
  irreducibleConstant: 4,
};

/**
 * The misconceptions this generator expresses, from the shared registry in
 * `strategies.ts`. Declaring ids inline would let the same mistake acquire a
 * different name in every unit, which fragments per-misconception reporting.
 */
const STRATEGIES = strategiesFor(
  'counted_multiplicity_as_separate_roots',
  'counted_irreducible_quadratic_as_real_roots',
  'counted_factors_not_roots',
);

/** The correct answer: distinct linear factors each give exactly one real root. */
export function countDistinctRealRoots(params: CountRootsParams): number {
  return params.factors.length;
}

/** Total degree contributed by the linear factors, i.e. roots with multiplicity. */
function totalMultiplicity(params: CountRootsParams): number {
  return params.factors.reduce((sum, factor) => sum + factor.multiplicity, 0);
}

interface Distractor {
  strategyId: string;
  count: number;
}

function buildDistractors(params: CountRootsParams): Distractor[] {
  const distinct = countDistinctRealRoots(params);
  return [
    {
      // Read (x - 1)^3 as three roots.
      strategyId: 'counted_multiplicity_as_separate_roots',
      count: totalMultiplicity(params),
    },
    {
      // Treated x^2 + c as though it factored over the reals.
      strategyId: 'counted_irreducible_quadratic_as_real_roots',
      count: distinct + 2,
    },
    {
      // Counted the bracket blocks on the page.
      strategyId: 'counted_factors_not_roots',
      count: distinct + 1,
    },
  ];
}

export function isUsable(params: CountRootsParams): boolean {
  const roots = params.factors.map((factor) => factor.root);
  if (roots.some((root) => root === 0)) return false;
  if (new Set(roots).size !== roots.length) return false;
  if (params.factors.length < 2) return false;
  if (params.irreducibleConstant <= 0) return false;
  if (params.factors.some((f) => f.multiplicity < 1 || f.multiplicity > MAX_MULTIPLICITY)) {
    return false;
  }

  const counts = [countDistinctRealRoots(params), ...buildDistractors(params).map((d) => d.count)];
  if (counts.some((count) => count <= 0)) return false;
  return new Set(counts).size === 4;
}

/** `(x - r)`, or `(x - r)^n` when repeated. */
function renderFactor(spec: LinearFactorSpec): string {
  const base = renderLinearFactor(fromInt(spec.root));
  return spec.multiplicity === 1 ? base : `${base}^${spec.multiplicity}`;
}

/** The whole factored polynomial, linear factors then the irreducible quadratic. */
export function renderFactoredPolynomial(params: CountRootsParams): string {
  const linear = params.factors.map(renderFactor).join('');
  return `${linear}(${renderPower('x', 2)} + ${params.irreducibleConstant})`;
}

const PHRASINGS: ((polynomial: string) => string)[] = [
  (polynomial) => `How many distinct real roots does f(x) = ${polynomial} have?`,
  (polynomial) =>
    `The polynomial f(x) = ${polynomial} is already factored. How many different real values of x make f(x) = 0?`,
  (polynomial) => `Determine the number of distinct real zeros of f(x) = ${polynomial}.`,
];

function buildSolution(params: CountRootsParams): string[] {
  const distinct = countDistinctRealRoots(params);
  const repeated = params.factors.filter((factor) => factor.multiplicity > 1);
  const rootList = params.factors.map((factor) => `x = ${factor.root}`).join(', ');

  const steps = [
    `Everything you need is already on the page — do not expand anything. A product is zero when one of its factors is zero, so go through the factors one at a time and ask which ones can be zero for a real x.`,
    `The linear factors give the roots ${rootList}. That is ${distinct} different value${distinct === 1 ? '' : 's'} of x.`,
  ];

  if (repeated.length > 0) {
    const example = repeated[0];
    steps.push(
      `Watch the exponents. ${renderFactor(example)} is one root repeated ${example.multiplicity} times, not ${example.multiplicity} separate roots — the question asks how many *distinct* roots there are, and x = ${example.root} is a single value however many times the bracket appears.`,
    );
  }

  steps.push(
    `Now the quadratic. x^2 + ${params.irreducibleConstant} = 0 would need x^2 = -${params.irreducibleConstant}, and no real number squares to a negative. So that factor contributes no real roots at all — it never touches the x-axis.`,
    `So the count is ${distinct}. The degree is higher than that, and there are more factors than that, but neither of those is what was asked.`,
  );
  return steps;
}

function drawParams(rng: Rng): CountRootsParams {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const count = rng.int(2, 4);
    const roots: number[] = [];
    while (roots.length < count) {
      const candidate = rng.nonZeroInt(-ROOT_BOUND, ROOT_BOUND);
      if (!roots.includes(candidate)) roots.push(candidate);
    }
    const factors = roots.map((root) => ({
      root,
      multiplicity: rng.int(1, MAX_MULTIPLICITY),
    }));
    const params: CountRootsParams = {
      factors,
      irreducibleConstant: rng.int(1, 9),
    };
    if (isUsable(params)) return params;
  }
  return FALLBACK_PARAMS;
}

export const countRealRootsFromFactoredForm: Generator = {
  id: GENERATOR_ID,
  unitId: UNIT_ID,
  problemTypeId: PROBLEM_TYPE_ID,
  difficulty: 2,
  strategies: STRATEGIES,

  generate(seed: number): QuestionInstance {
    const rng = createRng(seed);
    const params = drawParams(rng);
    const answer = qInt(countDistinctRealRoots(params));

    const choices: Choice[] = [
      { latex: valueToLatex(answer), isCorrect: true, value: answer },
      ...buildDistractors(params).map((distractor) => {
        const value = qInt(distractor.count);
        return {
          latex: valueToLatex(value),
          isCorrect: false,
          strategyId: distractor.strategyId,
          value,
        };
      }),
    ];

    const phrasing = rng.pick(PHRASINGS);

    return {
      generatorId: GENERATOR_ID,
      seed,
      unitId: UNIT_ID,
      problemTypeId: PROBLEM_TYPE_ID,
      difficulty: 2,
      stem: phrasing(renderFactoredPolynomial(params)),
      choices: rng.shuffle(choices),
      solution: buildSolution(params),
      conceptTag:
        'Reading a factored form: multiplicity does not add roots, and an irreducible quadratic contributes none',
    };
  },
};

export const __testing = { buildDistractors, drawParams, renderFactor, totalMultiplicity, PHRASINGS };
