/**
 * MHF4U Unit 3 — solve a factored polynomial inequality by sign analysis.
 *
 * The polynomial arrives already factored, so the work is entirely about signs:
 * find where each factor changes sign, build the interval table, and read off
 * the intervals that satisfy the inequality. The answer is stated in interval
 * notation — no number line graphic, which keeps this generator inside the
 * "algebraic only" boundary.
 *
 * The three distractors are the three things that actually go wrong:
 * - the complement, from solving for the wrong sign
 * - the right intervals with the wrong bracket type, from ignoring whether the
 *   inequality is strict
 * - a single interval between the outer roots, from carrying quadratic habits
 *   into a cubic
 */

import { createRng, type Rng } from '../../rng.ts';
import { fromInt } from '../../rational.ts';
import { qOpaque } from '../../value.ts';
import { strategiesFor } from '../../strategies.ts';
import { renderFactoredForm } from '../shared/polynomial.ts';
import type { Choice, Generator, QuestionInstance } from '../../types.ts';

const PROBLEM_TYPE_ID = 'mhf4u-u3-solve-polynomial-inequality-factored';
const GENERATOR_ID = `${PROBLEM_TYPE_ID}-d2`;
const UNIT_ID = 'mhf4u-u3-polynomial-equations';

const ROOT_BOUND = 6;
const MAX_DRAWS = 80;

/** The four inequality directions a question can ask for. */
export type Direction = 'lt' | 'le' | 'gt' | 'ge';

/** How each direction is written in the stem. */
const DIRECTION_LATEX: Record<Direction, string> = {
  lt: '< 0',
  le: '\\le 0',
  gt: '> 0',
  ge: '\\ge 0',
};

/** Whether the direction includes the roots themselves. */
function isInclusive(direction: Direction): boolean {
  return direction === 'le' || direction === 'ge';
}

/** Whether the direction asks where the polynomial is negative. */
function wantsNegative(direction: Direction): boolean {
  return direction === 'lt' || direction === 'le';
}

/** The opposite direction, keeping strictness. */
function flipDirection(direction: Direction): Direction {
  switch (direction) {
    case 'lt':
      return 'gt';
    case 'gt':
      return 'lt';
    case 'le':
      return 'ge';
    case 'ge':
      return 'le';
  }
}

/** One instance: three roots in ascending order, and which way the inequality points. */
export interface InequalityParams {
  /** Strictly ascending, so the sign chart is unambiguous. */
  roots: [number, number, number];
  direction: Direction;
}

/** (x + 2)(x - 1)(x - 3) <= 0. */
export const FALLBACK_PARAMS: InequalityParams = { roots: [-2, 1, 3], direction: 'le' };

/**
 * The misconceptions this generator expresses, from the shared registry in
 * `strategies.ts`. Declaring ids inline would let the same mistake acquire a
 * different name in every unit, which fragments per-misconception reporting.
 */
const STRATEGIES = strategiesFor(
  'solved_for_the_opposite_sign',
  'wrong_bracket_type_on_endpoints',
  'treated_cubic_like_a_quadratic',
);

/** `-\infty` and `\infty` bounds render specially; finite ones are plain integers. */
function renderInterval(
  low: number | null,
  high: number | null,
  inclusive: boolean,
): string {
  // An infinite endpoint is always open, however strict the inequality is.
  const openLow = low === null;
  const openHigh = high === null;
  const leftBracket = openLow || !inclusive ? '(' : '[';
  const rightBracket = openHigh || !inclusive ? ')' : ']';
  const leftValue = openLow ? '-\\infty' : String(low);
  const rightValue = openHigh ? '\\infty' : String(high);
  return `${leftBracket}${leftValue}, ${rightValue}${rightBracket}`;
}

/**
 * The solution intervals for a monic cubic with three simple roots.
 *
 * Sign chart for `(x - r1)(x - r2)(x - r3)` with `r1 < r2 < r3`: negative below
 * `r1`, positive between `r1` and `r2`, negative between `r2` and `r3`, positive
 * above `r3`.
 */
export function solveIntervals(params: InequalityParams, direction = params.direction): string {
  const [r1, r2, r3] = params.roots;
  const inclusive = isInclusive(direction);
  if (wantsNegative(direction)) {
    return `${renderInterval(null, r1, inclusive)} \\cup ${renderInterval(r2, r3, inclusive)}`;
  }
  return `${renderInterval(r1, r2, inclusive)} \\cup ${renderInterval(r3, null, inclusive)}`;
}

interface Distractor {
  strategyId: string;
  latex: string;
}

function buildDistractors(params: InequalityParams): Distractor[] {
  const [r1, , r3] = params.roots;
  const inclusive = isInclusive(params.direction);
  return [
    {
      // Built the chart correctly, then read the wrong rows.
      strategyId: 'solved_for_the_opposite_sign',
      latex: solveIntervals(params, flipDirection(params.direction)),
    },
    {
      // Right rows, but ignored whether the endpoints are included.
      strategyId: 'wrong_bracket_type_on_endpoints',
      latex: solveIntervals({ ...params, direction: params.direction }, toggleStrictness(params.direction)),
    },
    {
      // A quadratic inequality has one interval between its roots; a cubic does
      // not, and this is the student who has not noticed.
      strategyId: 'treated_cubic_like_a_quadratic',
      latex: renderInterval(r1, r3, inclusive),
    },
  ];
}

/** Same sign, opposite strictness — the bracket-type mistake. */
function toggleStrictness(direction: Direction): Direction {
  switch (direction) {
    case 'lt':
      return 'le';
    case 'le':
      return 'lt';
    case 'gt':
      return 'ge';
    case 'ge':
      return 'gt';
  }
}

export function isUsable(params: InequalityParams): boolean {
  const [r1, r2, r3] = params.roots;
  if (!(r1 < r2 && r2 < r3)) return false;
  if (new Set(params.roots).size !== 3) return false;

  const rendered = [solveIntervals(params), ...buildDistractors(params).map((d) => d.latex)];
  return new Set(rendered).size === 4;
}

const PHRASINGS: ((polynomial: string, direction: string) => string)[] = [
  (polynomial, direction) =>
    `Solve ${polynomial} ${direction}. Give your answer in interval notation.`,
  (polynomial, direction) =>
    `For which values of x is ${polynomial} ${direction}? State the solution in interval notation.`,
  (polynomial, direction) =>
    `Use a sign chart to solve ${polynomial} ${direction}, and write the solution set in interval notation.`,
];

function buildSolution(params: InequalityParams): string[] {
  const [r1, r2, r3] = params.roots;
  const polynomial = renderFactoredForm(params.roots.map((root) => fromInt(root)));
  const inclusive = isInclusive(params.direction);
  const negative = wantsNegative(params.direction);
  const answer = solveIntervals(params);

  return [
    `An inequality like this is a sign question, not a solving question. The factors are already there, so the first job is to find where the whole product can change sign — and that only happens where a factor is zero, at x = ${r1}, x = ${r2} and x = ${r3}.`,
    `Those three values cut the number line into four stretches: below ${r1}, between ${r1} and ${r2}, between ${r2} and ${r3}, and above ${r3}. Inside each stretch the sign of ${polynomial} cannot change, so testing one convenient number in each is enough.`,
    `Doing that gives negative, then positive, then negative, then positive, reading left to right. That alternation is what you should expect: each factor is simple, so the product flips sign at every root.`,
    `You want where the product is ${negative ? 'negative' : 'positive'}, so take the ${negative ? 'first and third' : 'second and fourth'} stretches.`,
    `Last, decide the brackets. The inequality is ${inclusive ? 'inclusive, so the roots themselves satisfy it and the finite endpoints get square brackets' : 'strict, so the roots make the product exactly zero and are excluded, which means round brackets'}. Either way infinity always gets a round bracket, because you never reach it.`,
    `So the solution is ${answer}.`,
  ];
}

function drawParams(rng: Rng): InequalityParams {
  const directions: Direction[] = ['lt', 'le', 'gt', 'ge'];
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const roots: number[] = [];
    while (roots.length < 3) {
      const candidate = rng.int(-ROOT_BOUND, ROOT_BOUND);
      if (!roots.includes(candidate)) roots.push(candidate);
    }
    roots.sort((a, b) => a - b);
    const params: InequalityParams = {
      roots: [roots[0], roots[1], roots[2]],
      direction: rng.pick(directions),
    };
    if (isUsable(params)) return params;
  }
  return FALLBACK_PARAMS;
}

export const solvePolynomialInequalityFactored: Generator = {
  id: GENERATOR_ID,
  unitId: UNIT_ID,
  problemTypeId: PROBLEM_TYPE_ID,
  difficulty: 2,
  strategies: STRATEGIES,

  generate(seed: number): QuestionInstance {
    const rng = createRng(seed);
    const params = drawParams(rng);
    const answer = solveIntervals(params);

    const choices: Choice[] = [
      { latex: answer, isCorrect: true, value: qOpaque(answer, params.roots[0]) },
      ...buildDistractors(params).map((distractor, index) => ({
        latex: distractor.latex,
        isCorrect: false,
        strategyId: distractor.strategyId,
        // Interval notation is not in the numeric union, so the canonical
        // string is the identity; the offset keeps approximations distinct.
        value: qOpaque(distractor.latex, params.roots[0] + index + 1),
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
        renderFactoredForm(params.roots.map((root) => fromInt(root))),
        DIRECTION_LATEX[params.direction],
      ),
      choices: rng.shuffle(choices),
      solution: buildSolution(params),
      conceptTag:
        'Polynomial inequalities: the sign can only change at a root, so test one point per interval',
    };
  },
};

export const __testing = {
  buildDistractors,
  drawParams,
  flipDirection,
  renderInterval,
  toggleStrictness,
  DIRECTION_LATEX,
  PHRASINGS,
};
