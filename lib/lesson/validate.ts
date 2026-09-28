/**
 * Structural validation of a lesson, in the style of `lib/questions/validate.ts`.
 *
 * `validateLesson` never throws and never returns a bare boolean. It returns
 * every problem it found with a stable code, a severity and a path, because
 * the consumer is `validate:lessons` running on `prebuild` unattended.
 *
 * Fatal (the lesson must not ship):
 * - `UNKNOWN_PROBLEM_TYPE`: a test-map or worked-set id is not in the taxonomy.
 * - `NO_GENERATOR`: a `'built'` test-map entry has no registered generator, or
 *   a worked-set entry names one that is not registered or serves another type.
 * - `STEM_DRIFT`: the worked-set entry's stored stem is not what its generator
 *   produces at its seed. The generator changed under a recorded video.
 * - `NO_BLANKS`: a step script with nothing for Together to check.
 * - `EMPTY_ANSWER`: a blank whose answer is empty, or a choice index that does
 *   not point into its options.
 * - `DUPLICATE_STEP_ID`: two steps share an id anywhere in the lesson.
 * - `EMPTY_FIELD`: a required string is blank.
 *
 * Warning (worth a look, does not fail the build):
 * - `MAP_WITHOUT_SET`: a `'built'` test-map entry has no worked-set entry.
 * - `SET_WITHOUT_MAP`: a worked-set entry is not on the test map.
 */

import { GENERATORS, getGenerator } from '../questions/generators/index.ts';
import { getCourse, getProblemType, getUnit } from '../questions/taxonomy/index.ts';
import type { Lesson } from './types.ts';

/** Whether a finding blocks the lesson or merely flags it. */
export type LessonFindingSeverity = 'fatal' | 'warning';

/** Stable codes. Never renumber or reuse one. */
export type LessonFindingCode =
  | 'UNKNOWN_PROBLEM_TYPE'
  | 'UNKNOWN_UNIT'
  | 'UNKNOWN_COURSE'
  | 'NO_GENERATOR'
  | 'STEM_DRIFT'
  | 'NO_BLANKS'
  | 'EMPTY_ANSWER'
  | 'DUPLICATE_STEP_ID'
  | 'EMPTY_FIELD'
  | 'MAP_WITHOUT_SET'
  | 'SET_WITHOUT_MAP';

/** One problem found in a lesson. */
export interface Finding {
  code: LessonFindingCode;
  severity: LessonFindingSeverity;
  /** One sentence a human can act on. Names the ids involved. */
  message: string;
  /** Dotted/bracketed path into the lesson, e.g. `workedSet[0].stem`. */
  path: string;
}

function fatal(code: LessonFindingCode, message: string, path: string): Finding {
  return { code, severity: 'fatal', message, path };
}

function warning(code: LessonFindingCode, message: string, path: string): Finding {
  return { code, severity: 'warning', message, path };
}

function isBlankText(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/**
 * Validates one lesson. Collects every finding rather than stopping at the
 * first, and never throws: a generator that crashes on the stored seed is
 * reported as `STEM_DRIFT`, since it certainly no longer produces the stem.
 */
export function validateLesson(lesson: Lesson): Finding[] {
  const findings: Finding[] = [];

  // --- identity -----------------------------------------------------------------
  for (const [field, value] of [['id', lesson.id], ['title', lesson.title]] as const) {
    if (isBlankText(value)) findings.push(fatal('EMPTY_FIELD', `Lesson ${field} is empty.`, field));
  }
  if (!getCourse(lesson.courseCode)) {
    findings.push(
      fatal('UNKNOWN_COURSE', `Course ${JSON.stringify(lesson.courseCode)} is not in the taxonomy.`, 'courseCode'),
    );
  }
  if (!getUnit(lesson.unitId)) {
    findings.push(fatal('UNKNOWN_UNIT', `Unit ${JSON.stringify(lesson.unitId)} is not in the taxonomy.`, 'unitId'));
  }
  if (lesson.testMap.unitId !== lesson.unitId) {
    findings.push(
      fatal(
        'UNKNOWN_UNIT',
        `Test map is for unit ${JSON.stringify(lesson.testMap.unitId)} but the lesson teaches ${JSON.stringify(lesson.unitId)}.`,
        'testMap.unitId',
      ),
    );
  }
  if (isBlankText(lesson.testMap.summary)) {
    findings.push(fatal('EMPTY_FIELD', 'Test map summary is empty.', 'testMap.summary'));
  }

  // --- test map -------------------------------------------------------------------
  const mapIds = new Set<string>();
  lesson.testMap.entries.forEach((entry, index) => {
    const path = `testMap.entries[${index}]`;
    mapIds.add(entry.problemTypeId);
    if (!getProblemType(entry.problemTypeId)) {
      findings.push(
        fatal(
          'UNKNOWN_PROBLEM_TYPE',
          `Test map names problem type ${JSON.stringify(entry.problemTypeId)}, which is not in the taxonomy.`,
          `${path}.problemTypeId`,
        ),
      );
    }
    if (entry.status === 'built' && !hasGeneratorFor(entry.problemTypeId)) {
      findings.push(
        fatal(
          'NO_GENERATOR',
          `Test map marks ${JSON.stringify(entry.problemTypeId)} as built, but no registered generator serves it.`,
          `${path}.status`,
        ),
      );
    }
  });

  // --- worked set -----------------------------------------------------------------
  const setIds = new Set<string>();
  const stepIds = new Map<string, string>();
  lesson.workedSet.forEach((entry, index) => {
    const path = `workedSet[${index}]`;
    setIds.add(entry.problemTypeId);

    if (!getProblemType(entry.problemTypeId)) {
      findings.push(
        fatal(
          'UNKNOWN_PROBLEM_TYPE',
          `Worked set names problem type ${JSON.stringify(entry.problemTypeId)}, which is not in the taxonomy.`,
          `${path}.problemTypeId`,
        ),
      );
    }

    const generator = getGenerator(entry.generatorId);
    if (!generator) {
      findings.push(
        fatal(
          'NO_GENERATOR',
          `Worked set for ${JSON.stringify(entry.problemTypeId)} names generator ${JSON.stringify(entry.generatorId)}, which is not registered.`,
          `${path}.generatorId`,
        ),
      );
    } else if (generator.problemTypeId !== entry.problemTypeId) {
      findings.push(
        fatal(
          'NO_GENERATOR',
          `Worked set for ${JSON.stringify(entry.problemTypeId)} names generator ${JSON.stringify(entry.generatorId)}, which serves ${JSON.stringify(generator.problemTypeId)} instead.`,
          `${path}.generatorId`,
        ),
      );
    } else {
      // The content-hash rule: the seed must still produce the stored stem.
      let regenerated: string | null = null;
      try {
        regenerated = generator.generate(entry.seed).stem;
      } catch (thrown) {
        regenerated = null;
        findings.push(
          fatal(
            'STEM_DRIFT',
            `${entry.problemTypeId}: generator ${entry.generatorId} threw at seed ${entry.seed}: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
            `${path}.stem`,
          ),
        );
      }
      if (regenerated !== null && regenerated !== entry.stem) {
        findings.push(
          fatal(
            'STEM_DRIFT',
            `${entry.problemTypeId}: seed ${entry.seed} now produces ${JSON.stringify(regenerated)} but the lesson stores ${JSON.stringify(entry.stem)}. The generator changed under a recorded worked set.`,
            `${path}.stem`,
          ),
        );
      }
    }

    // --- script ---------------------------------------------------------------------
    const steps = entry.script.steps;
    let blanks = 0;
    steps.forEach((step, stepIndex) => {
      const stepPath = `${path}.script.steps[${stepIndex}]`;
      if (isBlankText(step.id)) {
        findings.push(fatal('EMPTY_FIELD', `Step ${stepIndex} of ${entry.problemTypeId} has no id.`, `${stepPath}.id`));
      } else if (stepIds.has(step.id)) {
        findings.push(
          fatal(
            'DUPLICATE_STEP_ID',
            `Step id ${JSON.stringify(step.id)} appears at ${stepIds.get(step.id)} and again at ${stepPath}. Step ids are permanent and must be unique.`,
            `${stepPath}.id`,
          ),
        );
      } else {
        stepIds.set(step.id, stepPath);
      }
      if (isBlankText(step.say)) {
        findings.push(fatal('EMPTY_FIELD', `Step ${JSON.stringify(step.id)} has nothing to say.`, `${stepPath}.say`));
      }

      const blank = step.blank;
      if (!blank) return;
      blanks += 1;
      if (isBlankText(blank.prompt)) {
        findings.push(fatal('EMPTY_FIELD', `Blank on ${JSON.stringify(step.id)} has an empty prompt.`, `${stepPath}.blank.prompt`));
      }
      if (isBlankText(blank.hint)) {
        findings.push(fatal('EMPTY_FIELD', `Blank on ${JSON.stringify(step.id)} has an empty hint.`, `${stepPath}.blank.hint`));
      }
      switch (blank.kind) {
        case 'rational':
          if (!blank.answer || typeof blank.answer.num !== 'bigint' || typeof blank.answer.den !== 'bigint') {
            findings.push(fatal('EMPTY_ANSWER', `Rational blank on ${JSON.stringify(step.id)} has no answer.`, `${stepPath}.blank.answer`));
          }
          break;
        case 'choice':
          if (!Array.isArray(blank.options) || blank.options.length === 0) {
            findings.push(fatal('EMPTY_ANSWER', `Choice blank on ${JSON.stringify(step.id)} has no options.`, `${stepPath}.blank.options`));
          } else if (!Number.isInteger(blank.answer) || blank.answer < 0 || blank.answer >= blank.options.length) {
            findings.push(
              fatal(
                'EMPTY_ANSWER',
                `Choice blank on ${JSON.stringify(step.id)} answers index ${String(blank.answer)}, but has ${blank.options.length} options.`,
                `${stepPath}.blank.answer`,
              ),
            );
          }
          break;
        case 'exact':
          if (isBlankText(blank.answer)) {
            findings.push(fatal('EMPTY_ANSWER', `Exact blank on ${JSON.stringify(step.id)} has an empty answer.`, `${stepPath}.blank.answer`));
          }
          break;
      }
    });
    if (blanks === 0) {
      findings.push(
        fatal(
          'NO_BLANKS',
          `Script for ${entry.problemTypeId} has ${steps.length} steps and no blank. Together mode would have nothing to check.`,
          `${path}.script`,
        ),
      );
    }
  });

  // --- map versus set -------------------------------------------------------------
  lesson.testMap.entries.forEach((entry, index) => {
    if (entry.status === 'built' && !setIds.has(entry.problemTypeId)) {
      findings.push(
        warning(
          'MAP_WITHOUT_SET',
          `Test map marks ${JSON.stringify(entry.problemTypeId)} as built, but the worked set has no entry for it.`,
          `testMap.entries[${index}]`,
        ),
      );
    }
  });
  lesson.workedSet.forEach((entry, index) => {
    if (!mapIds.has(entry.problemTypeId)) {
      findings.push(
        warning(
          'SET_WITHOUT_MAP',
          `Worked set has ${JSON.stringify(entry.problemTypeId)}, but it is not on the test map.`,
          `workedSet[${index}]`,
        ),
      );
    }
  });

  return findings;
}

/** Whether any registered generator serves `problemTypeId`. */
function hasGeneratorFor(problemTypeId: string): boolean {
  return GENERATORS.some((generator) => generator.problemTypeId === problemTypeId);
}

/** Fatal findings only. */
export function fatalFindings(findings: Finding[]): Finding[] {
  return findings.filter((finding) => finding.severity === 'fatal');
}
