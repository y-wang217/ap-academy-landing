import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CROSS_KIND_EPSILON,
  approx,
  canonicalize,
  compareValues,
  isZeroValue,
  qFraction,
  qInt,
  qLog,
  qOpaque,
  qPi,
  qPower,
  qRational,
  qSet,
  qSpecial,
  qSurd,
  toDebugString,
  toLatex,
  valuesEqual,
  type QValue,
} from './value.ts';
import { fromFraction as r, fromInt as i } from './rational.ts';

/** Every kind, for sweeps that must hold universally. */
const ONE_OF_EACH: QValue[] = [
  qInt(0),
  qInt(7),
  qFraction(-3, 4),
  qSurd(i(2), 3),
  qSurd(r(1, 2), 5),
  qPi(r(1, 3)),
  qPi(i(-2)),
  qLog(i(2), i(5)),
  qPower(i(2), r(1, 2)),
  qSet([qInt(1), qPi(r(1, 6))]),
  qSpecial('no-solution'),
  qSpecial('all-reals'),
  qSpecial('undefined'),
  qOpaque('x + \\sqrt{y}', 3.5),
];

// --- canonicalize: surds ------------------------------------------------------

test('value: a surd with radicand 1 becomes a rational', () => {
  assert.deepEqual(canonicalize(qSurd(i(5), 1)), qRational(i(5)));
  assert.deepEqual(canonicalize(qSurd(r(-1, 2), 1)), qRational(r(-1, 2)));
});

test('value: a surd with a perfect-square radicand becomes a rational', () => {
  assert.deepEqual(canonicalize(qSurd(i(1), 9)), qRational(i(3)));
  assert.deepEqual(canonicalize(qSurd(i(2), 16)), qRational(i(8)));
  assert.deepEqual(canonicalize(qSurd(i(-1), 25)), qRational(i(-5)));
});

test('value: a surd extracts its square factor', () => {
  // sqrt(12) = 2 sqrt(3)
  assert.deepEqual(canonicalize(qSurd(i(1), 12)), { kind: 'surd', coeff: i(2), radicand: BigInt(3) });
  // 3 sqrt(8) = 6 sqrt(2)
  assert.deepEqual(canonicalize(qSurd(i(3), 8)), { kind: 'surd', coeff: i(6), radicand: BigInt(2) });
  // sqrt(72) = 6 sqrt(2)
  assert.deepEqual(canonicalize(qSurd(i(1), 72)), { kind: 'surd', coeff: i(6), radicand: BigInt(2) });
});

test('value: sqrt(12) and 2 sqrt(3) are the same value', () => {
  assert.ok(valuesEqual(qSurd(i(1), 12), qSurd(i(2), 3)));
  assert.ok(valuesEqual(qSurd(i(1), 8), qSurd(i(2), 2)));
});

test('value: a surd with a zero coefficient or zero radicand is zero', () => {
  assert.deepEqual(canonicalize(qSurd(i(0), 7)), qRational(i(0)));
  assert.deepEqual(canonicalize(qSurd(i(3), 0)), qRational(i(0)));
});

test('value: a negative radicand throws', () => {
  assert.throws(() => canonicalize(qSurd(i(1), -4)), RangeError);
});

test('value: a square-free surd is left alone', () => {
  const surd = qSurd(i(3), 7);
  assert.deepEqual(canonicalize(surd), surd);
});

// --- canonicalize: pi ---------------------------------------------------------

test('value: a pi multiple with coefficient 0 becomes rational zero', () => {
  assert.deepEqual(canonicalize(qPi(i(0))), qRational(i(0)));
  assert.ok(isZeroValue(qPi(i(0))));
});

test('value: a non-zero pi multiple stays symbolic', () => {
  const value = qPi(r(1, 3));
  assert.deepEqual(canonicalize(value), value);
  // It must NOT become the float 1.0471975511965976.
  assert.equal(toLatex(value), '\\frac{\\pi}{3}');
});

// --- canonicalize: logs -------------------------------------------------------

test('value: log of 1 is zero in any base', () => {
  assert.deepEqual(canonicalize(qLog(i(2), i(1))), qRational(i(0)));
  assert.deepEqual(canonicalize(qLog(i(10), i(1))), qRational(i(0)));
});

test('value: an exact integer power collapses the log', () => {
  assert.deepEqual(canonicalize(qLog(i(2), i(8))), qRational(i(3)));
  assert.deepEqual(canonicalize(qLog(i(3), i(81))), qRational(i(4)));
  assert.deepEqual(canonicalize(qLog(i(5), i(5))), qRational(i(1)));
  assert.deepEqual(canonicalize(qLog(i(10), i(1000))), qRational(i(3)));
});

test('value: log_2 8 and 3 do not ship as two different choices', () => {
  assert.ok(valuesEqual(qLog(i(2), i(8)), qInt(3)));
});

test('value: a log that is not an exact power stays symbolic', () => {
  const value = qLog(i(2), i(5));
  assert.deepEqual(canonicalize(value), value);
});

test('value: an invalid log base or argument throws', () => {
  assert.throws(() => canonicalize(qLog(i(1), i(5))), RangeError);
  assert.throws(() => canonicalize(qLog(i(0), i(5))), RangeError);
  assert.throws(() => canonicalize(qLog(i(-2), i(5))), RangeError);
  assert.throws(() => canonicalize(qLog(i(2), i(0))), RangeError);
  assert.throws(() => canonicalize(qLog(i(2), i(-5))), RangeError);
});

// --- canonicalize: powers -----------------------------------------------------

test('value: an integer exponent collapses to a rational', () => {
  assert.deepEqual(canonicalize(qPower(i(2), i(3))), qRational(i(8)));
  assert.deepEqual(canonicalize(qPower(i(5), i(-2))), qRational(r(1, 25)));
  assert.deepEqual(canonicalize(qPower(r(2, 3), i(2))), qRational(r(4, 9)));
});

test('value: 2^3 and 8 do not ship as two different choices', () => {
  assert.ok(valuesEqual(qPower(i(2), i(3)), qInt(8)));
});

test('value: exponent zero is one, base one is one', () => {
  assert.deepEqual(canonicalize(qPower(i(7), i(0))), qRational(i(1)));
  assert.deepEqual(canonicalize(qPower(i(1), r(1, 2))), qRational(i(1)));
});

test('value: zero base behaves', () => {
  assert.deepEqual(canonicalize(qPower(i(0), i(3))), qRational(i(0)));
  assert.throws(() => canonicalize(qPower(i(0), i(0))), RangeError);
  assert.throws(() => canonicalize(qPower(i(0), i(-1))), RangeError);
});

test('value: a fractional exponent stays symbolic', () => {
  const value = qPower(i(2), r(1, 2));
  assert.deepEqual(canonicalize(value), value);
});

// --- canonicalize: sets -------------------------------------------------------

test('value: set members are sorted, so member order does not matter', () => {
  assert.ok(valuesEqual(qSet([qInt(3), qInt(1), qInt(2)]), qSet([qInt(1), qInt(2), qInt(3)])));
  assert.ok(valuesEqual(qSet([qPi(r(5, 6)), qPi(r(1, 6))]), qSet([qPi(r(1, 6)), qPi(r(5, 6))])));
});

test('value: set members are de-duplicated', () => {
  const canonical = canonicalize(qSet([qInt(2), qInt(2), qFraction(4, 2)]));
  assert.equal(canonical.kind, 'set');
  assert.equal(canonical.kind === 'set' && canonical.members.length, 1);
});

test('value: de-duplication works across kinds within a set', () => {
  // sqrt(4) is 2; the set has one member, not two.
  const canonical = canonicalize(qSet([qInt(2), qSurd(i(1), 4)]));
  assert.equal(canonical.kind === 'set' && canonical.members.length, 1);
});

test('value: set members are canonicalized in place', () => {
  const canonical = canonicalize(qSet([qSurd(i(1), 12)]));
  assert.deepEqual(canonical, { kind: 'set', members: [{ kind: 'surd', coeff: i(2), radicand: BigInt(3) }] });
});

test('value: sets of different sizes are not equal', () => {
  assert.ok(!valuesEqual(qSet([qInt(1), qInt(2)]), qSet([qInt(1)])));
});

test('value: sets with different members are not equal', () => {
  assert.ok(!valuesEqual(qSet([qInt(1), qInt(2)]), qSet([qInt(1), qInt(3)])));
});

test('value: an empty set is a legitimate value and equals itself', () => {
  assert.ok(valuesEqual(qSet([]), qSet([])));
  assert.ok(!valuesEqual(qSet([]), qSet([qInt(1)])));
});

test('value: a set is never equal to a scalar, even when the sums agree', () => {
  // approx({1, 2}) is 3 by construction; that must not make it equal to 3.
  assert.ok(!valuesEqual(qSet([qInt(1), qInt(2)]), qInt(3)));
});

// --- canonicalize: specials and opaque ----------------------------------------

test('value: specials equal only themselves', () => {
  assert.ok(valuesEqual(qSpecial('no-solution'), qSpecial('no-solution')));
  assert.ok(!valuesEqual(qSpecial('no-solution'), qSpecial('all-reals')));
  assert.ok(!valuesEqual(qSpecial('no-solution'), qInt(0)));
  assert.ok(!valuesEqual(qSpecial('undefined'), qSet([])));
});

test('value: opaque values compare on their canonical string only', () => {
  assert.ok(valuesEqual(qOpaque('x + 1', 2), qOpaque('x + 1', 2)));
  assert.ok(!valuesEqual(qOpaque('x + 1', 2), qOpaque('x + 2', 3)));
});

// --- idempotency --------------------------------------------------------------

test('value: canonicalize is idempotent for every kind', () => {
  const extras: QValue[] = [
    qSurd(i(1), 12),
    qSurd(i(1), 16),
    qPi(i(0)),
    qLog(i(2), i(8)),
    qLog(i(2), i(1)),
    qPower(i(2), i(3)),
    qPower(i(7), i(0)),
    qSet([qInt(3), qInt(1), qSurd(i(1), 12), qInt(1)]),
    qSet([]),
  ];
  for (const value of [...ONE_OF_EACH, ...extras]) {
    const once = canonicalize(value);
    const twice = canonicalize(once);
    assert.deepEqual(twice, once, `not idempotent for ${toDebugString(value)}`);
  }
});

test('value: canonicalize is idempotent through nested sets', () => {
  const nested = qSet([qSet([qInt(2), qSurd(i(1), 4)]), qSet([qInt(1)])]);
  assert.deepEqual(canonicalize(canonicalize(nested)), canonicalize(nested));
});

// --- valuesEqual --------------------------------------------------------------

test('value: equality within a kind is exact, not approximate', () => {
  assert.ok(valuesEqual(qFraction(1, 2), qFraction(2, 4)));
  assert.ok(!valuesEqual(qFraction(1, 3), qFraction(33333, 100000)));
  assert.ok(valuesEqual(qPi(r(1, 2)), qPi(r(2, 4))));
  assert.ok(!valuesEqual(qPi(r(1, 3)), qPi(r(1, 4))));
  assert.ok(valuesEqual(qSurd(i(2), 3), qSurd(r(4, 2), 3)));
  assert.ok(!valuesEqual(qSurd(i(2), 3), qSurd(i(2), 5)));
});

test('value: cross-kind comparison flags a genuine numeric collision', () => {
  // An opaque value that happens to equal 3 must be caught against the integer 3.
  assert.ok(valuesEqual(qOpaque('\\text{three}', 3), qInt(3)));
});

test('value: cross-kind comparison does not merge genuinely different numbers', () => {
  assert.ok(!valuesEqual(qPi(r(1, 3)), qInt(1)));
  assert.ok(!valuesEqual(qSurd(i(1), 2), qFraction(3, 2)));
});

test('value: the cross-kind epsilon is tight', () => {
  assert.ok(valuesEqual(qOpaque('a', 1), qOpaque('a', 1)));
  const justInside = qOpaque('near', 3 + CROSS_KIND_EPSILON / 10);
  const justOutside = qOpaque('far', 3 + CROSS_KIND_EPSILON * 10);
  assert.ok(valuesEqual(justInside, qInt(3)));
  assert.ok(!valuesEqual(justOutside, qInt(3)));
});

test('value: equality is reflexive and symmetric across every kind', () => {
  for (const value of ONE_OF_EACH) {
    assert.ok(valuesEqual(value, value), `not reflexive: ${toDebugString(value)}`);
  }
  for (const a of ONE_OF_EACH) {
    for (const b of ONE_OF_EACH) {
      assert.equal(
        valuesEqual(a, b),
        valuesEqual(b, a),
        `not symmetric: ${toDebugString(a)} vs ${toDebugString(b)}`,
      );
    }
  }
});

test('value: distinct sample values stay distinct', () => {
  for (let a = 0; a < ONE_OF_EACH.length; a += 1) {
    for (let b = a + 1; b < ONE_OF_EACH.length; b += 1) {
      assert.ok(
        !valuesEqual(ONE_OF_EACH[a], ONE_OF_EACH[b]),
        `${toDebugString(ONE_OF_EACH[a])} wrongly equals ${toDebugString(ONE_OF_EACH[b])}`,
      );
    }
  }
});

// --- approx -------------------------------------------------------------------

test('value: approx is directionally right for each kind', () => {
  assert.equal(approx(qFraction(1, 2)), 0.5);
  assert.ok(Math.abs(approx(qPi(i(1))) - Math.PI) < 1e-12);
  assert.ok(Math.abs(approx(qSurd(i(2), 3)) - 2 * Math.sqrt(3)) < 1e-12);
  assert.ok(Math.abs(approx(qLog(i(2), i(8))) - 3) < 1e-12);
  assert.ok(Math.abs(approx(qPower(i(2), r(1, 2))) - Math.SQRT2) < 1e-12);
  assert.equal(approx(qSet([qInt(1), qInt(2)])), 3);
  assert.ok(Number.isNaN(approx(qSpecial('no-solution'))));
  assert.equal(approx(qOpaque('x', 4.25)), 4.25);
});

test('value: compareValues orders by magnitude', () => {
  assert.equal(compareValues(qInt(1), qInt(2)), -1);
  assert.equal(compareValues(qInt(2), qInt(1)), 1);
  assert.equal(compareValues(qFraction(2, 4), qFraction(1, 2)), 0);
  assert.equal(compareValues(qPi(r(1, 6)), qPi(r(5, 6))), -1);
});

// --- isZeroValue --------------------------------------------------------------

test('value: isZeroValue sees through canonicalization', () => {
  assert.ok(isZeroValue(qInt(0)));
  assert.ok(isZeroValue(qPi(i(0))));
  assert.ok(isZeroValue(qSurd(i(0), 7)));
  assert.ok(isZeroValue(qSurd(i(3), 0)));
  assert.ok(isZeroValue(qLog(i(2), i(1))));
  assert.ok(!isZeroValue(qInt(1)));
  assert.ok(!isZeroValue(qPi(r(1, 3))));
  assert.ok(!isZeroValue(qSpecial('no-solution')));
});

// --- toLatex ------------------------------------------------------------------

test('value: rationals render with the minus outside the fraction', () => {
  assert.equal(toLatex(qInt(0)), '0');
  assert.equal(toLatex(qInt(-7)), '-7');
  assert.equal(toLatex(qFraction(1, 2)), '\\frac{1}{2}');
  assert.equal(toLatex(qFraction(-1, 2)), '-\\frac{1}{2}');
  assert.equal(toLatex(qFraction(1, -2)), '-\\frac{1}{2}');
});

test('value: pi multiples render the way they are written by hand', () => {
  assert.equal(toLatex(qPi(i(1))), '\\pi');
  assert.equal(toLatex(qPi(i(-1))), '-\\pi');
  assert.equal(toLatex(qPi(i(2))), '2\\pi');
  assert.equal(toLatex(qPi(r(1, 3))), '\\frac{\\pi}{3}');
  assert.equal(toLatex(qPi(r(2, 3))), '\\frac{2\\pi}{3}');
  assert.equal(toLatex(qPi(r(-1, 3))), '-\\frac{\\pi}{3}');
  assert.equal(toLatex(qPi(r(-5, 6))), '-\\frac{5\\pi}{6}');
});

test('value: surds render with the coefficient folded in', () => {
  assert.equal(toLatex(qSurd(i(1), 3)), '\\sqrt{3}');
  assert.equal(toLatex(qSurd(i(-1), 3)), '-\\sqrt{3}');
  assert.equal(toLatex(qSurd(i(2), 3)), '2\\sqrt{3}');
  assert.equal(toLatex(qSurd(i(1), 12)), '2\\sqrt{3}');
  assert.equal(toLatex(qSurd(r(1, 2), 3)), '\\frac{\\sqrt{3}}{2}');
  assert.equal(toLatex(qSurd(r(-3, 2), 5)), '-\\frac{3\\sqrt{5}}{2}');
});

test('value: logs and powers render readably', () => {
  assert.equal(toLatex(qLog(i(2), i(5))), '\\log_{2}\\left(5\\right)');
  assert.equal(toLatex(qPower(i(2), r(1, 2))), '2^{\\frac{1}{2}}');
  assert.equal(toLatex(qPower(r(1, 2), r(1, 3))), '\\left(\\frac{1}{2}\\right)^{\\frac{1}{3}}');
});

test('value: sets render with escaped braces', () => {
  assert.equal(toLatex(qSet([qInt(1), qInt(2)])), '\\{1, 2\\}');
  assert.equal(toLatex(qSet([qPi(r(1, 6)), qPi(r(5, 6))])), '\\{\\frac{\\pi}{6}, \\frac{5\\pi}{6}\\}');
  assert.equal(toLatex(qSet([])), '\\{\\}');
});

test('value: sets render in canonical order regardless of construction order', () => {
  assert.equal(
    toLatex(qSet([qPi(r(5, 6)), qPi(r(1, 6))])),
    toLatex(qSet([qPi(r(1, 6)), qPi(r(5, 6))])),
  );
});

test('value: specials render as text', () => {
  assert.equal(toLatex(qSpecial('no-solution')), '\\text{no solution}');
  assert.equal(toLatex(qSpecial('all-reals')), '\\mathbb{R}');
  assert.equal(toLatex(qSpecial('undefined')), '\\text{undefined}');
});

test('value: toLatex renders the canonical form, not the input form', () => {
  assert.equal(toLatex(qSurd(i(1), 16)), '4');
  assert.equal(toLatex(qLog(i(2), i(8))), '3');
  assert.equal(toLatex(qPower(i(2), i(3))), '8');
  assert.equal(toLatex(qPi(i(0))), '0');
});

test('value: every rendering has balanced braces', () => {
  for (const value of ONE_OF_EACH) {
    const latex = toLatex(value);
    let depth = 0;
    for (let index = 0; index < latex.length; index += 1) {
      if (latex[index] === '\\') { index += 1; continue; }
      if (latex[index] === '{') depth += 1;
      if (latex[index] === '}') depth -= 1;
      assert.ok(depth >= 0, `unbalanced in ${latex}`);
    }
    assert.equal(depth, 0, `unbalanced in ${latex}`);
  }
});

test('value: equal values always render identically', () => {
  const pairs: [QValue, QValue][] = [
    [qSurd(i(1), 12), qSurd(i(2), 3)],
    [qFraction(2, 4), qFraction(1, 2)],
    [qLog(i(2), i(8)), qInt(3)],
    [qPower(i(2), i(3)), qInt(8)],
    [qSet([qInt(2), qInt(1)]), qSet([qInt(1), qInt(2)])],
  ];
  for (const [a, b] of pairs) {
    assert.ok(valuesEqual(a, b));
    assert.equal(toLatex(a), toLatex(b), `${toDebugString(a)} and ${toDebugString(b)} render differently`);
  }
});
