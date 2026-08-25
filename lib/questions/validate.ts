/**
 * Structural and pedagogical validation of a generated question.
 *
 * `validateInstance` **never throws and never returns a bare boolean**. It
 * returns every problem it found, each with a stable code and a path into the
 * instance, because the consumer is `verify.ts` running 500 seeds unattended:
 * "seed 214 is invalid" is useless, "seed 214: choices[2] reuses the value of
 * choices[0]" is a bug report.
 *
 * The rules split into two kinds:
 * - **Structural** (rules 1, 2, 5, 6, 7, 8) — the instance is malformed or
 *   unrenderable. Almost always a coding error in the generator.
 * - **Pedagogical** (rules 3, 4) — the instance renders fine but is not a good
 *   question: duplicate options, or options a student can discard on sight.
 *   These are the ones that quietly ship if nobody checks.
 */

import {
  areEquivalent,
  areLatexIdentical,
  explainTriviality,
  type TrivialityContext,
} from './equivalence.ts';
import { type Rational, fromFraction } from './rational.ts';
import type { Generator, QuestionInstance } from './types.ts';

/**
 * Stable error codes. Never renumber or reuse one — `verify.ts` output, and
 * eventually the curation UI, group on these.
 */
export type ValidationCode =
  /** Rule 1: `choices` does not have exactly 4 entries. */
  | 'CHOICE_COUNT'
  /** Rule 1: the number of choices flagged `isCorrect` is not exactly 1. */
  | 'CORRECT_COUNT'
  /** Rule 2: an incorrect choice has no `strategyId`. */
  | 'MISSING_STRATEGY_ID'
  /** Rule 2: a `strategyId` is not among the generator's declared strategies. */
  | 'UNKNOWN_STRATEGY_ID'
  /** Rule 3: two choices have the same exact value. */
  | 'DUPLICATE_VALUE'
  /** Rule 3: two choices render to the same string. */
  | 'DUPLICATE_LATEX'
  /** Rule 4: a distractor is eliminable without doing the mathematics. */
  | 'TRIVIAL_DISTRACTOR'
  /** Rule 5: a required text field is empty or whitespace. */
  | 'EMPTY_FIELD'
  /** Rule 5: a field contains an unfilled template placeholder or a stringified bad value. */
  | 'PLACEHOLDER_LEAK'
  /** Rule 6: braces do not balance. */
  | 'UNBALANCED_BRACES'
  /** Rule 6: a `\frac` is not followed by two brace groups. */
  | 'MALFORMED_FRAC'
  /** Rule 6: an empty `{}` group. */
  | 'EMPTY_GROUP'
  /** Rule 7: the instance's `unitId` differs from the generator's. */
  | 'UNIT_MISMATCH'
  /** Rule 7: the instance's `problemTypeId` differs from the generator's. */
  | 'PROBLEM_TYPE_MISMATCH'
  /** Rule 7: the instance's `difficulty` differs from the generator's. */
  | 'DIFFICULTY_MISMATCH'
  /** Rule 7: the instance's `generatorId` differs from the generator's `id`. */
  | 'GENERATOR_ID_MISMATCH'
  /** Rule 8: fewer than two solution steps. An answer is not a worked solution. */
  | 'SOLUTION_TOO_SHORT';

/** One problem found in an instance. */
export interface ValidationError {
  /** Stable, groupable code. See `ValidationCode`. */
  code: ValidationCode;
  /** One sentence a human can act on. Names the specific values involved. */
  message: string;
  /**
   * Dotted/bracketed path into the instance, e.g. `choices[2].strategyId` or
   * `solution[0]`. `''` when the problem is with the instance as a whole.
   */
  path: string;
}

/** The outcome of validating one instance. */
export interface ValidationResult {
  /** `true` when `errors` is empty. */
  valid: boolean;
  /** Every problem found. Rules do not short-circuit — one run reports all of them. */
  errors: ValidationError[];
}

/** Tuning knobs for a single validation run. */
export interface ValidateOptions {
  /**
   * Whether zero is a legitimate result of one of this generator's declared
   * misconceptions, which suppresses the `implausible_zero` heuristic.
   *
   * Defaults to `false`. It has to be passed in rather than derived, because
   * `DistractorStrategy` carries only an id and a label — nothing a machine can
   * read to decide this. A future session may want to add a `canProduceZero`
   * flag to `DistractorStrategy`; until then, generators that legitimately emit
   * a zero distractor pass this explicitly. See HANDOFF.md, open questions.
   */
  zeroIsPlausible?: boolean;
}

/** Substrings that mean a template was rendered with a value that was never filled in. */
const PLACEHOLDER_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bundefined\b/, label: 'undefined' },
  { pattern: /\bNaN\b/, label: 'NaN' },
  { pattern: /\bnull\b/, label: 'null' },
  { pattern: /\{\{/, label: '{{' },
  { pattern: /TODO/, label: 'TODO' },
];

/**
 * Parses the LaTeX forms that `Rational.toLatex` produces, and nothing else.
 *
 * Returns `null` for anything it does not recognise — an expression like
 * `x^2 + 3x`, a surd, a coordinate pair. That is not a failure: it means the
 * value-level checks (`DUPLICATE_VALUE`, `TRIVIAL_DISTRACTOR`) cannot apply to
 * that choice, and the validator falls back to the textual checks alone.
 *
 * This exists because `Choice` deliberately carries only its rendering, and the
 * contract in `types.ts` is fixed. Parsing the rendering back is the cost of
 * keeping `Choice` a plain display type.
 */
export function parseRationalLatex(latex: string): Rational | null {
  const text = latex.replace(/\s+/g, '');
  const integer = /^(-?)(\d+)$/.exec(text);
  if (integer) {
    return fromFraction(BigInt(`${integer[1]}${integer[2]}`), BigInt(1));
  }
  const fraction = /^(-?)\\frac\{(\d+)\}\{(\d+)\}$/.exec(text);
  if (fraction) {
    const den = BigInt(fraction[3]);
    if (den === BigInt(0)) return null;
    return fromFraction(BigInt(`${fraction[1]}${fraction[2]}`), den);
  }
  return null;
}

/**
 * Checks brace balance, `\frac` arity, and empty groups in one pass.
 *
 * Escaped braces (`\{`, `\}`) are literal characters and are skipped, so a stem
 * containing set notation does not read as unbalanced.
 */
function checkLatex(latex: string, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  let depth = 0;
  let sawUnmatchedClose = false;

  for (let i = 0; i < latex.length; i += 1) {
    const char = latex[i];
    if (char === '\\') {
      // A backslash escapes the next character; \{ and \} are literals, and
      // skipping the next char also stops \\ from being read as an escape.
      i += 1;
      continue;
    }
    if (char === '{') {
      depth += 1;
      // An empty group is almost always a dropped interpolation.
      if (latex[i + 1] === '}') {
        errors.push({
          code: 'EMPTY_GROUP',
          message: `Empty {} group at index ${i} in ${path || 'instance'}. Usually a value that failed to interpolate.`,
          path,
        });
      }
    } else if (char === '}') {
      depth -= 1;
      if (depth < 0 && !sawUnmatchedClose) {
        sawUnmatchedClose = true;
        errors.push({
          code: 'UNBALANCED_BRACES',
          message: `Unmatched closing brace at index ${i} in ${path || 'instance'}.`,
          path,
        });
        depth = 0;
      }
    }
  }

  if (depth > 0) {
    errors.push({
      code: 'UNBALANCED_BRACES',
      message: `${depth} unclosed ${depth === 1 ? 'brace' : 'braces'} in ${path || 'instance'}: ${JSON.stringify(latex)}`,
      path,
    });
  }

  errors.push(...checkFracArity(latex, path));
  return errors;
}

/** Every `\frac` must be followed by exactly two balanced brace groups. */
function checkFracArity(latex: string, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const fracPattern = /\\frac/g;
  let match = fracPattern.exec(latex);
  while (match !== null) {
    let cursor = match.index + '\\frac'.length;
    let groupsFound = 0;
    for (let group = 0; group < 2; group += 1) {
      while (cursor < latex.length && /\s/.test(latex[cursor])) cursor += 1;
      if (latex[cursor] !== '{') break;
      const end = matchingBrace(latex, cursor);
      if (end === -1) break;
      cursor = end + 1;
      groupsFound += 1;
    }
    if (groupsFound < 2) {
      errors.push({
        code: 'MALFORMED_FRAC',
        message: `\\frac at index ${match.index} in ${path || 'instance'} has ${groupsFound} brace ${groupsFound === 1 ? 'argument' : 'arguments'}, needs 2.`,
        path,
      });
    }
    match = fracPattern.exec(latex);
  }
  return errors;
}

/** Index of the `}` closing the `{` at `open`, or `-1` if there is none. */
function matchingBrace(latex: string, open: number): number {
  let depth = 0;
  for (let i = open; i < latex.length; i += 1) {
    const char = latex[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Rule 5 applied to one text field. */
function checkText(value: string, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (value.trim().length === 0) {
    errors.push({
      code: 'EMPTY_FIELD',
      message: `${path || 'field'} is empty.`,
      path,
    });
    return errors;
  }
  for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
    if (pattern.test(value)) {
      errors.push({
        code: 'PLACEHOLDER_LEAK',
        message: `${path || 'field'} contains ${JSON.stringify(label)}, which means a value was never filled in: ${JSON.stringify(value)}`,
        path,
      });
    }
  }
  return errors;
}

/**
 * Validates one generated instance against the generator that produced it.
 *
 * Collects every violation rather than stopping at the first, so a single run
 * over a bad seed tells the author everything that is wrong with it. Guaranteed
 * not to throw: a malformed instance produces errors, never an exception, since
 * the caller is an unattended 500-seed sweep.
 */
export function validateInstance(
  instance: QuestionInstance,
  generator: Generator,
  options: ValidateOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const choices = Array.isArray(instance.choices) ? instance.choices : [];

  // --- Rule 1: exactly 4 choices, exactly one correct -------------------------
  if (choices.length !== 4) {
    errors.push({
      code: 'CHOICE_COUNT',
      message: `Expected exactly 4 choices, found ${choices.length}.`,
      path: 'choices',
    });
  }
  const correctIndices = choices
    .map((choice, index) => (choice?.isCorrect === true ? index : -1))
    .filter((index) => index !== -1);
  if (correctIndices.length !== 1) {
    errors.push({
      code: 'CORRECT_COUNT',
      message:
        correctIndices.length === 0
          ? 'No choice is marked isCorrect.'
          : `${correctIndices.length} choices are marked isCorrect (indices ${correctIndices.join(', ')}); exactly 1 may be.`,
      path: 'choices',
    });
  }

  // --- Rule 2: every distractor names a declared strategy ---------------------
  const declaredStrategyIds = new Set((generator.strategies ?? []).map((s) => s.id));
  choices.forEach((choice, index) => {
    if (!choice || choice.isCorrect === true) return;
    if (choice.strategyId === undefined || choice.strategyId.trim() === '') {
      errors.push({
        code: 'MISSING_STRATEGY_ID',
        message: `Incorrect choice ${index} has no strategyId. Every distractor must name the misconception that produced it.`,
        path: `choices[${index}].strategyId`,
      });
      return;
    }
    if (!declaredStrategyIds.has(choice.strategyId)) {
      errors.push({
        code: 'UNKNOWN_STRATEGY_ID',
        message: `Choice ${index} declares strategyId ${JSON.stringify(choice.strategyId)}, which generator ${JSON.stringify(generator.id)} does not declare. Known: ${[...declaredStrategyIds].join(', ') || '(none)'}.`,
        path: `choices[${index}].strategyId`,
      });
    }
  });

  // --- Rule 3: no two choices duplicate each other ----------------------------
  const parsedValues = choices.map((choice) =>
    typeof choice?.latex === 'string' ? parseRationalLatex(choice.latex) : null,
  );
  for (let a = 0; a < choices.length; a += 1) {
    for (let b = a + 1; b < choices.length; b += 1) {
      const left = choices[a];
      const right = choices[b];
      if (!left || !right) continue;
      if (typeof left.latex === 'string' && typeof right.latex === 'string') {
        if (areLatexIdentical(left.latex, right.latex)) {
          errors.push({
            code: 'DUPLICATE_LATEX',
            message: `Choices ${a} and ${b} render identically as ${JSON.stringify(left.latex)}. The question has fewer than 4 real options.`,
            path: `choices[${b}].latex`,
          });
          // Identical text is already the stronger finding; do not also report
          // the value duplication it implies.
          continue;
        }
      }
      const leftValue = parsedValues[a];
      const rightValue = parsedValues[b];
      if (leftValue && rightValue && areEquivalent(leftValue, rightValue)) {
        errors.push({
          code: 'DUPLICATE_VALUE',
          message: `Choices ${a} (${left.latex}) and ${b} (${right.latex}) are the same value written two ways.`,
          path: `choices[${b}].latex`,
        });
      }
    }
  }

  // --- Rule 4: no distractor is a giveaway ------------------------------------
  if (correctIndices.length === 1) {
    const correctValue = parsedValues[correctIndices[0]];
    if (correctValue) {
      const context: TrivialityContext = { zeroIsPlausible: options.zeroIsPlausible };
      choices.forEach((choice, index) => {
        if (!choice || choice.isCorrect === true) return;
        const value = parsedValues[index];
        // A choice that is not a plain rational is outside these heuristics'
        // competence; silence is the honest answer, not a pass or a failure.
        if (!value) return;
        const verdict = explainTriviality(correctValue, value, context);
        if (verdict.trivial) {
          errors.push({
            code: 'TRIVIAL_DISTRACTOR',
            message: `Choice ${index} (${choice.latex}) against correct answer ${choices[correctIndices[0]].latex} is eliminable without doing the mathematics [${verdict.firedHeuristicIds.join(', ')}]: ${verdict.reasons.join(' ')}`,
            path: `choices[${index}].latex`,
          });
        }
      });
    }
  }

  // --- Rule 5: required text is present and fully interpolated ----------------
  errors.push(...checkText(typeof instance.stem === 'string' ? instance.stem : '', 'stem'));
  errors.push(
    ...checkText(typeof instance.conceptTag === 'string' ? instance.conceptTag : '', 'conceptTag'),
  );
  const solution = Array.isArray(instance.solution) ? instance.solution : [];
  solution.forEach((step, index) => {
    errors.push(...checkText(typeof step === 'string' ? step : '', `solution[${index}]`));
  });
  choices.forEach((choice, index) => {
    errors.push(
      ...checkText(typeof choice?.latex === 'string' ? choice.latex : '', `choices[${index}].latex`),
    );
  });

  // --- Rule 6: the LaTeX is well formed ---------------------------------------
  if (typeof instance.stem === 'string') errors.push(...checkLatex(instance.stem, 'stem'));
  solution.forEach((step, index) => {
    if (typeof step === 'string') errors.push(...checkLatex(step, `solution[${index}]`));
  });
  choices.forEach((choice, index) => {
    if (typeof choice?.latex === 'string') {
      errors.push(...checkLatex(choice.latex, `choices[${index}].latex`));
    }
  });

  // --- Rule 7: the instance agrees with the generator that made it ------------
  if (instance.generatorId !== generator.id) {
    errors.push({
      code: 'GENERATOR_ID_MISMATCH',
      message: `Instance declares generatorId ${JSON.stringify(instance.generatorId)} but was produced by ${JSON.stringify(generator.id)}.`,
      path: 'generatorId',
    });
  }
  if (instance.unitId !== generator.unitId) {
    errors.push({
      code: 'UNIT_MISMATCH',
      message: `Instance unitId ${JSON.stringify(instance.unitId)} does not match generator unitId ${JSON.stringify(generator.unitId)}.`,
      path: 'unitId',
    });
  }
  if (instance.problemTypeId !== generator.problemTypeId) {
    errors.push({
      code: 'PROBLEM_TYPE_MISMATCH',
      message: `Instance problemTypeId ${JSON.stringify(instance.problemTypeId)} does not match generator problemTypeId ${JSON.stringify(generator.problemTypeId)}.`,
      path: 'problemTypeId',
    });
  }
  if (instance.difficulty !== generator.difficulty) {
    errors.push({
      code: 'DIFFICULTY_MISMATCH',
      message: `Instance difficulty ${String(instance.difficulty)} does not match generator difficulty ${String(generator.difficulty)}.`,
      path: 'difficulty',
    });
  }

  // --- Rule 8: a worked solution, not just an answer --------------------------
  if (solution.length < 2) {
    errors.push({
      code: 'SOLUTION_TOO_SHORT',
      message: `Solution has ${solution.length} ${solution.length === 1 ? 'step' : 'steps'}; a worked solution needs at least 2.`,
      path: 'solution',
    });
  }

  return { valid: errors.length === 0, errors };
}
