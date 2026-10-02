/**
 * MHF4U Unit 3 — find the unknown constant `k` given a known factor.
 *
 * **This is the reference generator. Copy this file to start a new one.**
 * It is written to be imitated rather than to be clever: the structure below
 * (constants, parameter draw with a rejection loop, exact arithmetic, named
 * distractors, tutor-voice solution, shuffle) is the shape every generator in
 * this codebase should have. See HANDOFF.md, "How to add a new generator".
 *
 * The question: `f(x) = x^3 + ax^2 + bx + k` has `(x - r)` as a known factor.
 * Find `k`.
 *
 * The mathematics: a factor `(x - r)` means `f(r) = 0` (the factor theorem).
 * Writing `P(r) = r^3 + ar^2 + br` for everything except the constant term,
 * `f(r) = P(r) + k = 0`, so `k = -P(r)`. Because `r`, `a`, and `b` are integers,
 * `k` is always a clean integer — no generated question ever asks a student to
 * report a fraction here.
 */

import { createRng } from '../../rng.ts';
import {
  type Rational,
  add,
  fromInt,
  isZero,
  mul,
  neg,
  pow,
  toLatex,
} from '../../rational.ts';
import { areEquivalent, isTriviallyDistinguishable } from '../../equivalence.ts';
import { qRational } from '../../value.ts';
import type { Choice, DistractorStrategy, Generator, QuestionInstance } from '../../types.ts';

/**
 * Stable ids. Permanent once shipped — stored student attempts reference them.
 *
 * `PROBLEM_TYPE_ID` must match a `ProblemType.id` in `taxonomy/mhf4u.ts`, or
 * the coverage report will show this slot as an uncovered gap. `GENERATOR_ID`
 * carries a `-d<difficulty>` suffix on top of it, because one problem type
 * spans several difficulty tiers and each tier needs its own generator.
 */
const PROBLEM_TYPE_ID = 'mhf4u-u3-factor-theorem-find-k';
const GENERATOR_ID = `${PROBLEM_TYPE_ID}-d2`;
const UNIT_ID = 'mhf4u-u3-polynomial-equations';

/**
 * The root `r` of the known factor. Bounded so `r^3` stays small enough that a
 * student can evaluate it mentally, and non-zero so `(x - 0) = x` never appears
 * (which would make the question trivial — `k` would just be the constant term).
 */
const ROOT_BOUND = 4;

/**
 * Bounds on the `x^2` and `x` coefficients. Wide enough that 500 seeds do not
 * exhaust the parameter space and start repeating stems — see the variety check
 * in `verify.ts`.
 */
const COEFFICIENT_BOUND = 7;

/**
 * How many parameter draws to try before falling back.
 *
 * The rejection loop below discards tuples whose distractors collide or are
 * eliminable. Rejection is rare, so 40 is generous; the fallback exists only so
 * that `generate` is total, as `types.ts` requires.
 */
const MAX_DRAWS = 40;

/**
 * A parameter tuple known to satisfy every constraint, used if the rejection
 * loop somehow exhausts its draws.
 *
 * `generate` must never throw for any seed, so there has to be an answer even in
 * the impossible case. A test asserts `isUsable(FALLBACK_PARAMS)`, so this
 * cannot rot silently — and it earned that test: the first tuple written here
 * had `b = -r^2`, which makes `sign_error_on_root` collide with the correct
 * answer, and only the test caught it.
 *
 * r = 2, a = 3, b = -7: P(2) = 8 + 12 - 14 = 6, so k = -6.
 */
export const FALLBACK_PARAMS: PolynomialParams = { r: 2, a: 3, b: -7 };

/** The three coefficients that define one instance of this question. */
export interface PolynomialParams {
  /** Root of the known factor `(x - r)`. Never zero. */
  r: number;
  /** Coefficient of `x^2`. Never zero, so the cubic does not collapse. */
  a: number;
  /** Coefficient of `x`. Never zero, so the linear term is really there. */
  b: number;
}

/**
 * The misconceptions this generator expresses. Each one is implemented below in
 * `buildDistractors`; `verify.ts` fails the generator if any is never produced.
 */
const STRATEGIES: DistractorStrategy[] = [
  {
    id: 'sign_error_on_root',
    label: 'Substituted x = -r instead of x = r',
  },
  {
    id: 'arithmetic_sign_slip',
    label: 'Right method, one sign dropped while evaluating',
  },
  {
    id: 'solved_for_wrong_variable',
    label: 'Reported P(r) instead of k, forgetting to move it across the equals sign',
  },
];

/**
 * `P(x) = x^3 + ax^2 + bx` — the polynomial without its constant term.
 *
 * Exact, via `Rational`, even though every value here is an integer. Generators
 * that later deal in fractions inherit this shape unchanged, and nothing in this
 * codebase should model a habit of reaching for floating point.
 */
function evaluateWithoutConstant(x: number, params: PolynomialParams): Rational {
  const xr = fromInt(x);
  return add(
    add(pow(xr, 3), mul(fromInt(params.a), pow(xr, 2))),
    mul(fromInt(params.b), xr),
  );
}

/** The correct answer: `k = -P(r)`. */
function solveForK(params: PolynomialParams): Rational {
  return neg(evaluateWithoutConstant(params.r, params));
}

/** One candidate wrong answer with the misconception that produced it. */
interface Distractor {
  strategyId: string;
  value: Rational;
}

/**
 * Every wrong answer this generator can produce, in strategy order.
 *
 * Each is the value a student *actually arrives at* by making one specific,
 * nameable mistake — not a random number near the answer. That is the whole
 * point of the harness: a distractor nobody would pick teaches nothing.
 */
function buildDistractors(params: PolynomialParams): Distractor[] {
  const { r, a, b } = params;
  return [
    {
      // Substituted the factor's sign rather than its root: used x = -r.
      strategyId: 'sign_error_on_root',
      value: neg(evaluateWithoutConstant(-r, params)),
    },
    {
      // Right method, but dropped the sign on the bx term while evaluating.
      strategyId: 'arithmetic_sign_slip',
      value: neg(evaluateWithoutConstant(r, { r, a, b: -b })),
    },
    {
      // Computed P(r) correctly, then wrote k = P(r) instead of k = -P(r).
      strategyId: 'solved_for_wrong_variable',
      value: evaluateWithoutConstant(r, params),
    },
  ];
}

/**
 * Whether a parameter tuple yields a question worth printing.
 *
 * Rejects tuples where two options coincide (the paper would show fewer than
 * four real choices) or where a distractor is eliminable without doing the
 * mathematics. Checking here rather than leaving it to `validate.ts` means a bad
 * tuple is never emitted at all, instead of being emitted and then reported.
 */
function isUsable(params: PolynomialParams): boolean {
  const k = solveForK(params);
  // k = 0 would mean x itself divides f, and would put a bare 0 on the paper.
  if (isZero(k)) return false;

  const distractors = buildDistractors(params);
  if (distractors.some((d) => isZero(d.value))) return false;

  const values = [k, ...distractors.map((d) => d.value)];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (areEquivalent(values[i], values[j])) return false;
    }
  }
  return !distractors.some((d) => isTriviallyDistinguishable(k, d.value));
}

/**
 * Renders one term of the polynomial with its sign, e.g. `" - 5x"`, `" + x^2"`.
 *
 * Coefficients of 1 and -1 print bare, because `1x^2` is not how anyone writes
 * it and a student who sees it reads the question as machine-made.
 */
function renderTerm(coefficient: number, variablePart: string): string {
  const sign = coefficient < 0 ? '-' : '+';
  const magnitude = Math.abs(coefficient);
  const shown = magnitude === 1 ? '' : String(magnitude);
  return ` ${sign} ${shown}${variablePart}`;
}

/** `f(x) = x^3 + ax^2 + bx + k`, with signs and unit coefficients set properly. */
function renderPolynomial(params: PolynomialParams): string {
  return `x^3${renderTerm(params.a, 'x^2')}${renderTerm(params.b, 'x')} + k`;
}

/** `(x - r)`, folding the sign so a negative root prints as `(x + 3)`. */
function renderFactor(r: number): string {
  return r < 0 ? `(x + ${Math.abs(r)})` : `(x - ${r})`;
}

/**
 * Stem phrasings.
 *
 * More than one because the variety check counts *distinct stems*: a generator
 * whose parameter space is small enough to repeat within 500 seeds will show a
 * student the same question twice. Varying the wording multiplies the space at
 * no mathematical cost.
 */
const PHRASINGS: ((polynomial: string, factor: string) => string)[] = [
  (polynomial, factor) =>
    `The polynomial f(x) = ${polynomial} has ${factor} as a factor. Find the value of k.`,
  (polynomial, factor) =>
    `Given that ${factor} divides f(x) = ${polynomial} exactly, determine k.`,
  (polynomial, factor) =>
    `Find k so that ${factor} is a factor of f(x) = ${polynomial}.`,
];

/**
 * The worked solution, written the way a tutor says it out loud.
 *
 * Each step states *why* before *what*. A student reading only the algebra
 * learns to imitate; a student reading the reason learns to choose the method
 * next time. Copy this register in new generators — it is the deliverable, not
 * decoration.
 */
function buildSolution(params: PolynomialParams, k: Rational): string[] {
  const { r, a, b } = params;
  const factor = renderFactor(r);
  const pOfR = evaluateWithoutConstant(r, params);
  const cube = pow(fromInt(r), 3);
  const square = mul(fromInt(a), pow(fromInt(r), 2));
  const linear = mul(fromInt(b), fromInt(r));

  return [
    `Start with what the word "factor" buys you. If ${factor} is a factor of f(x), then x = ${r} is a root, so f(${r}) = 0. That is the factor theorem, and it is the whole question — everything after this is arithmetic.`,
    `So substitute x = ${r} into f(x) = ${renderPolynomial(params)} and set the result equal to zero: (${r})^3 + (${a})(${r})^2 + (${b})(${r}) + k = 0.`,
    `Work the three known terms one at a time. (${r})^3 = ${toLatex(cube)}. Then (${a})(${r})^2 = ${toLatex(square)}. And (${b})(${r}) = ${toLatex(linear)}.`,
    `Add those up: ${toLatex(cube)} + ${toLatex(square)} + ${toLatex(linear)} = ${toLatex(pOfR)}. So the equation is now ${toLatex(pOfR)} + k = 0.`,
    `Move it across: k = ${toLatex(neg(pOfR))}, so k = ${toLatex(k)}. Check it back — that is the value that makes f(${r}) come out to exactly zero, which is what having ${factor} as a factor means.`,
  ];
}

/**
 * Draws a usable parameter tuple from `rng`.
 *
 * Rejection-samples rather than trying to characterise the usable region
 * algebraically: the constraints come from `isUsable`, so they stay correct when
 * a heuristic in `equivalence.ts` is retuned. Falls back to `FALLBACK_PARAMS`
 * rather than throwing, because `generate` is required to be total.
 */
function drawParams(rng: ReturnType<typeof createRng>): PolynomialParams {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const params: PolynomialParams = {
      r: rng.nonZeroInt(-ROOT_BOUND, ROOT_BOUND),
      a: rng.nonZeroInt(-COEFFICIENT_BOUND, COEFFICIENT_BOUND),
      b: rng.nonZeroInt(-COEFFICIENT_BOUND, COEFFICIENT_BOUND),
    };
    if (isUsable(params)) return params;
  }
  return FALLBACK_PARAMS;
}

/**
 * The generator itself.
 *
 * Registered in `lib/questions/generators/index.ts`. Pure: the only source of
 * variation is `createRng(seed)`, so `generate(n)` is the same instance forever.
 */
export const factorTheoremFindK: Generator = {
  id: GENERATOR_ID,
  unitId: UNIT_ID,
  problemTypeId: PROBLEM_TYPE_ID,
  difficulty: 2,
  strategies: STRATEGIES,

  generate(seed: number): QuestionInstance {
    const rng = createRng(seed);
    const params = drawParams(rng);
    const k = solveForK(params);

    // Every choice carries both its rendering and the exact value it stands
    // for. The value is what distinctness checking runs on; the latex is only
    // what a student reads. Every generator must supply both.
    const choices: Choice[] = [
      { latex: toLatex(k), isCorrect: true, value: qRational(k) },
      ...buildDistractors(params).map((distractor) => ({
        latex: toLatex(distractor.value),
        isCorrect: false,
        strategyId: distractor.strategyId,
        value: qRational(distractor.value),
      })),
    ];

    const phrasing = rng.pick(PHRASINGS);

    return {
      generatorId: GENERATOR_ID,
      seed,
      unitId: UNIT_ID,
      problemTypeId: PROBLEM_TYPE_ID,
      difficulty: 2,
      stem: phrasing(renderPolynomial(params), renderFactor(params.r)),
      // Shuffled here, through the seeded rng, so the answer position varies
      // across seeds but stays reproducible for any single seed.
      choices: rng.shuffle(choices),
      solution: buildSolution(params, k),
      conceptTag: 'Factor theorem: if (x - r) is a factor of f(x), then f(r) = 0',
    };
  },
};

/** Internals exposed for testing only. Not part of the generator contract. */
export const __testing = {
  buildDistractors,
  drawParams,
  evaluateWithoutConstant,
  isUsable,
  renderFactor,
  renderPolynomial,
  renderTerm,
  solveForK,
  PHRASINGS,
};
