import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ONE,
  ZERO,
  abs,
  add,
  compare,
  div,
  equals,
  fromFraction,
  fromInt,
  inverse,
  isInteger,
  isZero,
  mul,
  neg,
  pow,
  signOf,
  sub,
  toLatex,
  toNumber,
  toString as ratToString,
  type Rational,
} from './rational.ts';

const r = fromFraction;
const i = fromInt;

/** Asserts exact equality, reporting readable values on failure. */
function eq(actual: Rational, expected: Rational, message?: string): void {
  assert.ok(
    equals(actual, expected),
    message ?? `expected ${ratToString(expected)}, got ${ratToString(actual)}`,
  );
}

// --- representation invariant -------------------------------------------------

test('rational: reduces to lowest terms on construction', () => {
  assert.deepEqual(r(2, 4), { num: BigInt(1), den: BigInt(2) });
  assert.deepEqual(r(100, 250), { num: BigInt(2), den: BigInt(5) });
  assert.deepEqual(r(7, 7), { num: BigInt(1), den: BigInt(1) });
  assert.deepEqual(r(-9, 12), { num: BigInt(-3), den: BigInt(4) });
});

test('rational: normalizes a negative denominator onto the numerator', () => {
  assert.deepEqual(r(1, -2), { num: BigInt(-1), den: BigInt(2) });
  assert.deepEqual(r(-1, -2), { num: BigInt(1), den: BigInt(2) });
  assert.deepEqual(r(-3, -9), { num: BigInt(1), den: BigInt(3) });
  // A negative denominator must never survive construction.
  for (const value of [r(1, -2), r(-1, -2), r(5, -5), r(-7, -3)]) {
    assert.ok(value.den > BigInt(0), 'denominator escaped normalization');
  }
});

test('rational: zero is canonical however it is built', () => {
  for (const z of [r(0, 5), r(0, -5), i(0), sub(i(3), i(3)), mul(i(0), i(9))]) {
    assert.deepEqual(z, { num: BigInt(0), den: BigInt(1) });
    assert.ok(isZero(z));
    eq(z, ZERO);
  }
});

test('rational: a zero denominator throws', () => {
  assert.throws(() => r(1, 0), RangeError);
  assert.throws(() => r(0, 0), RangeError);
});

test('rational: non-integer number inputs throw rather than truncating', () => {
  assert.throws(() => i(1.5), TypeError);
  assert.throws(() => r(1.5, 2), TypeError);
  assert.throws(() => r(1, 2.5), TypeError);
});

test('rational: accepts bigint inputs', () => {
  eq(i(BigInt(7)), r(7, 1));
  eq(r(BigInt(4), BigInt(6)), r(2, 3));
});

// --- arithmetic ---------------------------------------------------------------

test('rational: add', () => {
  eq(add(r(1, 2), r(1, 3)), r(5, 6));
  eq(add(r(1, 2), r(1, 2)), i(1));
  eq(add(r(-1, 2), r(1, 2)), ZERO);
  eq(add(i(3), i(4)), i(7));
  eq(add(r(-1, 3), r(-1, 6)), r(-1, 2));
});

test('rational: add is the classic float trap, done exactly', () => {
  // 0.1 + 0.2 !== 0.3 in floating point. Here it must be exact.
  eq(add(r(1, 10), r(2, 10)), r(3, 10));
  assert.equal(toLatex(add(r(1, 10), r(2, 10))), '\\frac{3}{10}');
});

test('rational: sub', () => {
  eq(sub(r(1, 2), r(1, 3)), r(1, 6));
  eq(sub(i(5), i(5)), ZERO);
  eq(sub(r(1, 3), r(2, 3)), r(-1, 3));
  eq(sub(i(0), r(3, 4)), r(-3, 4));
});

test('rational: mul', () => {
  eq(mul(r(2, 3), r(3, 4)), r(1, 2));
  eq(mul(r(-2, 3), r(3, 2)), i(-1));
  eq(mul(i(0), r(9, 7)), ZERO);
  eq(mul(r(-1, 2), r(-1, 2)), r(1, 4));
});

test('rational: div', () => {
  eq(div(r(1, 2), r(1, 4)), i(2));
  eq(div(r(-1, 2), r(1, 2)), i(-1));
  eq(div(i(0), r(3, 4)), ZERO);
  eq(div(r(3, 4), i(-2)), r(-3, 8));
});

test('rational: div by zero throws', () => {
  assert.throws(() => div(i(1), ZERO), RangeError);
  assert.throws(() => div(ZERO, ZERO), RangeError);
});

test('rational: neg', () => {
  eq(neg(r(1, 2)), r(-1, 2));
  eq(neg(r(-1, 2)), r(1, 2));
  // Negating zero must stay canonical zero, not -0.
  assert.deepEqual(neg(ZERO), { num: BigInt(0), den: BigInt(1) });
});

test('rational: abs', () => {
  eq(abs(r(-3, 4)), r(3, 4));
  eq(abs(r(3, 4)), r(3, 4));
  eq(abs(ZERO), ZERO);
  eq(abs(i(-5)), i(5));
});

test('rational: pow with positive exponents', () => {
  eq(pow(r(2, 3), 2), r(4, 9));
  eq(pow(i(2), 10), i(1024));
  eq(pow(r(-1, 2), 3), r(-1, 8));
  eq(pow(r(-1, 2), 2), r(1, 4));
});

test('rational: pow with a zero exponent is one, including for zero', () => {
  eq(pow(r(5, 7), 0), ONE);
  eq(pow(ZERO, 0), ONE);
  eq(pow(i(-3), 0), ONE);
});

test('rational: pow with negative exponents inverts', () => {
  eq(pow(r(2, 3), -1), r(3, 2));
  eq(pow(i(2), -3), r(1, 8));
  eq(pow(r(-2, 3), -2), r(9, 4));
  eq(pow(r(-1, 2), -3), i(-8));
});

test('rational: pow rejects a negative exponent on zero and a non-integer exponent', () => {
  assert.throws(() => pow(ZERO, -1), RangeError);
  assert.throws(() => pow(i(2), 1.5), TypeError);
});

test('rational: inverse', () => {
  eq(inverse(r(2, 3)), r(3, 2));
  eq(inverse(i(-4)), r(-1, 4));
  assert.throws(() => inverse(ZERO), RangeError);
});

// --- large values -------------------------------------------------------------

test('rational: survives values that would overflow a double', () => {
  // 2^53 + 1 is the first integer a double cannot represent.
  const big = i(BigInt('9007199254740993'));
  eq(add(big, i(0)), big);
  assert.equal(toLatex(big), '9007199254740993');
  // The classic float failure: 2^53 + 1 - 2^53 evaluates to 0 in doubles.
  eq(sub(big, i(BigInt('9007199254740992'))), ONE);
});

test('rational: exact arithmetic on very large numerators and denominators', () => {
  const a = r(BigInt('123456789012345678901234567890'), BigInt('987654321098765432109876543210'));
  // That fraction reduces exactly; both share a factor of 9000000000900000000090.
  assert.deepEqual(a, { num: BigInt(13717421), den: BigInt(109739369) });
  eq(mul(a, inverse(a)), ONE);
  const huge = pow(i(10), 40);
  eq(div(huge, huge), ONE);
  assert.equal(toLatex(huge), `1${'0'.repeat(40)}`);
});

test('rational: repeated addition stays exact where floats drift', () => {
  let acc = ZERO;
  for (let n = 0; n < 10; n += 1) acc = add(acc, r(1, 10));
  eq(acc, ONE, 'ten tenths must be exactly one');
  assert.equal(toLatex(acc), '1');
});

// --- comparison ---------------------------------------------------------------

test('rational: equals compares by value, not by construction', () => {
  assert.ok(equals(r(1, 2), r(2, 4)));
  assert.ok(equals(r(-1, 2), r(1, -2)));
  assert.ok(equals(r(0, 3), ZERO));
  assert.ok(!equals(r(1, 2), r(1, 3)));
  assert.ok(!equals(r(1, 2), r(-1, 2)));
});

test('rational: compare orders exactly', () => {
  assert.equal(compare(r(1, 3), r(1, 2)), -1);
  assert.equal(compare(r(1, 2), r(1, 3)), 1);
  assert.equal(compare(r(2, 4), r(1, 2)), 0);
  assert.equal(compare(r(-1, 2), r(1, 2)), -1);
  assert.equal(compare(r(-1, 2), r(-1, 3)), -1);
  assert.equal(compare(ZERO, r(-1, 9999)), 1);
});

test('rational: compare is exact past double precision', () => {
  const a = r(BigInt('9007199254740993'), BigInt(1));
  const b = r(BigInt('9007199254740992'), BigInt(1));
  // Both collapse to the same double; compare must still separate them.
  assert.equal(toNumber(a), toNumber(b));
  assert.equal(compare(a, b), 1);
});

test('rational: isInteger and signOf', () => {
  assert.ok(isInteger(i(3)));
  assert.ok(isInteger(r(4, 2)));
  assert.ok(isInteger(ZERO));
  assert.ok(!isInteger(r(1, 2)));
  assert.equal(signOf(r(-1, 2)), -1);
  assert.equal(signOf(ZERO), 0);
  assert.equal(signOf(r(1, 2)), 1);
});

// --- rendering ----------------------------------------------------------------

test('rational: toLatex renders integers bare, for every sign', () => {
  assert.equal(toLatex(i(0)), '0');
  assert.equal(toLatex(i(3)), '3');
  assert.equal(toLatex(i(-3)), '-3');
  assert.equal(toLatex(r(6, 3)), '2');
  assert.equal(toLatex(r(-6, 3)), '-2');
  assert.equal(toLatex(r(6, -3)), '-2');
});

test('rational: toLatex puts the minus outside the fraction, never in the numerator', () => {
  assert.equal(toLatex(r(1, 2)), '\\frac{1}{2}');
  assert.equal(toLatex(r(-1, 2)), '-\\frac{1}{2}');
  assert.equal(toLatex(r(1, -2)), '-\\frac{1}{2}');
  assert.equal(toLatex(r(-1, -2)), '\\frac{1}{2}');
  assert.equal(toLatex(r(-7, 3)), '-\\frac{7}{3}');
});

test('rational: toLatex never emits a negative or unit denominator', () => {
  const samples: Rational[] = [];
  for (let n = -6; n <= 6; n += 1) {
    for (let d = -6; d <= 6; d += 1) {
      if (d !== 0) samples.push(r(n, d));
    }
  }
  assert.ok(samples.length > 0);
  for (const value of samples) {
    const latex = toLatex(value);
    assert.ok(!latex.includes('{-'), `negative inside braces: ${latex}`);
    assert.ok(!latex.includes('}{1}'), `unit denominator rendered as a fraction: ${latex}`);
    if (isInteger(value)) {
      assert.ok(!latex.includes('\\frac'), `integer rendered as a fraction: ${latex}`);
    } else {
      assert.match(latex, /^-?\\frac\{\d+\}\{\d+\}$/, `malformed fraction: ${latex}`);
    }
  }
});

test('rational: toLatex renders reduced form, not the input form', () => {
  assert.equal(toLatex(r(2, 4)), '\\frac{1}{2}');
  assert.equal(toLatex(r(50, 100)), '\\frac{1}{2}');
  assert.equal(toLatex(add(r(1, 6), r(1, 3))), '\\frac{1}{2}');
});

test('rational: toString is the plain-text diagnostic form', () => {
  assert.equal(ratToString(r(-1, 2)), '-1/2');
  assert.equal(ratToString(i(4)), '4');
  assert.equal(ratToString(ZERO), '0');
});

test('rational: toNumber is lossy but directionally right', () => {
  assert.equal(toNumber(r(1, 2)), 0.5);
  assert.equal(toNumber(i(-3)), -3);
  assert.equal(toNumber(ZERO), 0);
});
