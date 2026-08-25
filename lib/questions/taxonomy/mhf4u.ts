/**
 * MHF4U — Advanced Functions, Grade 12, University Preparation.
 *
 * **Provisional.** This tree was written from the standard Ontario MHF4U course
 * structure, *not* from an extracted question bank. Every `ProblemType` is
 * `status: 'provisional'` and stays that way until it has been diffed against
 * real textbook content. Do not read a slot's existence as evidence that the
 * course actually contains it — read it as a hypothesis to check.
 *
 * Where a type is doubtful, it is included with a `notes` line saying so, on the
 * principle that a listed guess gets checked and an omission does not.
 *
 * Granularity is deliberately fine: each type is scoped so that one generator
 * could serve every question of that kind. Merging two slots later is trivial;
 * splitting one after a generator exists is not.
 *
 * See `import.ts` for the reconciliation tooling that turns an extracted bank
 * into corrections against this tree.
 */

import type { Course, ProblemType } from './types.ts';
import type { Difficulty } from '../types.ts';

/** Strand labels from the Ontario MHF4U curriculum document. */
const STRAND_EXP_LOG = 'A. Exponential and Logarithmic Functions';
const STRAND_TRIG = 'B. Trigonometric Functions';
const STRAND_POLY_RATIONAL = 'C. Polynomial and Rational Functions';
const STRAND_CHARACTERISTICS = 'D. Characteristics of Functions';

/**
 * The id prefix a unit's problem types carry: the course code and unit number,
 * e.g. `mhf4u-u3` from `mhf4u-u3-polynomial-equations`.
 *
 * Problem-type ids are namespaced by course and unit but **not** by the unit's
 * full slug, so they stay `mhf4u-u3-factor-theorem-find-k` rather than the
 * unreadable `mhf4u-u3-polynomial-equations-factor-theorem-find-k`. The unit
 * number is what makes them unique; the unit's descriptive slug adds length
 * without adding information.
 */
function problemTypePrefix(unitId: string): string {
  return unitId.split('-').slice(0, 2).join('-');
}

/**
 * Builds a `ProblemType` from a bare slug, filling in the fields that are the
 * same for every entry, so the tree below reads as curriculum rather than as
 * boilerplate.
 *
 * `status` is hard-coded to `provisional` rather than defaulted: nothing in this
 * file may claim to be confirmed, and making that impossible to typo is worth
 * more than the flexibility.
 */
function type(
  unitId: string,
  slug: string,
  label: string,
  outcome: string,
  difficulties: Difficulty[],
  options: { parameterizable?: boolean; notes?: string } = {},
): ProblemType {
  return {
    id: `${problemTypePrefix(unitId)}-${slug}`,
    unitId,
    label,
    outcome,
    difficulties,
    status: 'provisional',
    parameterizable: options.parameterizable ?? true,
    notes: options.notes,
  };
}

const U1 = 'mhf4u-u1-characteristics-of-functions';
const U2 = 'mhf4u-u2-polynomial-functions';
const U3 = 'mhf4u-u3-polynomial-equations';
const U4 = 'mhf4u-u4-rational-functions';
const U5 = 'mhf4u-u5-trigonometric-functions';
const U6 = 'mhf4u-u6-trigonometric-identities';
const U7 = 'mhf4u-u7-exponential-logarithmic';
const U8 = 'mhf4u-u8-combining-functions';

/** The MHF4U course tree. */
export const MHF4U: Course = {
  code: 'MHF4U',
  label: 'Advanced Functions, Grade 12, University Preparation',
  units: [
    // ---------------------------------------------------------------- Unit 1
    {
      id: U1,
      order: 1,
      label: 'Characteristics of functions',
      strand: STRAND_CHARACTERISTICS,
      problemTypes: [
        type(U1, 'domain-range-from-equation', 'State domain and range from an equation',
          'I can work out the domain and range of a function from its equation, without graphing it.', [1, 2]),
        type(U1, 'domain-range-from-graph', 'State domain and range from a graph',
          'I can read the domain and range off a graph and write them in interval notation.', [1, 2],
          { parameterizable: false, notes: 'Input is a graph. Blocked on a graph-rendering pipeline, not on the mathematics — revisit if graph assets become available.' }),
        type(U1, 'interval-notation-conversion', 'Convert between inequality and interval notation',
          'I can rewrite a set of numbers in interval notation and back again.', [1]),
        type(U1, 'evaluate-function-notation', 'Evaluate a function in function notation',
          'I can substitute a value, or an expression, into f(x) and simplify.', [1, 2]),
        type(U1, 'solve-function-notation-equation', 'Solve f(x) = k for x',
          'I can find the input that produces a given output.', [2]),
        type(U1, 'find-inverse-algebraically', 'Find the inverse of a function algebraically',
          'I can swap x and y and solve to get the inverse equation.', [2]),
        type(U1, 'inverse-domain-restriction', 'Restrict a domain so the inverse is a function',
          'I can say what domain restriction makes an inverse pass the vertical line test.', [3]),
        type(U1, 'verify-inverse-by-composition', 'Verify two functions are inverses by composition',
          'I can show f(g(x)) = x to prove two functions undo each other.', [2]),
        type(U1, 'single-transformation-of-parent', 'Identify a single transformation of a parent function',
          'I can name the one transformation that turns a parent function into a given one.', [1]),
        type(U1, 'combined-transformation-mapping', 'List the transformations in y = af(k(x - d)) + c',
          'I can read all four transformations off a transformed equation, in the right order.', [2]),
        type(U1, 'write-equation-from-transformations', 'Write an equation from a described transformation',
          'I can turn a description of stretches, reflections and shifts into an equation.', [2]),
        type(U1, 'transformed-point-image', 'Find the image of a point under a transformation',
          'I can apply the mapping rule to a single point on the parent graph.', [2]),
        type(U1, 'classify-even-odd-algebraically', 'Classify a function as even, odd, or neither',
          'I can test f(-x) against f(x) and -f(x) to classify symmetry.', [2]),
        type(U1, 'average-rate-of-change', 'Calculate an average rate of change over an interval',
          'I can find the slope of the secant between two points on a function.', [1, 2]),
        type(U1, 'instantaneous-rate-of-change-estimate', 'Estimate an instantaneous rate of change',
          'I can estimate the slope of the tangent at a point using a shrinking interval.', [2, 3]),
        type(U1, 'compare-average-vs-instantaneous', 'Compare average and instantaneous rates of change',
          'I can say which rate is larger, and why, for a given function and interval.', [3],
          { notes: 'Might be better as a written-justification question. Included as multiple choice pending a look at how the textbook asks it.' }),
      ],
    },

    // ---------------------------------------------------------------- Unit 2
    {
      id: U2,
      order: 2,
      label: 'Polynomial functions',
      strand: STRAND_POLY_RATIONAL,
      problemTypes: [
        type(U2, 'degree-and-leading-coefficient', 'State degree and leading coefficient',
          'I can read the degree and leading coefficient off a polynomial in any form.', [1]),
        type(U2, 'end-behaviour-from-equation', 'Determine end behaviour from an equation',
          'I can say what happens to y as x goes to positive and negative infinity.', [1, 2]),
        type(U2, 'end-behaviour-to-degree-sign', 'Deduce degree parity and leading sign from end behaviour',
          'I can work backwards from end behaviour to whether the degree is even or odd and the leading coefficient positive or negative.', [2]),
        type(U2, 'zeros-from-factored-form', 'Find the zeros of a polynomial in factored form',
          'I can read the zeros straight off a factored polynomial.', [1]),
        type(U2, 'multiplicity-and-graph-behaviour', 'Relate multiplicity to behaviour at a zero',
          'I can say whether the graph crosses, bounces off, or flattens at each zero.', [2]),
        type(U2, 'y-intercept-from-factored-form', 'Find the y-intercept of a factored polynomial',
          'I can substitute x = 0 into a factored form without expanding it first.', [1]),
        type(U2, 'write-equation-from-zeros', 'Write a polynomial equation given its zeros',
          'I can build a polynomial from a list of zeros and their multiplicities.', [2]),
        type(U2, 'write-equation-from-zeros-and-point', 'Write a polynomial given zeros and one point',
          'I can find the leading coefficient using an extra point on the curve.', [2, 3]),
        type(U2, 'finite-differences-determine-degree', 'Determine degree from finite differences',
          'I can use a difference table to find the degree of the polynomial behind a set of data.', [2]),
        type(U2, 'finite-differences-leading-coefficient', 'Find the leading coefficient from finite differences',
          'I can use the constant difference and n! to recover the leading coefficient.', [3]),
        type(U2, 'turning-points-and-degree-bounds', 'Relate turning points to degree',
          'I can say the most turning points a polynomial of a given degree can have, and the least.', [2]),
        type(U2, 'symmetry-of-polynomial', 'Determine whether a polynomial is even, odd, or neither',
          'I can use the exponents to classify the symmetry of a polynomial.', [2]),
        type(U2, 'domain-range-of-polynomial', 'State domain and range of a polynomial',
          'I can say why every polynomial has domain all reals, and when the range is restricted.', [1, 2]),
        type(U2, 'sketch-from-factored-form', 'Sketch a polynomial from its factored form',
          'I can sketch a curve using zeros, multiplicity, end behaviour and the y-intercept.', [2, 3],
          { parameterizable: false, notes: 'Output is a sketch. No graph-rendering pipeline exists, and a multiple-choice version would need four candidate graphs as images.' }),
      ],
    },

    // ---------------------------------------------------------------- Unit 3
    {
      id: U3,
      order: 3,
      label: 'Polynomial equations and inequalities',
      strand: STRAND_POLY_RATIONAL,
      problemTypes: [
        type(U3, 'remainder-theorem-evaluate', 'Find a remainder using the remainder theorem',
          'I can find the remainder of a division by evaluating the polynomial instead of dividing.', [1, 2]),
        type(U3, 'remainder-theorem-find-k', 'Find an unknown coefficient given a remainder',
          'I can set f(r) equal to a given remainder and solve for the unknown coefficient.', [2]),
        type(U3, 'factor-theorem-verify-factor', 'Test whether a binomial is a factor',
          'I can check whether (x - r) divides a polynomial by evaluating f(r).', [1]),
        type(U3, 'factor-theorem-find-k', 'Find k given a known factor',
          'I can use the fact that a factor means f(r) = 0 to solve for an unknown constant.', [2]),
        type(U3, 'rational-root-candidates', 'List candidate rational roots',
          'I can list the possible rational zeros from the factors of the constant and leading coefficient.', [2]),
        type(U3, 'long-division-quotient-remainder', 'Divide polynomials by long division',
          'I can carry out polynomial long division and state the quotient and remainder.', [2]),
        type(U3, 'synthetic-division', 'Divide by a linear factor using synthetic division',
          'I can use synthetic division as a shortcut for dividing by (x - r).', [2]),
        type(U3, 'factor-fully-cubic', 'Factor a cubic fully',
          'I can find one root, divide it out, and factor what is left.', [2]),
        type(U3, 'factor-fully-quartic', 'Factor a quartic fully',
          'I can factor a degree-four polynomial completely, including repeated roots.', [3]),
        type(U3, 'solve-polynomial-equation-factorable', 'Solve a factorable polynomial equation',
          'I can solve a polynomial equation by factoring and setting each factor to zero.', [2]),
        type(U3, 'solve-polynomial-equation-irrational-roots', 'Solve a polynomial equation with irrational roots',
          'I can factor out what I can and finish with the quadratic formula.', [3]),
        type(U3, 'family-of-polynomials-from-roots', 'Write the family of polynomials with given roots',
          'I can write the general member of a family of polynomials sharing the same zeros.', [2]),
        type(U3, 'count-real-roots-from-factored-form', 'Count the distinct real roots of a factored polynomial',
          'I can read how many distinct real roots a polynomial has from its factored form, without solving anything.', [2],
          { notes: 'Added in Session C alongside its generator. Distinguishes distinct roots from roots counted with multiplicity, and from factors that have no real roots at all.' }),
        type(U3, 'sum-and-product-of-roots', 'Find the sum and product of the roots',
          'I can get the sum and product of a polynomial\u2019s roots from its coefficients, without finding the roots.', [2],
          { notes: 'Added in Session C alongside its generator. Vieta\u2019s relations; check against the textbook, since some MHF4U courses cover this only for quadratics.' }),
        type(U3, 'sign-analysis-interval-table', 'Build a sign chart for a factored polynomial',
          'I can build an interval table showing where a polynomial is positive and negative.', [2]),
        type(U3, 'solve-polynomial-inequality-factored', 'Solve a polynomial inequality given in factored form',
          'I can use a sign chart to solve an inequality that is already factored.', [2]),
        type(U3, 'solve-polynomial-inequality-unfactored', 'Solve a polynomial inequality from scratch',
          'I can factor a polynomial inequality myself and then solve it with a sign chart.', [3]),
      ],
    },

    // ---------------------------------------------------------------- Unit 4
    {
      id: U4,
      order: 4,
      label: 'Rational functions',
      strand: STRAND_POLY_RATIONAL,
      problemTypes: [
        type(U4, 'domain-and-restrictions', 'State the domain and restrictions of a rational function',
          'I can find the values of x that make the denominator zero and exclude them.', [1]),
        type(U4, 'vertical-asymptotes', 'Find vertical asymptotes',
          'I can find vertical asymptotes from the denominator, after cancelling common factors.', [1, 2]),
        type(U4, 'identify-holes', 'Identify holes in a rational function',
          'I can tell a hole from a vertical asymptote by looking at what cancels.', [2]),
        type(U4, 'hole-coordinates', 'Find the coordinates of a hole',
          'I can find both coordinates of a hole, not just its x-value.', [2, 3]),
        type(U4, 'horizontal-asymptote-by-degree', 'Find a horizontal asymptote by comparing degrees',
          'I can compare the degrees of numerator and denominator to find the horizontal asymptote.', [2]),
        type(U4, 'oblique-asymptote-by-division', 'Find an oblique asymptote by division',
          'I can divide when the numerator degree is one higher and read off the slant asymptote.', [3]),
        type(U4, 'intercepts-rational', 'Find the intercepts of a rational function',
          'I can find where a rational function crosses each axis.', [1, 2]),
        type(U4, 'end-behaviour-rational', 'Describe the end behaviour of a rational function',
          'I can say what the function approaches far out in both directions.', [2]),
        type(U4, 'behaviour-near-asymptote', 'Describe behaviour on each side of a vertical asymptote',
          'I can say whether the curve shoots up or down as it approaches an asymptote from each side.', [2, 3]),
        type(U4, 'solve-rational-equation', 'Solve a rational equation',
          'I can clear denominators and solve the resulting equation.', [2]),
        type(U4, 'solve-rational-equation-extraneous', 'Solve a rational equation and reject extraneous roots',
          'I can check my solutions against the restrictions and throw out the ones that break them.', [3]),
        type(U4, 'solve-rational-inequality', 'Solve a rational inequality',
          'I can solve a rational inequality with a sign chart, remembering the asymptotes are boundaries too.', [3]),
        type(U4, 'average-rate-of-change-rational', 'Find an average rate of change for a rational function',
          'I can find the average rate of change of a rational function over an interval.', [3]),
        type(U4, 'sketch-rational', 'Sketch a rational function',
          'I can sketch a rational function using its asymptotes, holes and intercepts.', [3],
          { parameterizable: false, notes: 'Output is a sketch. Same graph-pipeline blocker as the polynomial sketching type.' }),
      ],
    },

    // ---------------------------------------------------------------- Unit 5
    {
      id: U5,
      order: 5,
      label: 'Trigonometric functions',
      strand: STRAND_TRIG,
      problemTypes: [
        type(U5, 'degree-to-radian', 'Convert degrees to radians',
          'I can convert an angle from degrees into exact radian measure.', [1]),
        type(U5, 'radian-to-degree', 'Convert radians to degrees',
          'I can convert an angle from radians into degrees.', [1]),
        type(U5, 'arc-length', 'Use the arc length formula',
          'I can use a = r(theta) to find an arc length, radius or angle.', [2]),
        type(U5, 'coterminal-angles', 'Find coterminal angles',
          'I can add or subtract full revolutions to find a coterminal angle in a required range.', [1]),
        type(U5, 'special-angle-exact-ratio', 'Evaluate a trig ratio at a special angle',
          'I can give the exact value of a trig ratio at a special angle without a calculator.', [1, 2]),
        type(U5, 'cast-rule-sign', 'Determine the sign of a ratio by quadrant',
          'I can use the CAST rule to say whether a ratio is positive or negative.', [1]),
        type(U5, 'related-acute-angle', 'Find the related acute angle',
          'I can find the related acute angle for an angle in any quadrant.', [2]),
        type(U5, 'exact-ratio-any-quadrant', 'Evaluate a trig ratio in any quadrant',
          'I can combine the related acute angle with the CAST rule to get an exact ratio.', [2]),
        type(U5, 'reciprocal-ratio-evaluate', 'Evaluate a reciprocal trig ratio',
          'I can find csc, sec and cot values from the primary ratios.', [2]),
        type(U5, 'solve-for-angle-given-ratio', 'Find all angles in a range with a given ratio',
          'I can find every angle in a given interval that produces a particular ratio.', [2]),
        type(U5, 'amplitude-period-phase-from-equation', 'Read amplitude, period, phase shift and axis from an equation',
          'I can read all four properties off a sinusoidal equation.', [1, 2]),
        type(U5, 'write-sinusoidal-from-description', 'Write a sinusoidal equation from a description',
          'I can turn a description of amplitude, period, shift and axis into an equation.', [2]),
        type(U5, 'domain-range-transformed-trig', 'State domain and range of a transformed trig function',
          'I can work out the range of a transformed sine or cosine from its amplitude and axis.', [2]),
        type(U5, 'transformed-trig-point', 'Find the image of a point on a transformed trig graph',
          'I can apply a sinusoidal transformation to a single known point.', [2]),
        type(U5, 'sinusoidal-word-problem-model', 'Model a periodic situation with a sinusoidal equation',
          'I can turn a tide, wheel or temperature problem into a sinusoidal equation and use it.', [3],
          { notes: 'Parameterizable if the scenario is templated and only the numbers vary. If the textbook varies the scenario itself, split this into one type per context.' }),
        type(U5, 'graph-sinusoidal', 'Graph a transformed sinusoidal function',
          'I can graph a transformed sine or cosine over a given interval.', [2, 3],
          { parameterizable: false, notes: 'Output is a graph. Same graph-pipeline blocker as the other sketching types.' }),
      ],
    },

    // ---------------------------------------------------------------- Unit 6
    {
      id: U6,
      order: 6,
      label: 'Trigonometric identities and equations',
      strand: STRAND_TRIG,
      problemTypes: [
        type(U6, 'pythagorean-identity-evaluate', 'Use a Pythagorean identity to find another ratio',
          'I can find cos from sin, or sec from tan, using a Pythagorean identity and the quadrant.', [2]),
        type(U6, 'quotient-identity-simplify', 'Simplify using a quotient identity',
          'I can rewrite tan and cot in terms of sin and cos to simplify an expression.', [2]),
        type(U6, 'simplify-trig-expression', 'Simplify a trigonometric expression',
          'I can simplify a trig expression to a single ratio using the basic identities.', [2]),
        type(U6, 'compound-angle-exact-value', 'Find an exact value using a compound angle formula',
          'I can write an angle as a sum or difference of special angles to get an exact ratio.', [2]),
        type(U6, 'compound-angle-expand', 'Expand a compound angle expression',
          'I can expand sin(A + B) or cos(A - B) using the addition formulas.', [2]),
        type(U6, 'compound-angle-given-ratios', 'Evaluate a compound angle given two ratios',
          'I can find sin(A + B) when I am told sin A and cos B and which quadrants they are in.', [3]),
        type(U6, 'double-angle-exact-value', 'Find an exact value using a double angle formula',
          'I can use a double angle formula to get an exact ratio.', [2]),
        type(U6, 'double-angle-given-ratio', 'Apply a double angle formula to a given ratio',
          'I can find sin 2A from sin A and the quadrant.', [3]),
        type(U6, 'solve-linear-trig-equation-interval', 'Solve a linear trig equation over an interval',
          'I can solve something like 2 sin x - 1 = 0 for every solution in [0, 2pi].', [2]),
        type(U6, 'solve-factorable-quadratic-trig-equation', 'Solve a factorable quadratic trig equation',
          'I can factor a quadratic in sin x and solve each factor over the interval.', [3]),
        type(U6, 'solve-trig-equation-double-angle', 'Solve a trig equation containing a double angle',
          'I can replace a double angle before solving, and remember the extra solutions it creates.', [3]),
        type(U6, 'solve-trig-equation-general-solution', 'Write the general solution of a trig equation',
          'I can write every solution using a + 2(pi)n notation rather than just those in one interval.', [3]),
        type(U6, 'count-solutions-in-interval', 'Count the solutions of a trig equation in an interval',
          'I can say how many solutions an equation has in a given interval without listing them all.', [2]),
        type(U6, 'prove-trig-identity', 'Prove a trigonometric identity',
          'I can start from one side and transform it into the other, justifying each step.', [3],
          { parameterizable: false, notes: 'Requires a written multi-step justification and there is no single correct final answer to put in four options. Genuinely bespoke.' }),
      ],
    },

    // ---------------------------------------------------------------- Unit 7
    {
      id: U7,
      order: 7,
      label: 'Exponential and logarithmic functions',
      strand: STRAND_EXP_LOG,
      problemTypes: [
        type(U7, 'convert-exponential-to-log', 'Rewrite an exponential statement as a logarithm',
          'I can turn b^x = y into log form.', [1]),
        type(U7, 'convert-log-to-exponential', 'Rewrite a logarithm as an exponential statement',
          'I can turn a log equation back into exponential form.', [1]),
        type(U7, 'evaluate-log-exact', 'Evaluate a logarithm exactly',
          'I can evaluate a log without a calculator by asking what power gives that value.', [1, 2]),
        type(U7, 'log-laws-product-quotient', 'Apply the product and quotient laws of logarithms',
          'I can split or combine logs of products and quotients.', [2]),
        type(U7, 'log-laws-power', 'Apply the power law of logarithms',
          'I can move an exponent out in front of a log, and back.', [2]),
        type(U7, 'condense-log-expression', 'Condense an expression into a single logarithm',
          'I can combine several log terms into one.', [2]),
        type(U7, 'expand-log-expression', 'Expand a logarithm of a product or power',
          'I can break a single log into a sum or difference of simpler logs.', [2]),
        type(U7, 'change-of-base', 'Use the change of base formula',
          'I can rewrite a log in a different base so a calculator can evaluate it.', [2]),
        type(U7, 'domain-of-log-function', 'State the domain of a logarithmic function',
          'I can find the domain by setting the argument greater than zero.', [2]),
        type(U7, 'transformations-of-log-graph', 'Identify transformations of a logarithmic function',
          'I can name the transformations applied to a log graph and locate its asymptote.', [2]),
        type(U7, 'solve-exponential-common-base', 'Solve an exponential equation by matching bases',
          'I can rewrite both sides with the same base and equate the exponents.', [2]),
        type(U7, 'solve-exponential-taking-logs', 'Solve an exponential equation by taking logarithms',
          'I can take the log of both sides when the bases will not match.', [2, 3]),
        type(U7, 'solve-log-equation-single-log', 'Solve an equation with a single logarithm',
          'I can convert to exponential form and solve.', [2]),
        type(U7, 'solve-log-equation-multiple-logs', 'Solve a log equation with several logarithms and check for extraneous roots',
          'I can combine logs, solve, and reject any answer that makes an argument negative.', [3]),
        type(U7, 'exponential-growth-decay-model', 'Solve an exponential growth or decay problem',
          'I can build a growth or decay equation from a doubling time or half-life and use it.', [2, 3]),
        type(U7, 'compound-interest-time', 'Find the time in a compound interest problem',
          'I can solve for the exponent when I know the starting and ending amounts.', [3]),
        type(U7, 'log-scale-application', 'Work with a logarithmic scale',
          'I can compare two quantities on a pH, decibel or Richter scale.', [3]),
      ],
    },

    // ---------------------------------------------------------------- Unit 8
    {
      id: U8,
      order: 8,
      label: 'Combining functions',
      strand: STRAND_CHARACTERISTICS,
      problemTypes: [
        type(U8, 'sum-difference-evaluate', 'Evaluate a sum or difference of functions',
          'I can find (f + g)(x) or (f - g)(x) and evaluate it.', [1]),
        type(U8, 'product-quotient-evaluate', 'Evaluate a product or quotient of functions',
          'I can find (fg)(x) or (f/g)(x) and evaluate it.', [1]),
        type(U8, 'domain-of-combined-function', 'State the domain of a combined function',
          'I can intersect the domains, and exclude anything that makes a quotient undefined.', [2]),
        type(U8, 'composition-evaluate-numeric', 'Evaluate a composite function at a number',
          'I can work out f(g(3)) by going inside out.', [1, 2]),
        type(U8, 'composition-find-equation', 'Find the equation of a composite function',
          'I can substitute one function into another and simplify.', [2]),
        type(U8, 'composition-order-matters', 'Compare f(g(x)) with g(f(x))',
          'I can show that composing in the other order usually gives a different function.', [2]),
        type(U8, 'composition-domain', 'State the domain of a composite function',
          'I can find the domain of a composition, including restrictions the inner function creates.', [3]),
        type(U8, 'decompose-composite', 'Decompose a function into a composition',
          'I can write a complicated function as f(g(x)) for simpler f and g.', [2, 3]),
        type(U8, 'inverse-of-composite', 'Find the inverse of a composite function',
          'I can undo a composition by inverting each part in the opposite order.', [3]),
        type(U8, 'even-odd-of-combined', 'Determine the symmetry of a combined function',
          'I can say whether a sum or product of even and odd functions is even, odd, or neither.', [3]),
        type(U8, 'rate-of-change-of-combined', 'Find a rate of change of a combined function',
          'I can find the average rate of change of a sum or product over an interval.', [3]),
        type(U8, 'graph-of-sum', 'Sketch the sum of two functions from their graphs',
          'I can add two graphs point by point to sketch their sum.', [2, 3],
          { parameterizable: false, notes: 'Both input and output are graphs. Same graph-pipeline blocker.' }),
      ],
    },
  ],
};
