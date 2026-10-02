/**
 * Answer checking for blanks and for Solo final answers.
 *
 * Three kinds and nothing else:
 * - `rational`: the entry is parsed as an integer, `a/b`, or a decimal with at
 *   most `MAX_DECIMAL_PLACES` places, then compared exactly with
 *   `areEquivalent`. `1/2`, `0.5` and `2/4` are the same answer; `0.333` is
 *   not `1/3`, because it is not.
 * - `choice`: the entry is an index into the options.
 * - `exact`: the entry equals the answer after `normalizeLatex`.
 *
 * Free-form algebra is out of scope. A step whose answer would need it is
 * narration, and the check moves to the next step that can be checked.
 *
 * Every function here is pure and never throws on student input: a malformed
 * entry is simply wrong.
 */

import { areEquivalent, normalizeLatex } from '../questions/equivalence.ts';
import { type Rational, fromFraction, fromInt } from '../questions/rational.ts';
import type { QuestionInstance } from '../questions/types.ts';
import type { Blank } from './types.ts';
import { MAX_DECIMAL_PLACES } from './tuning.ts';

/** `-12`, `+3`, `007`. */
const INTEGER = /^[+-]?\d+$/;
/** `1/2`, `-3/4`, ` 6 / 8 `. Whitespace around the slash is tolerated. */
const FRACTION = /^([+-]?\d+)\s*\/\s*(\d+)$/;
/** `0.5`, `-.25`, `3.` (a trailing dot is a whole number). */
const DECIMAL = /^([+-]?)(\d*)\.(\d*)$/;

/**
 * Parses what a student typed into an exact rational, or `null` if it is not
 * one of the accepted forms.
 *
 * Accepted: an integer, `a/b` with a non-zero denominator, or a decimal with
 * at most `MAX_DECIMAL_PLACES` digits after the point. Nothing else: no
 * `\frac`, no mixed numbers, no exponents, no letters. Those are not what a
 * blank asks for, and accepting them would mean guessing at intent.
 */
export function parseRationalEntry(entered: string): Rational | null {
  const text = entered.trim().replace(/\s+/g, ' ');
  if (text === '') return null;

  if (INTEGER.test(text)) {
    return fromInt(Number.parseInt(text, 10));
  }

  const fraction = FRACTION.exec(text);
  if (fraction) {
    const den = Number.parseInt(fraction[2], 10);
    if (den === 0) return null;
    return fromFraction(Number.parseInt(fraction[1], 10), den);
  }

  const decimal = DECIMAL.exec(text);
  if (decimal) {
    const [, sign, whole, places] = decimal;
    if (whole === '' && places === '') return null;
    if (places.length > MAX_DECIMAL_PLACES) return null;
    const digits = `${whole === '' ? '0' : whole}${places}`;
    const value = fromFraction(Number.parseInt(digits, 10), 10 ** places.length);
    return sign === '-' ? fromFraction(-value.num, value.den) : value;
  }

  return null;
}

/**
 * Whether `entered` is the right answer to `blank`.
 *
 * One arm per kind. A kind this switch does not know is a type error at
 * compile time, not a silent `false` at run time.
 */
export function checkBlank(blank: Blank, entered: string): boolean {
  switch (blank.kind) {
    case 'rational': {
      const value = parseRationalEntry(entered);
      return value !== null && areEquivalent(value, blank.answer);
    }
    case 'choice': {
      const text = entered.trim();
      if (!INTEGER.test(text)) return false;
      return Number.parseInt(text, 10) === blank.answer;
    }
    case 'exact':
      return normalizeLatex(entered) === normalizeLatex(blank.answer);
  }
}

/**
 * Whether `entered` is the right answer to a generated question, for Solo.
 *
 * The entry is the index of the chosen option, as a string, matching how
 * `choice` blanks are entered. Solo questions are four-option multiple choice
 * throughout Stage 0 because that is what every generator produces; a typed
 * numeric answer against `choices[i].value` is a later addition, not a
 * different function.
 */
export function checkAnswer(instance: QuestionInstance, entered: string): boolean {
  const text = entered.trim();
  if (!INTEGER.test(text)) return false;
  const index = Number.parseInt(text, 10);
  const choice = instance.choices[index];
  return choice !== undefined && choice.isCorrect === true;
}
