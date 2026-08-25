import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LENGTH_RATIO_LIMIT,
  MAGNITUDE_RATIO_LIMIT,
  TRIVIALITY_HEURISTICS,
  areEquivalent,
  areLatexIdentical,
  explainTriviality,
  isTriviallyDistinguishable,
  normalizeLatex,
} from './equivalence.ts';
import { ZERO, fromFraction as r, fromInt as i } from './rational.ts';

/** Runs a single named heuristic in isolation, so tests do not cross-contaminate. */
function fires(id: string, correct: Parameters<typeof isTriviallyDistinguishable>[0], distractor: Parameters<typeof isTriviallyDistinguishable>[1], context = {}): boolean {
  const heuristic = TRIVIALITY_HEURISTICS.find((h) => h.id === id);
  assert.ok(heuristic, `no heuristic named ${id}`);
  return heuristic.test(correct, distractor, context);
}

// --- areEquivalent ------------------------------------------------------------

test('equivalence: areEquivalent is exact and reduction-aware', () => {
  assert.ok(areEquivalent(r(1, 2), r(2, 4)));
  assert.ok(areEquivalent(r(-1, 2), r(1, -2)));
  assert.ok(areEquivalent(ZERO, r(0, 7)));
  assert.ok(!areEquivalent(r(1, 2), r(1, 3)));
  assert.ok(!areEquivalent(i(1), i(-1)));
});

test('equivalence: areEquivalent has no float tolerance', () => {
  // These differ by 1/10^30 — a float comparison would call them equal.
  const a = r(1, 3);
  const b = r(
    BigInt('333333333333333333333333333333'),
    BigInt('1000000000000000000000000000000'),
  );
  assert.ok(!areEquivalent(a, b));
});

// --- areLatexIdentical --------------------------------------------------------

test('equivalence: areLatexIdentical ignores whitespace differences', () => {
  assert.ok(areLatexIdentical('\\frac{1} {2}', '\\frac{1}  {2}'));
  assert.ok(areLatexIdentical('  x + 1 ', 'x + 1'));
  assert.ok(areLatexIdentical('a\n+\nb', 'a + b'));
  assert.ok(areLatexIdentical('', '   '));
});

test('equivalence: areLatexIdentical collapses runs, it does not delete whitespace', () => {
  // Documented limit: spacing is normalized, not removed. '\\frac{1} {2}' and
  // '\\frac{1}{2}' render alike but do not compare equal here. In practice both
  // sides come from Rational.toLatex, so real duplicates are byte-identical, and
  // value-level duplicates are caught by areEquivalent instead.
  assert.ok(!areLatexIdentical('\\frac{1}{2}', '\\frac{1} {2}'));
  // Removing whitespace outright would wrongly merge distinct prose.
  assert.ok(!areLatexIdentical('a b', 'ab'));
});

test('equivalence: areLatexIdentical still separates genuinely different strings', () => {
  assert.ok(!areLatexIdentical('\\frac{1}{2}', '\\frac{1}{3}'));
  assert.ok(!areLatexIdentical('x^2', 'x^{2}'), 'must not pretend to be a LaTeX normalizer');
  assert.ok(!areLatexIdentical('-3', '3'));
});

test('equivalence: normalizeLatex collapses runs and trims', () => {
  assert.equal(normalizeLatex('  a   b  '), 'a b');
  assert.equal(normalizeLatex('a\t\tb'), 'a b');
});

// --- heuristic: implausible_zero ----------------------------------------------

test('equivalence: implausible_zero fires on a lone zero distractor', () => {
  assert.ok(fires('implausible_zero', i(7), ZERO));
  assert.ok(fires('implausible_zero', r(-1, 2), ZERO));
});

test('equivalence: implausible_zero does not fire when zero is a declared outcome', () => {
  assert.ok(!fires('implausible_zero', i(7), ZERO, { zeroIsPlausible: true }));
});

test('equivalence: implausible_zero does not fire when the correct answer is itself zero', () => {
  assert.ok(!fires('implausible_zero', ZERO, ZERO));
  assert.ok(!fires('implausible_zero', ZERO, i(5)));
});

test('equivalence: implausible_zero ignores non-zero distractors', () => {
  assert.ok(!fires('implausible_zero', i(7), i(8)));
});

// --- heuristic: magnitude_gap -------------------------------------------------

test('equivalence: magnitude_gap fires past the ratio limit in both directions', () => {
  assert.ok(fires('magnitude_gap', i(1), i(MAGNITUDE_RATIO_LIMIT + 1)));
  assert.ok(fires('magnitude_gap', i(MAGNITUDE_RATIO_LIMIT + 1), i(1)));
  assert.ok(fires('magnitude_gap', i(2), i(1000)));
});

test('equivalence: magnitude_gap does not fire exactly at the limit', () => {
  // "more than 100x" — 100x itself is allowed.
  assert.ok(!fires('magnitude_gap', i(1), i(MAGNITUDE_RATIO_LIMIT)));
  assert.ok(!fires('magnitude_gap', i(MAGNITUDE_RATIO_LIMIT), i(1)));
});

test('equivalence: magnitude_gap ignores sign, only scale', () => {
  assert.ok(!fires('magnitude_gap', i(5), i(-5)));
  assert.ok(!fires('magnitude_gap', i(5), i(-10)));
  assert.ok(fires('magnitude_gap', i(5), i(-5000)));
});

test('equivalence: magnitude_gap leaves zero to the zero heuristic', () => {
  assert.ok(!fires('magnitude_gap', i(500), ZERO));
  assert.ok(!fires('magnitude_gap', ZERO, i(500)));
});

test('equivalence: magnitude_gap works on fractions', () => {
  assert.ok(fires('magnitude_gap', r(1, 1000), i(1)));
  assert.ok(!fires('magnitude_gap', r(1, 2), r(1, 3)));
});

// --- heuristic: length_gap ----------------------------------------------------

test('equivalence: length_gap fires when the rendering is far longer', () => {
  // 1 digit vs LENGTH_RATIO_LIMIT + 1 digits.
  const tooLong = Number('1'.repeat(LENGTH_RATIO_LIMIT + 1));
  assert.ok(fires('length_gap', i(1), i(tooLong)));
});

test('equivalence: length_gap does not fire exactly at the limit', () => {
  // 1 digit vs exactly LENGTH_RATIO_LIMIT digits: the limit itself is allowed.
  const atLimit = Number('1'.repeat(LENGTH_RATIO_LIMIT));
  assert.ok(!fires('length_gap', i(1), i(atLimit)));
});

test('equivalence: length_gap counts digits, not LaTeX markup', () => {
  // \frac{1}{2} is 11 markup characters but 2 digits; against the integer 5
  // (1 digit) it must not fire, or every fraction would be flagged.
  assert.ok(!fires('length_gap', i(5), r(1, 2)));
  assert.ok(!fires('length_gap', r(1, 2), i(5)));
});

test('equivalence: length_gap is not symmetric — a shorter distractor is fine', () => {
  assert.ok(!fires('length_gap', i(1234), i(1)));
});

// --- the combined API ---------------------------------------------------------

test('equivalence: isTriviallyDistinguishable agrees with explainTriviality', () => {
  for (const [correct, distractor] of [
    [i(7), ZERO],
    [i(1), i(100000)],
    [i(5), i(6)],
    [r(1, 2), r(1, 3)],
  ] as const) {
    assert.equal(
      isTriviallyDistinguishable(correct, distractor),
      explainTriviality(correct, distractor).trivial,
    );
  }
});

test('equivalence: a plausible distractor is not flagged', () => {
  assert.ok(!isTriviallyDistinguishable(i(6), i(-6)));
  assert.ok(!isTriviallyDistinguishable(i(6), i(7)));
  assert.ok(!isTriviallyDistinguishable(r(3, 4), r(4, 3)));
  assert.ok(!isTriviallyDistinguishable(i(-12), i(12)));
});

test('equivalence: explainTriviality names every heuristic that fired', () => {
  // 1 vs 100000: both magnitude (100000x) and length (6 digits vs 1) fire.
  const verdict = explainTriviality(i(1), i(100000));
  assert.ok(verdict.trivial);
  assert.deepEqual(verdict.firedHeuristicIds, ['magnitude_gap', 'length_gap']);
  assert.equal(verdict.reasons.length, 2);
  assert.ok(verdict.reasons.every((reason) => reason.length > 0));
});

test('equivalence: a clean distractor reports no fired heuristics', () => {
  const verdict = explainTriviality(i(6), i(-6));
  assert.equal(verdict.trivial, false);
  assert.deepEqual(verdict.firedHeuristicIds, []);
  assert.deepEqual(verdict.reasons, []);
});

// --- the registry itself ------------------------------------------------------

test('equivalence: heuristics are individually toggleable', () => {
  const zeroHeuristic = TRIVIALITY_HEURISTICS.find((h) => h.id === 'implausible_zero');
  assert.ok(zeroHeuristic);
  assert.ok(isTriviallyDistinguishable(i(7), ZERO));
  zeroHeuristic.enabled = false;
  try {
    assert.ok(!isTriviallyDistinguishable(i(7), ZERO), 'disabling a heuristic must stop it firing');
  } finally {
    zeroHeuristic.enabled = true;
  }
  assert.ok(isTriviallyDistinguishable(i(7), ZERO), 're-enabling must restore it');
});

test('equivalence: every heuristic is named, described, and on by default', () => {
  assert.deepEqual(
    TRIVIALITY_HEURISTICS.map((h) => h.id),
    ['implausible_zero', 'magnitude_gap', 'length_gap'],
  );
  const ids = new Set(TRIVIALITY_HEURISTICS.map((h) => h.id));
  assert.equal(ids.size, TRIVIALITY_HEURISTICS.length, 'heuristic ids must be unique');
  for (const heuristic of TRIVIALITY_HEURISTICS) {
    assert.match(heuristic.id, /^[a-z0-9]+(_[a-z0-9]+)*$/, `${heuristic.id} is not snake_case`);
    assert.ok(heuristic.description.length > 20, `${heuristic.id} needs a real description`);
    assert.equal(heuristic.enabled, true);
  }
});
