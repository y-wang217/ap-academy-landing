/**
 * MHF4U Unit 7 — solve a logarithmic equation with an extraneous root.
 *
 * `log_b(x + p) + log_b(x + q) = r`. Combine the logs, convert to exponential
 * form, solve the quadratic — and then check both roots against the domain,
 * because a logarithm's argument must be strictly positive. One of the two roots
 * always fails that check.
 *
 * **This is the question this unit exists for.** The algebra is routine; the
 * lesson is entirely in the last step. A student who skips it gets a
 * mathematically correct quadratic solution and a wrong answer, and no amount of
 * checking their algebra will show them why. So the primary distractor here is
 * *both roots* — the answer of someone who did everything right except the one
 * thing the question is about.
 *
 * Usable `(b, r, p, q)` tuples are enumerated once at module load — only those
 * where the quadratic has two distinct integer roots and **exactly one** of them
 * survives the domain check. Testing forwards is safer than solving backwards:
 * the domain condition depends on both `p` and `q`, and it is easy to derive a
 * tuple where both roots are valid and the question has no extraneous root at
 * all.
 */

import { createRng, type Rng } from '../../rng.ts';
import {
  type Rational,
  equals,
  fromFraction,
  fromInt,
  isZero,
  toLatex as rationalToLatex,
} from '../../rational.ts';
import { isTriviallyDistinguishable } from '../../equivalence.ts';
import { qInt, qRational, qSet, toLatex as valueToLatex, type QValue } from '../../value.ts';
import { strategiesFor } from '../../strategies.ts';
import type { Choice, Generator, QuestionInstance } from '../../types.ts';

const PROBLEM_TYPE_ID = 'mhf4u-u7-solve-log-equation-multiple-logs';
const GENERATOR_ID = `${PROBLEM_TYPE_ID}-d3`;
const UNIT_ID = 'mhf4u-u7-exponential-logarithmic';

/** Bases a Grade 12 student meets. */
const BASES = [2, 3, 5, 10];

/**
 * Largest exponent per base, so `b^r` stays a number a student can work with.
 *
 * Per-base rather than a flat cap: `2^6 = 64` is reasonable while `10^6` is not,
 * and holding every base to the smallest sensible exponent would throw away most
 * of the usable parameter space.
 */
const MAX_EXPONENT: Record<number, number> = { 2: 6, 3: 4, 5: 3, 10: 2 };

/** Bound on the constants inside the logarithms. */
const SHIFT_BOUND = 20;

/**
 * The misconceptions this generator expresses, from the shared registry in
 * `strategies.ts`.
 */
const STRATEGIES = strategiesFor(
  'dropped_extraneous_root_check',
  'applied_log_law_to_sum_of_args',
  'reported_extraneous_root_only',
);

/** One instance. */
export interface LogEquationParams {
  /** Base of both logarithms. */
  base: number;
  /** Right-hand side, so the combined argument equals `base ** exponent`. */
  exponent: number;
  /** Constant inside the first logarithm. */
  p: number;
  /** Constant inside the second logarithm. */
  q: number;
}

/**
 * A worked example, asserted usable by a test.
 *
 * log_2(x + 3) + log_2(x - 1) = 5 gives (x+3)(x-1) = 32, so x^2 + 2x - 35 = 0,
 * roots x = 5 and x = -7. At x = -7 both arguments are negative, so x = 5 is the
 * only solution. Not a fallback — the enumeration below cannot come up empty.
 */
export const WORKED_EXAMPLE: LogEquationParams = { base: 2, exponent: 5, p: 3, q: -1 };

/** `base ** exponent`, the value the combined argument must reach. */
export function targetValue(params: LogEquationParams): number {
  return params.base ** params.exponent;
}

/**
 * Both roots of `(x + p)(x + q) = base^exponent`, or `null` when they are not
 * distinct integers.
 *
 * Expanding gives `x^2 + (p + q)x + (pq - M) = 0`, whose discriminant is
 * `(p - q)^2 + 4M`. That is positive for every `M > 0`, so there are always two
 * distinct real roots; the question is only whether they are integers.
 */
export function rootsOf(params: LogEquationParams): [number, number] | null {
  const { p, q } = params;
  const discriminant = (p - q) ** 2 + 4 * targetValue(params);
  const root = Math.round(Math.sqrt(discriminant));
  if (root * root !== discriminant) return null;
  const sum = -(p + q);
  // Both roots must come out whole, not just the square root.
  if ((sum + root) % 2 !== 0 || (sum - root) % 2 !== 0) return null;
  const first = (sum + root) / 2;
  const second = (sum - root) / 2;
  return first === second ? null : [first, second];
}

/** Whether `x` keeps both logarithm arguments strictly positive. */
export function isInDomain(params: LogEquationParams, x: number): boolean {
  return x + params.p > 0 && x + params.q > 0;
}

/** The root that survives the domain check, or `null` when the tuple is unusable. */
export function solveValidRoot(params: LogEquationParams): number | null {
  const roots = rootsOf(params);
  if (roots === null) return null;
  const valid = roots.filter((root) => isInDomain(params, root));
  return valid.length === 1 ? valid[0] : null;
}

/** The root that fails the domain check. */
export function extraneousRoot(params: LogEquationParams): number | null {
  const roots = rootsOf(params);
  if (roots === null) return null;
  const rejected = roots.filter((root) => !isInDomain(params, root));
  return rejected.length === 1 ? rejected[0] : null;
}

/**
 * What a student gets by reading `log A + log B` as `log(A + B)`.
 *
 * That turns the equation into `(x + p) + (x + q) = base^exponent`, so
 * `x = (M - p - q) / 2`.
 *
 * Kept as an exact `Rational` rather than restricted to whole numbers. Requiring
 * an integer here looked harmless and was not: for every odd `b^r` the numerator
 * is odd, so the restriction silently rejected **every** base-3, base-5 and
 * base-10 tuple and left the generator producing base-2 questions exclusively.
 * The stem-variety check could not see it, because the stems still differed.
 */
export function sumOfArgsAnswer(params: LogEquationParams): Rational {
  return fromFraction(targetValue(params) - params.p - params.q, 2);
}

/** Whether a tuple yields a question worth printing. */
export function isUsable(params: LogEquationParams): boolean {
  const { p, q } = params;
  if (p === q) return false;
  const valid = solveValidRoot(params);
  const extraneous = extraneousRoot(params);
  if (valid === null || extraneous === null) return false;

  const wrongLaw = sumOfArgsAnswer(params);

  // Each distractor must be a genuinely different answer.
  if (equals(wrongLaw, fromInt(valid)) || equals(wrongLaw, fromInt(extraneous))) return false;
  // A zero answer reads oddly and trips the giveaway heuristics.
  if (valid === 0 || extraneous === 0 || isZero(wrongLaw)) return false;
  // Keep the wrong-law answer within an order of magnitude of the real one, so
  // it is not eliminable on size alone.
  if (isTriviallyDistinguishable(fromInt(valid), wrongLaw)) return false;
  return true;
}

/** `x + 3` or `x - 3`, never `x + -3`. */
function renderShiftedX(shift: number): string {
  return shift < 0 ? `x - ${Math.abs(shift)}` : `x + ${shift}`;
}

/** `+ 3` or `- 3`, for building expressions term by term. */
function renderSigned(value: number): string {
  return value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`;
}

/** `log_{b}(x + p)`, with the sign folded so nothing prints as `x + -3`. */
function renderLogTerm(base: number, shift: number): string {
  return `\\log_{${base}}\\left(${renderShiftedX(shift)}\\right)`;
}

/** The equation as it appears in the stem. */
export function renderEquation(params: LogEquationParams): string {
  return `${renderLogTerm(params.base, params.p)} + ${renderLogTerm(params.base, params.q)} = ${params.exponent}`;
}

const PHRASINGS: ((equation: string) => string)[] = [
  (equation) => `Solve ${equation}.`,
  (equation) => `Find all real solutions of ${equation}.`,
  (equation) => `Determine the value of x that satisfies ${equation}.`,
];

function buildSolution(params: LogEquationParams): string[] {
  const { base, exponent, p, q } = params;
  const valid = solveValidRoot(params) as number;
  const extraneous = extraneousRoot(params) as number;
  const target = targetValue(params);
  const failing = extraneous + p <= 0 ? p : q;

  return [
    `Before doing any algebra, notice what the logarithms demand: their arguments have to be strictly positive. That constraint is not decoration — it is what makes the last step of this question necessary, and it is the step most people skip.`,
    `Combine the two logs first. Adding logs of the same base multiplies their arguments, so ${renderLogTerm(base, p)} + ${renderLogTerm(base, q)} becomes \\log_{${base}}\\left((${renderShiftedX(p)})(${renderShiftedX(q)})\\right). Note that this is a product — reading it as a sum of the arguments is a different equation entirely.`,
    `Now convert to exponential form. A logarithm base ${base} equal to ${exponent} means the argument equals ${base}^{${exponent}} = ${target}. So (${renderShiftedX(p)})(${renderShiftedX(q)}) = ${target}.`,
    `Expand and collect everything on one side: x^2 ${renderSigned(p + q)}x ${renderSigned(p * q - target)} = 0. That factors, giving the two roots x = ${valid} and x = ${extraneous}.`,
    `Here is the step the question is really about. Test each root in the original equation. x = ${valid} keeps both arguments positive, so it works. But x = ${extraneous} makes ${renderShiftedX(failing)} equal ${extraneous + failing}, and a logarithm is only defined for a strictly positive argument — so that root is extraneous and has to be thrown out.`,
    `So the only solution is x = ${valid}. The quadratic had two roots and the equation has one; that difference is not an arithmetic mistake, it is the domain doing its job.`,
  ];
}

/**
 * Every usable tuple, enumerated once at module load.
 *
 * The usable region is sparse — the discriminant `(p - q)^2 + 4b^r` has to be a
 * perfect square *and* exactly one root has to fail the domain check — so only a
 * few hundred of the tens of thousands of candidate tuples work. Rejection
 * sampling over a space that thin either burns a lot of draws or falls back, and
 * falling back would collapse every unlucky seed onto the same question.
 *
 * Enumerating instead makes the draw uniform over what is actually usable and
 * removes the fallback path entirely. It is deterministic, so it costs nothing
 * in reproducibility.
 */
const USABLE_PARAMS: LogEquationParams[] = (() => {
  const found: LogEquationParams[] = [];
  for (const base of BASES) {
    for (let exponent = 1; exponent <= MAX_EXPONENT[base]; exponent += 1) {
      for (let p = -SHIFT_BOUND; p <= SHIFT_BOUND; p += 1) {
        if (p === 0) continue;
        for (let q = -SHIFT_BOUND; q <= SHIFT_BOUND; q += 1) {
          if (q === 0) continue;
          const params = { base, exponent, p, q };
          if (isUsable(params)) found.push(params);
        }
      }
    }
  }
  return found;
})();

/** How many distinct questions this generator can produce, before phrasing. */
export const USABLE_PARAM_COUNT = USABLE_PARAMS.length;

function drawParams(rng: Rng): LogEquationParams {
  return rng.pick(USABLE_PARAMS);
}

export const solveLogEquationMultipleLogs: Generator = {
  id: GENERATOR_ID,
  unitId: UNIT_ID,
  problemTypeId: PROBLEM_TYPE_ID,
  difficulty: 3,
  strategies: STRATEGIES,

  generate(seed: number): QuestionInstance {
    const rng = createRng(seed);
    const params = drawParams(rng);
    const valid = solveValidRoot(params) as number;
    const extraneous = extraneousRoot(params) as number;
    const wrongLaw = sumOfArgsAnswer(params);

    const answer: QValue = qInt(valid);
    // The signature distractor: both roots of the quadratic, kept because the
    // domain check was never done. It contains the right answer, which is the
    // point — this is the student who did everything except the last step.
    const bothRoots: QValue = qSet([qInt(valid), qInt(extraneous)]);

    const choices: Choice[] = [
      { latex: valueToLatex(answer), isCorrect: true, value: answer },
      {
        latex: valueToLatex(bothRoots),
        isCorrect: false,
        strategyId: 'dropped_extraneous_root_check',
        value: bothRoots,
      },
      {
        latex: rationalToLatex(wrongLaw),
        isCorrect: false,
        strategyId: 'applied_log_law_to_sum_of_args',
        value: qRational(wrongLaw),
      },
      {
        latex: valueToLatex(qInt(extraneous)),
        isCorrect: false,
        strategyId: 'reported_extraneous_root_only',
        value: qInt(extraneous),
      },
    ];

    const phrasing = rng.pick(PHRASINGS);

    return {
      generatorId: GENERATOR_ID,
      seed,
      unitId: UNIT_ID,
      problemTypeId: PROBLEM_TYPE_ID,
      difficulty: 3,
      stem: phrasing(renderEquation(params)),
      choices: rng.shuffle(choices),
      solution: buildSolution(params),
      conceptTag:
        'Logarithmic equations: solving is not finished until each root is checked against the domain',
    };
  },
};

export const __testing = { USABLE_PARAMS, drawParams, renderLogTerm, PHRASINGS };
