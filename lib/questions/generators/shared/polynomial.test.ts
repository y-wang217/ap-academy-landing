import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  integerDivisors,
  polyAdd,
  polyDegree,
  polyDivideByLinear,
  polyEquals,
  polyEval,
  polyFromAscending,
  polyFromDescending,
  polyFromRoots,
  polyLeading,
  polyMul,
  polyScale,
  polyTrim,
  renderFactoredForm,
  renderLinearFactor,
  renderPoly,
  renderPower,
  renderSignedTerm,
} from './polynomial.ts';
import { fromFraction as r, fromInt as i, mul, toString as ratToString } from '../../rational.ts';

// --- construction and shape ---------------------------------------------------

test('poly: ascending and descending constructors agree', () => {
  // x^3 + 2x^2 - 5x + 1
  assert.ok(polyEquals(polyFromAscending(1, -5, 2, 1), polyFromDescending(1, 2, -5, 1)));
});

test('poly: trim drops trailing zero coefficients', () => {
  assert.equal(polyTrim(polyFromAscending(1, 2, 0, 0)).length, 2);
  assert.equal(polyTrim(polyFromAscending(0, 0, 0)).length, 1);
});

test('poly: degree and leading coefficient', () => {
  const p = polyFromDescending(3, 0, -1, 4); // 3x^3 - x + 4
  assert.equal(polyDegree(p), 3);
  assert.equal(ratToString(polyLeading(p)), '3');
  assert.equal(polyDegree(polyFromAscending(5)), 0);
});

// --- evaluation ---------------------------------------------------------------

test('poly: evaluates exactly', () => {
  const p = polyFromDescending(1, 2, -5, 1); // x^3 + 2x^2 - 5x + 1
  assert.equal(ratToString(polyEval(p, i(0))), '1');
  assert.equal(ratToString(polyEval(p, i(1))), '-1');
  assert.equal(ratToString(polyEval(p, i(2))), '7');
  assert.equal(ratToString(polyEval(p, i(-1))), '7');
});

test('poly: evaluates at a fraction without float error', () => {
  const p = polyFromDescending(1, 0, 0, 0); // x^3
  assert.equal(ratToString(polyEval(p, r(1, 3))), '1/27');
  // The float trap: 0.1^3 is 0.0010000000000000002.
  assert.equal(ratToString(polyEval(p, r(1, 10))), '1/1000');
});

// --- arithmetic ---------------------------------------------------------------

test('poly: addition and scaling', () => {
  const a = polyFromDescending(1, 2, 3);
  const b = polyFromDescending(-1, 1, 0);
  assert.ok(polyEquals(polyAdd(a, b), polyFromDescending(3, 3)));
  assert.ok(polyEquals(polyScale(a, i(2)), polyFromDescending(2, 4, 6)));
  assert.ok(polyEquals(polyScale(a, i(0)), polyFromAscending(0)));
});

test('poly: multiplication', () => {
  // (x + 1)(x - 1) = x^2 - 1
  const product = polyMul(polyFromDescending(1, 1), polyFromDescending(1, -1));
  assert.ok(polyEquals(product, polyFromDescending(1, 0, -1)));
});

test('poly: multiplication agrees with evaluation at many points', () => {
  // (ab)(x) must equal a(x) * b(x) for every x — the property that makes
  // polyMul worth trusting, checked independently of how it is implemented.
  const a = polyFromDescending(2, -3, 1);
  const b = polyFromDescending(1, 4);
  const product = polyMul(a, b);
  for (let x = -5; x <= 5; x += 1) {
    const point = i(x);
    assert.equal(
      ratToString(polyEval(product, point)),
      ratToString(mul(polyEval(a, point), polyEval(b, point))),
      `product disagrees at x = ${x}`,
    );
  }
});

// --- roots --------------------------------------------------------------------

test('poly: polyFromRoots produces a polynomial with exactly those roots', () => {
  const roots = [i(1), i(-2), i(3)];
  const p = polyFromRoots(roots);
  for (const root of roots) {
    assert.equal(ratToString(polyEval(p, root)), '0', `${ratToString(root)} is not a root`);
  }
  // (x - 1)(x + 2)(x - 3) = x^3 - 2x^2 - 5x + 6
  assert.ok(polyEquals(p, polyFromDescending(1, -2, -5, 6)));
});

test('poly: polyFromRoots honours a leading coefficient', () => {
  const p = polyFromRoots([i(1), i(-1)], i(3));
  assert.ok(polyEquals(p, polyFromDescending(3, 0, -3)));
  assert.equal(ratToString(polyLeading(p)), '3');
});

test('poly: polyFromRoots handles a repeated root', () => {
  const p = polyFromRoots([i(2), i(2)]);
  assert.ok(polyEquals(p, polyFromDescending(1, -4, 4)));
  assert.equal(ratToString(polyEval(p, i(2))), '0');
});

test('poly: polyFromRoots handles rational roots', () => {
  const p = polyFromRoots([r(1, 2), r(-1, 3)]);
  assert.equal(ratToString(polyEval(p, r(1, 2))), '0');
  assert.equal(ratToString(polyEval(p, r(-1, 3))), '0');
});

// --- division -----------------------------------------------------------------

test('poly: synthetic division remainder always equals p(r)', () => {
  // This is the remainder theorem, and the cheapest check that division works.
  const polynomials = [
    polyFromDescending(1, 2, -5, 1),
    polyFromDescending(2, 0, -3, 7, 1),
    polyFromDescending(1, -6, 11, -6),
  ];
  for (const p of polynomials) {
    for (let root = -4; root <= 4; root += 1) {
      const { remainder } = polyDivideByLinear(p, i(root));
      assert.equal(
        ratToString(remainder),
        ratToString(polyEval(p, i(root))),
        `remainder disagrees with p(${root})`,
      );
    }
  }
});

test('poly: quotient times divisor plus remainder reconstructs the polynomial', () => {
  const p = polyFromDescending(1, -6, 11, -6);
  for (let root = -3; root <= 3; root += 1) {
    const { quotient, remainder } = polyDivideByLinear(p, i(root));
    // q(x) * (x - r) + remainder === p(x)
    const rebuilt = polyAdd(polyMul(quotient, polyFromRoots([i(root)])), [remainder]);
    assert.ok(polyEquals(rebuilt, p), `reconstruction failed for root ${root}`);
  }
});

test('poly: dividing out a genuine root leaves no remainder', () => {
  const p = polyFromRoots([i(1), i(-2), i(3)]);
  const { quotient, remainder } = polyDivideByLinear(p, i(1));
  assert.equal(ratToString(remainder), '0');
  assert.ok(polyEquals(quotient, polyFromRoots([i(-2), i(3)])));
});

test('poly: dividing a constant returns it as the remainder', () => {
  const { quotient, remainder } = polyDivideByLinear(polyFromAscending(7), i(2));
  assert.equal(ratToString(remainder), '7');
  assert.equal(polyDegree(quotient), 0);
});

// --- rendering ----------------------------------------------------------------

test('poly: renders in descending order with correct signs', () => {
  assert.equal(renderPoly(polyFromDescending(1, 2, -5, 1)), 'x^3 + 2x^2 - 5x + 1');
  assert.equal(renderPoly(polyFromDescending(-1, 0, 3, 0)), '-x^3 + 3x');
  assert.equal(renderPoly(polyFromDescending(2, -1)), '2x - 1');
});

test('poly: never renders a unit coefficient in front of a variable', () => {
  assert.equal(renderPoly(polyFromDescending(1, 1, 1)), 'x^2 + x + 1');
  assert.equal(renderPoly(polyFromDescending(-1, -1, -1)), '-x^2 - x - 1');
  // A bare constant 1 keeps its digit.
  assert.equal(renderPoly(polyFromAscending(1)), '1');
});

test('poly: never renders a double sign or an empty polynomial', () => {
  for (const coefficients of [
    [1, -2, 3, -4],
    [-1, 2, -3, 4],
    [0, 0, 5],
    [3, 0, 0, -7],
  ]) {
    const rendered = renderPoly(polyFromDescending(...coefficients));
    assert.ok(!/[+-]\s*[+-]/.test(rendered), `double sign in ${rendered}`);
    assert.ok(rendered.length > 0);
  }
  assert.equal(renderPoly(polyFromAscending(0)), '0');
});

test('poly: omits zero coefficients', () => {
  assert.equal(renderPoly(polyFromDescending(1, 0, 0, -8)), 'x^3 - 8');
  assert.equal(renderPoly(polyFromDescending(0, 0, 4, 0)), '4x');
});

test('poly: renders fractional coefficients as fractions', () => {
  const p = [r(1, 2), r(-1, 3)];
  assert.equal(renderPoly(p), '-\\frac{1}{3}x + \\frac{1}{2}');
});

test('poly: renderPower uses braces only past single digits', () => {
  assert.equal(renderPower('x', 0), '');
  assert.equal(renderPower('x', 1), 'x');
  assert.equal(renderPower('x', 3), 'x^3');
  assert.equal(renderPower('x', 12), 'x^{12}');
});

test('poly: linear factors fold their sign', () => {
  assert.equal(renderLinearFactor(i(3)), '(x - 3)');
  assert.equal(renderLinearFactor(i(-3)), '(x + 3)');
  assert.equal(renderLinearFactor(i(0)), 'x');
  assert.equal(renderLinearFactor(r(1, 2)), '(x - \\frac{1}{2})');
});

test('poly: factored form renders a product', () => {
  assert.equal(renderFactoredForm([i(1), i(-2), i(3)]), '(x - 1)(x + 2)(x - 3)');
  assert.equal(renderFactoredForm([i(1), i(2)], i(3)), '3(x - 1)(x - 2)');
  assert.equal(renderFactoredForm([i(1)], i(-1)), '-(x - 1)');
});

test('poly: renderSignedTerm formats prose fragments', () => {
  assert.equal(renderSignedTerm(i(3), 'x^2'), ' + 3x^2');
  assert.equal(renderSignedTerm(i(-3), 'x^2'), ' - 3x^2');
  assert.equal(renderSignedTerm(i(1), 'x'), ' + x');
  assert.equal(renderSignedTerm(i(-1), 'x'), ' - x');
  assert.equal(renderSignedTerm(i(5), ''), ' + 5');
});

// --- divisors -----------------------------------------------------------------

test('poly: integerDivisors lists every positive divisor, sorted', () => {
  assert.deepEqual(integerDivisors(BigInt(12)).map(Number), [1, 2, 3, 4, 6, 12]);
  assert.deepEqual(integerDivisors(BigInt(-12)).map(Number), [1, 2, 3, 4, 6, 12]);
  assert.deepEqual(integerDivisors(BigInt(7)).map(Number), [1, 7]);
  assert.deepEqual(integerDivisors(BigInt(1)).map(Number), [1]);
  assert.deepEqual(integerDivisors(BigInt(0)), []);
});

test('poly: integerDivisors handles a perfect square without duplicating the root', () => {
  assert.deepEqual(integerDivisors(BigInt(36)).map(Number), [1, 2, 3, 4, 6, 9, 12, 18, 36]);
});
