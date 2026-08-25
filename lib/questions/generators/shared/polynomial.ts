/**
 * Exact polynomial arithmetic and rendering, shared across the MHF4U
 * polynomial generators.
 *
 * Coefficients are `Rational` throughout, so nothing here can introduce the
 * float error that `rational.ts` exists to prevent. A polynomial is stored as
 * coefficients in **ascending** order of power — `coeffs[i]` multiplies `x^i` —
 * because that makes the arithmetic indexing natural. Rendering reverses it, so
 * questions read in the conventional descending order.
 *
 * This module exists because eight generators in Unit 3 all need to evaluate,
 * divide, and print polynomials, and eight private copies of "render a signed
 * term" is eight chances to ship `1x^2` or `+ -3` to a student.
 */

import {
  type Rational,
  ONE,
  ZERO,
  add,
  equals,
  fromInt,
  isZero,
  mul,
  neg,
  signOf,
  toLatex as rationalToLatex,
} from '../../rational.ts';

/** Coefficients in ascending order of power: `coeffs[i]` multiplies `x^i`. */
export type Poly = Rational[];

/** Builds a polynomial from integer coefficients given in **ascending** power order. */
export function polyFromAscending(...coefficients: number[]): Poly {
  return coefficients.map((c) => fromInt(c));
}

/** Builds a polynomial from integer coefficients given in **descending** power order. */
export function polyFromDescending(...coefficients: number[]): Poly {
  return coefficients.map((c) => fromInt(c)).reverse();
}

/** Drops trailing zero coefficients, so degree is meaningful. */
export function polyTrim(poly: Poly): Poly {
  const trimmed = poly.slice();
  while (trimmed.length > 1 && isZero(trimmed[trimmed.length - 1])) trimmed.pop();
  return trimmed;
}

/** Degree of the polynomial. The zero polynomial reports degree 0. */
export function polyDegree(poly: Poly): number {
  return polyTrim(poly).length - 1;
}

/** Leading coefficient, after trimming. */
export function polyLeading(poly: Poly): Rational {
  const trimmed = polyTrim(poly);
  return trimmed[trimmed.length - 1];
}

/** `p(x)` evaluated exactly at `x`, by Horner's method. */
export function polyEval(poly: Poly, x: Rational): Rational {
  let acc = ZERO;
  for (let power = poly.length - 1; power >= 0; power -= 1) {
    acc = add(mul(acc, x), poly[power]);
  }
  return acc;
}

/** `a + b`. */
export function polyAdd(a: Poly, b: Poly): Poly {
  const out: Poly = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    out.push(add(a[i] ?? ZERO, b[i] ?? ZERO));
  }
  return polyTrim(out);
}

/** `a * b`. */
export function polyMul(a: Poly, b: Poly): Poly {
  const out: Poly = new Array(a.length + b.length - 1).fill(ZERO);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      out[i + j] = add(out[i + j], mul(a[i], b[j]));
    }
  }
  return polyTrim(out);
}

/** `k * p`. */
export function polyScale(poly: Poly, k: Rational): Poly {
  return polyTrim(poly.map((c) => mul(c, k)));
}

/** Whether two polynomials are identical after trimming. */
export function polyEquals(a: Poly, b: Poly): boolean {
  const left = polyTrim(a);
  const right = polyTrim(b);
  return left.length === right.length && left.every((c, i) => equals(c, right[i]));
}

/**
 * Expands `leading * (x - r1)(x - r2)...` into standard form.
 *
 * The workhorse for every "build a polynomial with these zeros" generator —
 * building from roots and expanding guarantees the roots are exactly what the
 * question claims, which choosing coefficients and hoping does not.
 */
export function polyFromRoots(roots: Rational[], leading: Rational = ONE): Poly {
  let poly: Poly = [leading];
  for (const root of roots) {
    // (x - root)
    poly = polyMul(poly, [neg(root), ONE]);
  }
  return polyTrim(poly);
}

/**
 * Divides `poly` by `(x - r)` using synthetic division.
 *
 * Returns the quotient and the remainder. By the remainder theorem the
 * remainder always equals `poly(r)`, and there is a test asserting exactly that
 * — it is the cheapest available check that this function is correct.
 */
export function polyDivideByLinear(
  poly: Poly,
  root: Rational,
): { quotient: Poly; remainder: Rational } {
  const coefficients = polyTrim(poly);
  if (coefficients.length === 1) {
    return { quotient: [ZERO], remainder: coefficients[0] };
  }
  // Work in descending order, the way synthetic division is written by hand.
  const descending = coefficients.slice().reverse();
  const out: Rational[] = [descending[0]];
  for (let i = 1; i < descending.length; i += 1) {
    out.push(add(descending[i], mul(out[i - 1], root)));
  }
  const remainder = out.pop() as Rational;
  return { quotient: polyTrim(out.reverse()), remainder };
}

/**
 * Renders one term's coefficient, omitting a magnitude of 1 in front of a
 * variable.
 *
 * `1x^2` is not how anyone writes it, and a student who sees it reads the
 * question as machine-made.
 */
function renderCoefficient(coefficient: Rational, hasVariable: boolean): string {
  const magnitude = signOf(coefficient) === -1 ? neg(coefficient) : coefficient;
  if (hasVariable && equals(magnitude, ONE)) return '';
  return rationalToLatex(magnitude);
}

/** `x`, `x^2`, `x^{10}` — braces only where LaTeX needs them. */
export function renderPower(variable: string, power: number): string {
  if (power === 0) return '';
  if (power === 1) return variable;
  return power < 10 ? `${variable}^${power}` : `${variable}^{${power}}`;
}

/**
 * Renders a polynomial in conventional descending order, with correct signs and
 * no unit coefficients.
 *
 * Zero coefficients are omitted entirely; the zero polynomial renders as `0`.
 */
export function renderPoly(poly: Poly, variable = 'x'): string {
  const coefficients = polyTrim(poly);
  let out = '';
  for (let power = coefficients.length - 1; power >= 0; power -= 1) {
    const coefficient = coefficients[power];
    if (isZero(coefficient)) continue;
    const negative = signOf(coefficient) === -1;
    const body = `${renderCoefficient(coefficient, power > 0)}${renderPower(variable, power)}`;
    if (out === '') {
      out = negative ? `-${body}` : body;
    } else {
      out += negative ? ` - ${body}` : ` + ${body}`;
    }
  }
  return out === '' ? '0' : out;
}

/**
 * Renders `(x - r)`, folding the sign so a negative root prints as `(x + 3)`
 * rather than `(x - -3)`.
 */
export function renderLinearFactor(root: Rational, variable = 'x'): string {
  if (isZero(root)) return variable;
  const negative = signOf(root) === -1;
  const magnitude = negative ? neg(root) : root;
  return `(${variable} ${negative ? '+' : '-'} ${rationalToLatex(magnitude)})`;
}

/**
 * Renders a product of linear factors, e.g. `(x - 1)(x + 2)(x - 3)`, with an
 * optional leading coefficient.
 */
export function renderFactoredForm(
  roots: Rational[],
  leading: Rational = ONE,
  variable = 'x',
): string {
  const factors = roots.map((root) => renderLinearFactor(root, variable)).join('');
  if (equals(leading, ONE)) return factors;
  if (equals(leading, neg(ONE))) return `-${factors}`;
  return `${rationalToLatex(leading)}${factors}`;
}

/**
 * Renders a signed term for prose, e.g. `" + 3x^2"`, `" - x"`.
 * Kept for generators that assemble a stem piecewise rather than from a `Poly`.
 */
export function renderSignedTerm(coefficient: Rational, variablePart: string): string {
  const negative = signOf(coefficient) === -1;
  const magnitude = negative ? neg(coefficient) : coefficient;
  const shown = equals(magnitude, ONE) && variablePart !== '' ? '' : rationalToLatex(magnitude);
  return ` ${negative ? '-' : '+'} ${shown}${variablePart}`;
}

/** Every integer that divides `n`, positive and negative, for rational-root work. */
export function integerDivisors(n: bigint): bigint[] {
  const magnitude = n < BigInt(0) ? -n : n;
  if (magnitude === BigInt(0)) return [];
  const positives: bigint[] = [];
  for (let d = BigInt(1); d * d <= magnitude; d += BigInt(1)) {
    if (magnitude % d === BigInt(0)) {
      positives.push(d);
      const partner = magnitude / d;
      if (partner !== d) positives.push(partner);
    }
  }
  positives.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return positives;
}
