/**
 * Worksheet export: `QuestionInstance[]` to the shape the `ap-academy-worksheets`
 * skill consumes.
 *
 * **The boundary is the data structure.** No file output, no LaTeX, no PDF. This
 * module turns generated questions into a described payload; rendering it into
 * the pink In-Class sheet and the navy Homework sheet is the skill's job, and
 * duplicating that here would mean two templates drifting apart.
 *
 * ## The paired-generation idea
 *
 * The house format wants two sheets per lesson: in-class and homework, with the
 * same problem *types* in the same order but entirely different numbers, so the
 * homework cannot be copied from the classwork.
 *
 * Doing that by hand means writing every question twice and hoping you varied
 * enough. `generatePair` makes it structural instead: one blueprint, two seed
 * offsets, and the two sheets are uncopyable **by construction** — same
 * generators in the same order, disjoint seeds, verified different.
 *
 * The homework can also step up a difficulty tier where the blueprint offers
 * one, which is the other half of the house convention.
 */

import { GENERATORS, getGenerator } from '../generators/index.ts';
import { getProblemType, getUnit } from '../taxonomy/index.ts';
import { fingerprint } from '../verify.ts';
import type { Difficulty, Generator, QuestionInstance } from '../types.ts';

/** ■ / ■■ / ■■■ — the house difficulty glyphs. */
export const DIFFICULTY_GLYPHS: Record<Difficulty, string> = {
  1: '■',
  2: '■■',
  3: '■■■',
};

/** One question, in the shape the worksheet skill reads. */
export interface WorksheetQuestion {
  /** 1-based position on the sheet. */
  number: number;
  /** The question as posed. LaTeX without `$` delimiters; the renderer wraps it. */
  stem: string;
  /** The four options in presentation order. */
  choices: { label: string; latex: string }[];
  /** `"A"`–`"D"`: which option is correct. */
  answer: string;
  /** Worked solution, one step per element, in tutor voice. */
  solution: string[];
  /** House difficulty glyph for this question. */
  difficultyGlyph: string;
  difficulty: Difficulty;
  /** Short line naming the concept, for the answer key. */
  conceptTag: string;
  /**
   * Provenance. Enough to regenerate this exact question later, which is what
   * makes a printed sheet reproducible rather than a one-off artifact.
   */
  source: { generatorId: string; seed: number; problemTypeId: string };
}

/** A titled run of questions on a sheet. */
export interface WorksheetSection {
  /** Section heading, taken from the taxonomy unit. */
  title: string;
  /** The learning outcomes this section covers, for the header block. */
  outcomes: string[];
  questions: WorksheetQuestion[];
}

/** One sheet: either the in-class worksheet or the homework. */
export interface Worksheet {
  kind: 'in-class' | 'homework';
  /** Sheet title, e.g. `"MHF4U — Polynomial equations and inequalities"`. */
  title: string;
  /** Course code, for the header. */
  courseCode: string;
  /** Every question, flattened, in sheet order. */
  questions: WorksheetQuestion[];
  sections: WorksheetSection[];
  /** Seeds used, so the sheet can be regenerated exactly. */
  seeds: number[];
}

/** A matched pair: same problem types, different numbers. */
export interface WorksheetPair {
  inClass: Worksheet;
  homework: Worksheet;
  /**
   * `true` when no question on the homework is identical to its in-class
   * counterpart. Computed, not assumed — `generatePair` refuses to return a
   * pair where it is false.
   */
  uncopyable: boolean;
}

/** One slot on a sheet: which generator, and at which difficulty. */
export interface BlueprintEntry {
  /** Registered generator id. */
  generatorId: string;
  /**
   * Optional generator to use for the homework instead, so the homework can
   * step up a tier. Falls back to `generatorId` when absent.
   */
  homeworkGeneratorId?: string;
}

/** The recipe for a matched pair of sheets. */
export interface WorksheetBlueprint {
  courseCode: string;
  title: string;
  /** Slots in the order they appear on both sheets. */
  entries: BlueprintEntry[];
}

/** Options for building a single sheet. */
export interface BuildOptions {
  kind: Worksheet['kind'];
  /** Seed for the first question; each subsequent question uses the next seed. */
  startSeed: number;
}

function resolve(generatorId: string, generators: Generator[]): Generator {
  const found = generators.find((generator) => generator.id === generatorId)
    ?? getGenerator(generatorId);
  if (!found) {
    throw new Error(
      `Unknown generator ${JSON.stringify(generatorId)}. Register it in lib/questions/generators/index.ts.`,
    );
  }
  return found;
}

/** Converts one generated instance into a worksheet question. */
export function toWorksheetQuestion(
  instance: QuestionInstance,
  number: number,
): WorksheetQuestion {
  const correctIndex = instance.choices.findIndex((choice) => choice.isCorrect);
  if (correctIndex === -1) {
    throw new Error(
      `Instance from ${instance.generatorId} seed ${instance.seed} has no correct choice.`,
    );
  }
  return {
    number,
    stem: instance.stem,
    choices: instance.choices.map((choice, index) => ({
      label: 'ABCD'[index] ?? String(index + 1),
      latex: choice.latex,
    })),
    answer: 'ABCD'[correctIndex] ?? String(correctIndex + 1),
    solution: instance.solution,
    difficultyGlyph: DIFFICULTY_GLYPHS[instance.difficulty],
    difficulty: instance.difficulty,
    conceptTag: instance.conceptTag,
    source: {
      generatorId: instance.generatorId,
      seed: instance.seed,
      problemTypeId: instance.problemTypeId,
    },
  };
}

/** Groups questions into sections by taxonomy unit, preserving sheet order. */
function buildSections(questions: WorksheetQuestion[]): WorksheetSection[] {
  const sections: WorksheetSection[] = [];
  for (const question of questions) {
    const problemType = getProblemType(question.source.problemTypeId);
    const unit = problemType ? getUnit(problemType.unitId) : undefined;
    const title = unit ? unit.label : 'Practice';
    const outcome = problemType?.outcome;

    let section = sections.find((candidate) => candidate.title === title);
    if (!section) {
      section = { title, outcomes: [], questions: [] };
      sections.push(section);
    }
    if (outcome && !section.outcomes.includes(outcome)) section.outcomes.push(outcome);
    section.questions.push(question);
  }
  return sections;
}

/**
 * Builds one sheet from a blueprint.
 *
 * Question `n` uses seed `startSeed + n`, so a sheet is fully described by its
 * blueprint plus one number.
 */
export function buildWorksheet(
  blueprint: WorksheetBlueprint,
  options: BuildOptions,
  generators: Generator[] = GENERATORS,
): Worksheet {
  const useHomeworkVariant = options.kind === 'homework';
  const seeds: number[] = [];
  const questions = blueprint.entries.map((entry, index) => {
    const generatorId =
      useHomeworkVariant && entry.homeworkGeneratorId !== undefined
        ? entry.homeworkGeneratorId
        : entry.generatorId;
    const generator = resolve(generatorId, generators);
    const seed = options.startSeed + index;
    seeds.push(seed);
    return toWorksheetQuestion(generator.generate(seed), index + 1);
  });

  return {
    kind: options.kind,
    title: blueprint.title,
    courseCode: blueprint.courseCode,
    questions,
    sections: buildSections(questions),
    seeds,
  };
}

/**
 * How far apart the two sheets' seeds sit.
 *
 * Large enough that the two sheets never draw the same seed for the same slot,
 * whatever the blueprint length — a blueprint of 10,000 questions would be a
 * different problem entirely.
 */
export const HOMEWORK_SEED_OFFSET = 10_000;

/**
 * Builds a matched in-class and homework pair from one blueprint.
 *
 * Same problem types in the same order, disjoint seeds, and the result is
 * checked rather than assumed: if any homework question comes out identical to
 * its in-class counterpart, this throws instead of handing back a sheet a
 * student can copy.
 *
 * @throws {Error} if the blueprint is empty, or if a pair cannot be made
 * distinct within `maxAttempts` seed shifts.
 */
export function generatePair(
  blueprint: WorksheetBlueprint,
  startSeed = 0,
  generators: Generator[] = GENERATORS,
  maxAttempts = 20,
): WorksheetPair {
  if (blueprint.entries.length === 0) {
    throw new Error('A worksheet blueprint needs at least one entry.');
  }

  const inClass = buildWorksheet(blueprint, { kind: 'in-class', startSeed }, generators);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const homeworkSeed = startSeed + HOMEWORK_SEED_OFFSET + attempt * blueprint.entries.length;
    const homework = buildWorksheet(
      blueprint,
      { kind: 'homework', startSeed: homeworkSeed },
      generators,
    );
    if (isUncopyable(inClass, homework)) {
      return { inClass, homework, uncopyable: true };
    }
  }

  throw new Error(
    `Could not build a distinct homework sheet for ${JSON.stringify(blueprint.title)} in ${maxAttempts} attempts. The generators involved are probably over-constrained — check their stem variety.`,
  );
}

/**
 * Whether no question on the homework duplicates its in-class counterpart.
 *
 * Compares stems and answers rather than whole instances: two questions with
 * the same stem are copyable even if their solution wording differs, and that
 * is the property a student exploits.
 */
export function isUncopyable(inClass: Worksheet, homework: Worksheet): boolean {
  if (inClass.questions.length !== homework.questions.length) return false;
  return inClass.questions.every((question, index) => {
    const counterpart = homework.questions[index];
    if (question.stem === counterpart.stem) return false;
    // Identical option sets mean the same question with the prompt reworded.
    const left = question.choices.map((choice) => choice.latex).join('|');
    const right = counterpart.choices.map((choice) => choice.latex).join('|');
    return left !== right;
  });
}

/**
 * Every problem type on a sheet, in order, for checking a pair really does
 * mirror its partner.
 */
export function problemTypeSequence(worksheet: Worksheet): string[] {
  return worksheet.questions.map((question) => question.source.problemTypeId);
}

/**
 * Rebuilds a sheet from its provenance, to confirm a printed worksheet can be
 * reproduced exactly. Used by tests, and by anyone chasing "which question was
 * on Haider's sheet in July".
 */
export function reproduce(
  worksheet: Worksheet,
  generators: Generator[] = GENERATORS,
): QuestionInstance[] {
  return worksheet.questions.map((question) =>
    resolve(question.source.generatorId, generators).generate(question.source.seed),
  );
}

/** Whether a sheet reproduces byte-identically from its recorded provenance. */
export function reproducesExactly(
  worksheet: Worksheet,
  generators: Generator[] = GENERATORS,
): boolean {
  const rebuilt = reproduce(worksheet, generators);
  return rebuilt.every((instance, index) => {
    const question = worksheet.questions[index];
    return (
      instance.stem === question.stem &&
      instance.choices.map((choice) => choice.latex).join('|') ===
        question.choices.map((choice) => choice.latex).join('|') &&
      fingerprint(instance).length > 0
    );
  });
}
