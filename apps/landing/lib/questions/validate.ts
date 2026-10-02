/**
 * Structural and pedagogical validation of a generated question.
 *
 * `validateInstance` **never throws and never returns a bare boolean**. It
 * returns every problem it found, each with a stable code, a severity, and a
 * path into the instance, because the consumer is `verify.ts` running 500 seeds
 * unattended: "seed 214 is invalid" is useless, "seed 214: choices[2] has the
 * same value as choices[0]" is a bug report.
 *
 * Findings come in two severities:
 * - **error** — the question must not ship. Malformed structure, duplicate
 *   options, a distractor that gives the answer away. Fails the sweep.
 * - **warning** — worth a human's attention but not disqualifying. Currently
 *   only `VALUE_LATEX_MISMATCH`. Reported, does not fail the sweep.
 *
 * The rules split another way too:
 * - **Structural** (1, 2, 5, 6, 7, 8, 9) — the instance is malformed or
 *   unrenderable. Almost always a coding error in the generator.
 * - **Pedagogical** (3, 4) — the instance renders fine but is not a good
 *   question: duplicate options, or options a student can discard on sight.
 *   These are the ones that quietly ship if nobody checks.
 * - **Consistency** (10) — the generator computed one value and displayed
 *   another.
 */

import { explainTriviality, type TrivialityContext } from './equivalence.ts';
import type { Rational } from './rational.ts';
import {
  canonicalize,
  toLatex as valueToLatex,
  valuesEqual,
  type QValue,
} from './value.ts';
import type { Generator, QuestionInstance } from './types.ts';

/** Whether a finding blocks the question or merely flags it. */
export type ValidationSeverity = 'error' | 'warning';

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
  /** Rule 3: two choices carry the same value. */
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
  | 'SOLUTION_TOO_SHORT'
  /** Rule 9: a choice has no `value`, or its `value` fails to canonicalize. */
  | 'INVALID_VALUE'
  /** Rule 10 (warning): a choice's `latex` does not match its `value`'s canonical rendering. */
  | 'VALUE_LATEX_MISMATCH';

/** One problem found in an instance. */
export interface ValidationError {
  /** Stable, groupable code. See `ValidationCode`. */
  code: ValidationCode;
  /** Whether this blocks the question. See `ValidationSeverity`. */
  severity: ValidationSeverity;
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
  /** `true` when there are no **error**-severity findings. Warnings do not affect it. */
  valid: boolean;
  /** Error-severity findings only. Empty on a valid instance. */
  errors: ValidationError[];
  /** Warning-severity findings only. May be non-empty on a valid instance. */
  warnings: ValidationError[];
  /** Every finding, errors and warnings together, in the order they were produced. */
  findings: ValidationError[];
}

/** Tuning knobs for a single validation run. */
export interface ValidateOptions {
  /**
   * Whether zero is a legitimate result of one of this generator's declared
   * misconceptions, which suppresses the `implausible_zero` heuristic.
   *
   * Defaults to `false`. It has to be passed in rather than derived, because
   * `DistractorStrategy` carries only an id and a label — nothing a machine can
   * read to decide this. See HANDOFF.md, open questions.
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
 * Leading assignment prefixes rule 10 strips before comparing.
 *
 * A generator legitimately renders `x = \frac{\pi}{3}` for a value that
 * canonically renders as `\frac{\pi}{3}`. Matches a single Latin letter or a
 * LaTeX command (`\theta`, `\alpha`) followed by `=`.
 */
const ASSIGNMENT_PREFIX = /^\s*(?:[a-zA-Z]|\\[a-zA-Z]+)\s*=\s*/;

/** Builds an error-severity finding. */
function error(code: ValidationCode, message: string, path: string): ValidationError {
  return { code, severity: 'error', message, path };
}

/** Builds a warning-severity finding. */
function warning(code: ValidationCode, message: string, path: string): ValidationError {
  return { code, severity: 'warning', message, path };
}

/**
 * Strips an assignment prefix and normalizes whitespace, for rule 10.
 *
 * Exported so a generator author can check by hand why their rendering is being
 * flagged.
 */
export function normalizeForValueComparison(latex: string): string {
  return latex.replace(ASSIGNMENT_PREFIX, '').replace(/\s+/g, '').trim();
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
        errors.push(
          error(
            'EMPTY_GROUP',
            `Empty {} group at index ${i} in ${path || 'instance'}. Usually a value that failed to interpolate.`,
            path,
          ),
        );
      }
    } else if (char === '}') {
      depth -= 1;
      if (depth < 0 && !sawUnmatchedClose) {
        sawUnmatchedClose = true;
        errors.push(
          error('UNBALANCED_BRACES', `Unmatched closing brace at index ${i} in ${path || 'instance'}.`, path),
        );
        depth = 0;
      }
    }
  }

  if (depth > 0) {
    errors.push(
      error(
        'UNBALANCED_BRACES',
        `${depth} unclosed ${depth === 1 ? 'brace' : 'braces'} in ${path || 'instance'}: ${JSON.stringify(latex)}`,
        path,
      ),
    );
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
      errors.push(
        error(
          'MALFORMED_FRAC',
          `\\frac at index ${match.index} in ${path || 'instance'} has ${groupsFound} brace ${groupsFound === 1 ? 'argument' : 'arguments'}, needs 2.`,
          path,
        ),
      );
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
    errors.push(error('EMPTY_FIELD', `${path || 'field'} is empty.`, path));
    return errors;
  }
  for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
    if (pattern.test(value)) {
      errors.push(
        error(
          'PLACEHOLDER_LEAK',
          `${path || 'field'} contains ${JSON.stringify(label)}, which means a value was never filled in: ${JSON.stringify(value)}`,
          path,
        ),
      );
    }
  }
  return errors;
}

/**
 * Canonicalizes a choice's value, capturing a throw as a finding rather than
 * letting it escape. Returns `null` when the value is absent or malformed.
 */
function safeCanonicalize(
  value: QValue | undefined,
  path: string,
  errors: ValidationError[],
): QValue | null {
  if (value === undefined || value === null) {
    errors.push(
      error(
        'INVALID_VALUE',
        `${path} has no value. Every choice must carry the structured value it represents — distinctness checking runs on it.`,
        path,
      ),
    );
    return null;
  }
  try {
    return canonicalize(value);
  } catch (thrown) {
    errors.push(
      error(
        'INVALID_VALUE',
        `${path} does not canonicalize: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
        path,
      ),
    );
    return null;
  }
}

/** The `Rational` inside a canonical value, or `null` if it is not a plain rational. */
function asRational(value: QValue | null): Rational | null {
  return value !== null && value.kind === 'rational' ? value.value : null;
}

/**
 * Validates one generated instance against the generator that produced it.
 *
 * Collects every violation rather than stopping at the first, so a single run
 * over a bad seed tells the author everything that is wrong with it. Guaranteed
 * not to throw: a malformed instance produces findings, never an exception,
 * since the caller is an unattended 500-seed sweep.
 */
export function validateInstance(
  instance: QuestionInstance,
  generator: Generator,
  options: ValidateOptions = {},
): ValidationResult {
  const findings: ValidationError[] = [];
  const choices = Array.isArray(instance.choices) ? instance.choices : [];

  // --- Rule 1: exactly 4 choices, exactly one correct -------------------------
  if (choices.length !== 4) {
    findings.push(error('CHOICE_COUNT', `Expected exactly 4 choices, found ${choices.length}.`, 'choices'));
  }
  const correctIndices = choices
    .map((choice, index) => (choice?.isCorrect === true ? index : -1))
    .filter((index) => index !== -1);
  if (correctIndices.length !== 1) {
    findings.push(
      error(
        'CORRECT_COUNT',
        correctIndices.length === 0
          ? 'No choice is marked isCorrect.'
          : `${correctIndices.length} choices are marked isCorrect (indices ${correctIndices.join(', ')}); exactly 1 may be.`,
        'choices',
      ),
    );
  }

  // --- Rule 2: every distractor names a declared strategy ---------------------
  const declaredStrategyIds = new Set((generator.strategies ?? []).map((s) => s.id));
  choices.forEach((choice, index) => {
    if (!choice || choice.isCorrect === true) return;
    if (choice.strategyId === undefined || choice.strategyId.trim() === '') {
      findings.push(
        error(
          'MISSING_STRATEGY_ID',
          `Incorrect choice ${index} has no strategyId. Every distractor must name the misconception that produced it.`,
          `choices[${index}].strategyId`,
        ),
      );
      return;
    }
    if (!declaredStrategyIds.has(choice.strategyId)) {
      findings.push(
        error(
          'UNKNOWN_STRATEGY_ID',
          `Choice ${index} declares strategyId ${JSON.stringify(choice.strategyId)}, which generator ${JSON.stringify(generator.id)} does not declare. Known: ${[...declaredStrategyIds].join(', ') || '(none)'}.`,
          `choices[${index}].strategyId`,
        ),
      );
    }
  });

  // --- Rule 9: every choice carries a value that canonicalizes ----------------
  // Runs before rules 3, 4 and 10, which all consume the canonical values.
  const canonicalValues = choices.map((choice, index) =>
    safeCanonicalize(choice?.value, `choices[${index}].value`, findings),
  );

  // --- Rule 3: no two choices duplicate each other ----------------------------
  for (let a = 0; a < choices.length; a += 1) {
    for (let b = a + 1; b < choices.length; b += 1) {
      const left = choices[a];
      const right = choices[b];
      if (!left || !right) continue;
      if (typeof left.latex === 'string' && typeof right.latex === 'string') {
        if (left.latex.replace(/\s+/g, ' ').trim() === right.latex.replace(/\s+/g, ' ').trim()) {
          findings.push(
            error(
              'DUPLICATE_LATEX',
              `Choices ${a} and ${b} render identically as ${JSON.stringify(left.latex)}. The question has fewer than 4 real options.`,
              `choices[${b}].latex`,
            ),
          );
          // Identical text is already the stronger finding; do not also report
          // the value duplication it implies.
          continue;
        }
      }
      const leftValue = canonicalValues[a];
      const rightValue = canonicalValues[b];
      if (leftValue !== null && rightValue !== null && valuesEqual(leftValue, rightValue)) {
        findings.push(
          error(
            'DUPLICATE_VALUE',
            `Choices ${a} (${left.latex}) and ${b} (${right.latex}) are the same value written two ways.`,
            `choices[${b}].latex`,
          ),
        );
      }
    }
  }

  // --- Rule 4: no distractor is a giveaway ------------------------------------
  // The triviality heuristics reason about magnitude and rendered length, which
  // only make sense for plain rationals. A symbolic answer (a surd, a pi
  // multiple, a solution set) is left alone — silence is the honest answer where
  // the heuristics have no competence. Zero is still covered for every kind,
  // because a zero of any kind canonicalizes to rational zero.
  if (correctIndices.length === 1) {
    const correctValue = asRational(canonicalValues[correctIndices[0]]);
    if (correctValue !== null) {
      const context: TrivialityContext = { zeroIsPlausible: options.zeroIsPlausible };
      choices.forEach((choice, index) => {
        if (!choice || choice.isCorrect === true) return;
        const value = asRational(canonicalValues[index]);
        if (value === null) return;
        const verdict = explainTriviality(correctValue, value, context);
        if (verdict.trivial) {
          findings.push(
            error(
              'TRIVIAL_DISTRACTOR',
              `Choice ${index} (${choice.latex}) against correct answer ${choices[correctIndices[0]].latex} is eliminable without doing the mathematics [${verdict.firedHeuristicIds.join(', ')}]: ${verdict.reasons.join(' ')}`,
              `choices[${index}].latex`,
            ),
          );
        }
      });
    }
  }

  // --- Rule 5: required text is present and fully interpolated ----------------
  findings.push(...checkText(typeof instance.stem === 'string' ? instance.stem : '', 'stem'));
  findings.push(
    ...checkText(typeof instance.conceptTag === 'string' ? instance.conceptTag : '', 'conceptTag'),
  );
  const solution = Array.isArray(instance.solution) ? instance.solution : [];
  solution.forEach((step, index) => {
    findings.push(...checkText(typeof step === 'string' ? step : '', `solution[${index}]`));
  });
  choices.forEach((choice, index) => {
    findings.push(
      ...checkText(typeof choice?.latex === 'string' ? choice.latex : '', `choices[${index}].latex`),
    );
  });

  // --- Rule 6: the LaTeX is well formed ---------------------------------------
  if (typeof instance.stem === 'string') findings.push(...checkLatex(instance.stem, 'stem'));
  solution.forEach((step, index) => {
    if (typeof step === 'string') findings.push(...checkLatex(step, `solution[${index}]`));
  });
  choices.forEach((choice, index) => {
    if (typeof choice?.latex === 'string') {
      findings.push(...checkLatex(choice.latex, `choices[${index}].latex`));
    }
  });

  // --- Rule 7: the instance agrees with the generator that made it ------------
  if (instance.generatorId !== generator.id) {
    findings.push(
      error(
        'GENERATOR_ID_MISMATCH',
        `Instance declares generatorId ${JSON.stringify(instance.generatorId)} but was produced by ${JSON.stringify(generator.id)}.`,
        'generatorId',
      ),
    );
  }
  if (instance.unitId !== generator.unitId) {
    findings.push(
      error(
        'UNIT_MISMATCH',
        `Instance unitId ${JSON.stringify(instance.unitId)} does not match generator unitId ${JSON.stringify(generator.unitId)}.`,
        'unitId',
      ),
    );
  }
  if (instance.problemTypeId !== generator.problemTypeId) {
    findings.push(
      error(
        'PROBLEM_TYPE_MISMATCH',
        `Instance problemTypeId ${JSON.stringify(instance.problemTypeId)} does not match generator problemTypeId ${JSON.stringify(generator.problemTypeId)}.`,
        'problemTypeId',
      ),
    );
  }
  if (instance.difficulty !== generator.difficulty) {
    findings.push(
      error(
        'DIFFICULTY_MISMATCH',
        `Instance difficulty ${String(instance.difficulty)} does not match generator difficulty ${String(generator.difficulty)}.`,
        'difficulty',
      ),
    );
  }

  // --- Rule 8: a worked solution, not just an answer --------------------------
  if (solution.length < 2) {
    findings.push(
      error(
        'SOLUTION_TOO_SHORT',
        `Solution has ${solution.length} ${solution.length === 1 ? 'step' : 'steps'}; a worked solution needs at least 2.`,
        'solution',
      ),
    );
  }

  // --- Rule 10 (warning): the rendering agrees with the value ------------------
  // Exact string equality would be too strict: a generator legitimately renders
  // "x = \frac{\pi}{3}" for a value whose canonical rendering is "\frac{\pi}{3}".
  // So an assignment prefix is stripped and whitespace removed before comparing.
  choices.forEach((choice, index) => {
    const value = canonicalValues[index];
    if (value === null || typeof choice?.latex !== 'string') return;
    let rendered: string;
    try {
      rendered = valueToLatex(value);
    } catch {
      // Rule 9 already reported anything that cannot render.
      return;
    }
    if (
      normalizeForValueComparison(choice.latex) !== normalizeForValueComparison(rendered)
    ) {
      findings.push(
        warning(
          'VALUE_LATEX_MISMATCH',
          `Choice ${index} displays ${JSON.stringify(choice.latex)} but its value renders as ${JSON.stringify(rendered)}. Either the generator computed one thing and displayed another, or the rendering is a deliberate restatement.`,
          `choices[${index}].latex`,
        ),
      );
    }
  });

  const errors = findings.filter((finding) => finding.severity === 'error');
  const warnings = findings.filter((finding) => finding.severity === 'warning');
  return { valid: errors.length === 0, errors, warnings, findings };
}
