import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, checkBlank, parseRationalEntry } from './check.ts';
import { fromFraction, fromInt, toString as ratToString } from '../questions/rational.ts';
import { factorTheoremFindK } from '../questions/generators/mhf4u/u3-factor-theorem-find-k.ts';
import type { Blank } from './types.ts';

const half: Blank = { kind: 'rational', prompt: '?', answer: fromFraction(1, 2), hint: 'h' };
const third: Blank = { kind: 'rational', prompt: '?', answer: fromFraction(1, 3), hint: 'h' };
const minus24: Blank = { kind: 'rational', prompt: '?', answer: fromInt(-24), hint: 'h' };

// --- rational ------------------------------------------------------------------

test('rational: 1/2 equals 0.5 equals 2/4', () => {
  for (const entered of ['1/2', '0.5', '2/4', '.5', ' 1 / 2 ', '0.500', '+0.5', '4/8']) {
    assert.equal(checkBlank(half, entered), true, `rejected ${JSON.stringify(entered)}`);
  }
});

test('rational: 0.333 does not equal 1/3', () => {
  assert.equal(checkBlank(third, '0.333'), false);
  assert.equal(checkBlank(third, '1/3'), true);
  assert.equal(checkBlank(third, '2/6'), true);
});

test('rational: integers, negatives, and sign errors', () => {
  assert.equal(checkBlank(minus24, '-24'), true);
  assert.equal(checkBlank(minus24, '-24.0'), true);
  assert.equal(checkBlank(minus24, '-48/2'), true);
  assert.equal(checkBlank(minus24, '24'), false);
  assert.equal(checkBlank(minus24, '-23'), false);
});

test('rational: rejects what it cannot parse rather than throwing', () => {
  for (const entered of ['', '   ', 'abc', '1/0', '0.3333', '1/2/3', '\\frac{1}{2}', '1e3', '.', '2x', '1 1/2']) {
    assert.doesNotThrow(() => checkBlank(half, entered));
    assert.equal(checkBlank(half, entered), false, `accepted ${JSON.stringify(entered)}`);
  }
});

test('parseRationalEntry: decimal places are exact, not float', () => {
  const parsed = parseRationalEntry('0.125');
  assert.ok(parsed);
  assert.equal(ratToString(parsed), '1/8');
  assert.equal(ratToString(parseRationalEntry('-.25')!), '-1/4');
  assert.equal(ratToString(parseRationalEntry('3.')!), '3');
  assert.equal(ratToString(parseRationalEntry('007')!), '7');
  assert.equal(parseRationalEntry('0.1234'), null);
});

// --- choice --------------------------------------------------------------------

test('choice: compares an index', () => {
  const blank: Blank = { kind: 'choice', prompt: '?', options: ['0', '24', '-24', '48'], answer: 2, hint: 'h' };
  assert.equal(checkBlank(blank, '2'), true);
  assert.equal(checkBlank(blank, ' 2 '), true);
  assert.equal(checkBlank(blank, '0'), false);
  assert.equal(checkBlank(blank, '-24'), false, 'the option text is not the entry; the index is');
  assert.equal(checkBlank(blank, 'B'), false);
  assert.equal(checkBlank(blank, ''), false);
});

// --- exact ---------------------------------------------------------------------

test('exact: compares after whitespace normalization only', () => {
  const blank: Blank = { kind: 'exact', prompt: '?', answer: '\\frac{1}{2}', hint: 'h' };
  assert.equal(checkBlank(blank, '\\frac{1}{2}'), true);
  assert.equal(checkBlank(blank, '  \\frac{1}{2}  '), true);
  assert.equal(checkBlank(blank, '\\frac{1}{2}   '), true);
  assert.equal(checkBlank(blank, '0.5'), false, 'exact is not rational');
  assert.equal(checkBlank(blank, '\\frac{2}{4}'), false);
  assert.equal(checkBlank(blank, ''), false);
});

test('exact: a run of spaces collapses to one space, so "a  b" equals "a b"', () => {
  const blank: Blank = { kind: 'exact', prompt: '?', answer: 'x = 2 \\text{ or } x = -3', hint: 'h' };
  assert.equal(checkBlank(blank, 'x = 2   \\text{ or }  x = -3'), true);
  assert.equal(checkBlank(blank, 'x=2 \\text{ or } x=-3'), false, 'no algebraic normalization');
});

// --- checkAnswer ---------------------------------------------------------------

test('checkAnswer: the index of the correct choice, and nothing else', () => {
  const instance = factorTheoremFindK.generate(0);
  const correctIndex = instance.choices.findIndex((c) => c.isCorrect);
  assert.ok(correctIndex >= 0);
  assert.equal(checkAnswer(instance, String(correctIndex)), true);
  for (let i = 0; i < instance.choices.length; i += 1) {
    if (i !== correctIndex) assert.equal(checkAnswer(instance, String(i)), false);
  }
  assert.equal(checkAnswer(instance, '4'), false);
  assert.equal(checkAnswer(instance, '-1'), false);
  assert.equal(checkAnswer(instance, instance.choices[correctIndex].latex), false, 'value text is not accepted; the index is');
  assert.equal(checkAnswer(instance, ''), false);
});
