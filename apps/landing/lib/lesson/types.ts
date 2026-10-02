/**
 * The lesson contract.
 *
 * `lib/lesson/` is the layer above `lib/questions/`: a generator makes one
 * question, a lesson arranges question types around the unit test a student
 * is about to sit. Everything here is data. Nothing in this file computes.
 *
 * Rules that hold across the module (asserted by tests, restated in CLAUDE.md):
 * - Imports from `lib/questions/` only. Never `app/`, React, `next/*`,
 *   `@supabase/*`. `boundaries.test.ts` reads every file and fails otherwise.
 * - No `Math.random`. All randomness is the policy's (`StudentPolicy.nextSeed`)
 *   or a generator's (`createRng`).
 * - Lesson ids, step ids and worked-set entries are permanent once written.
 *   Attempt rows reference them.
 * - Every tunable number lives in `tuning.ts`, not here and not in logic.
 */

import type { Rational } from '../questions/rational.ts';
import type {
  LatexString,
  ProblemTypeId,
  QuestionInstance,
  UnitId,
} from '../questions/types.ts';

/**
 * Stable identifier for a lesson, e.g. `"mhf4u-u3-polynomial-equations"`.
 *
 * Convention: the lesson id equals the unit id it teaches, because in this
 * product a lesson *is* a unit test. Permanent once written.
 */
export type LessonId = string;

/**
 * Stable identifier for one step of a step script, e.g.
 * `"mhf4u-u3-factor-theorem-find-k-s1"`: the problem type id plus `-s<n>`.
 *
 * Permanent once written. Together-mode attempts reference it, so a renumbered
 * step silently orphans every attempt against the old id. Insert a step by
 * giving it the next unused number, not by renumbering.
 */
export type StepId = string;

/** Whether a test-map entry has a generator behind it yet. */
export type TestMapEntryStatus =
  /** A registered generator exists; the type appears in Solo. */
  | 'built'
  /** Listed on the test map so the student sees the whole test, but not yet playable. */
  | 'coming';

/**
 * One row of the test map: one question type as it appears on the unit test.
 */
export interface TestMapEntry {
  /** Must resolve in the taxonomy (validator rule `UNKNOWN_PROBLEM_TYPE`). */
  problemTypeId: ProblemTypeId;
  /**
   * Roughly how many marks this type is worth on a typical Ontario unit test.
   * `0` is the placeholder meaning "Charlie has not filled this in yet"; it is
   * never rendered as a real number.
   */
  typicalMarks: number;
  /**
   * The one to three most common ways students lose marks on this type, in
   * student-facing prose. `[]` is the placeholder, not a claim that there are
   * none.
   */
  traps: string[];
  /** See `TestMapEntryStatus`. `'built'` requires a registered generator. */
  status: TestMapEntryStatus;
}

/**
 * What a unit test on this unit asks, how it is marked, and where marks go.
 *
 * This is the object that makes the product different from Khan. It is
 * written by a human from experience of real tests; nothing generates it.
 */
export interface TestMap {
  /** The unit this map describes. Must resolve in the taxonomy. */
  unitId: UnitId;
  /** Student-facing prose: what the test looks like, in a paragraph. Non-empty. */
  summary: string;
  /** One entry per question type on the test, in the order the test usually asks them. */
  entries: TestMapEntry[];
}

/**
 * How a blank is checked. Closed union: `check.ts` has exactly one arm per kind
 * and nothing else. Free-form algebra is deliberately absent; a step that would
 * need it is narration.
 */
export type BlankKind = 'rational' | 'choice' | 'exact';

/**
 * The fields every blank carries regardless of kind.
 */
interface BlankBase {
  /** Short, student-facing, e.g. `"k = ?"`. Non-empty. */
  prompt: string;
  /**
   * One line shown after the first wrong entry. Says what to look at, not the
   * answer. Non-empty.
   */
  hint: string;
}

/**
 * The thing a student fills in before the next step is revealed.
 *
 * A discriminated union rather than `answer: Rational | number | string`
 * beside a separate `kind`, so the type system stops a `rational` blank from
 * carrying a string answer, and so `checkBlank` cannot reach the wrong arm.
 */
export type Blank =
  /** Checked by exact rational equality; the entry is parsed (see `check.ts`). */
  | (BlankBase & { kind: 'rational'; answer: Rational })
  /** Checked by index into `options`. `answer` is a valid index into `options`. */
  | (BlankBase & { kind: 'choice'; options: LatexString[]; answer: number })
  /** Checked by string equality after `normalizeLatex`. `answer` is non-empty. */
  | (BlankBase & { kind: 'exact'; answer: LatexString });

/**
 * One step of a worked solution, as the student sees it in Together mode.
 */
export interface Step {
  /** See `StepId`. Unique within a lesson (validator rule `DUPLICATE_STEP_ID`). */
  id: StepId;
  /**
   * What is shown when the step is revealed. LaTeX without `$` delimiters,
   * may mix prose and math, in the tutor voice the generator's `solution`
   * array uses: say why before what. Non-empty.
   */
  say: LatexString;
  /** Absent means the step is narration: revealed, never checked. */
  blank?: Blank;
}

/**
 * The solution to one worked-set question as an ordered list of steps.
 *
 * At least one step carries a blank (validator rule `NO_BLANKS`), otherwise
 * Together mode has nothing to do and the entry belongs in Watch alone.
 */
export interface StepScript {
  steps: Step[];
}

/**
 * One fixed question in the worked set: the question Charlie solves on video
 * and the one Together replays.
 */
export interface WorkedSetEntry {
  /** Must resolve in the taxonomy. */
  problemTypeId: ProblemTypeId;
  /** Must be a registered generator whose `problemTypeId` matches. */
  generatorId: string;
  /**
   * The seed the question was generated at. Fixed forever once the video is
   * recorded: the video shows this exact question.
   */
  seed: number;
  /**
   * The stem `generatorId` produced at `seed`, stored so validation can detect
   * a generator change. `validateLesson` regenerates from the seed and fails,
   * naming the problem type, when the two differ (rule `STEM_DRIFT`).
   */
  stem: LatexString;
  /** The hand-written solution to this exact question. */
  script: StepScript;
}

/** Where the Watch-mode video lives. Only YouTube in Stage 0 (spec decision D4). */
export type VideoRef = { kind: 'youtube'; id: string };

/**
 * A lesson: everything the three modes render, as data.
 *
 * Watch renders `videoRef`. Together renders `workedSet[].script`. Solo draws
 * `workedSet[].generatorId` at new seeds. `testMap` frames all three.
 */
export interface Lesson {
  /** See `LessonId`. */
  id: LessonId;
  /** Ministry course code, uppercase, e.g. `"MHF4U"`. Must resolve in the taxonomy. */
  courseCode: string;
  /** The unit this lesson teaches. Must resolve in the taxonomy. */
  unitId: UnitId;
  /** Student-facing title, e.g. `"Polynomial equations and inequalities"`. Non-empty. */
  title: string;
  /** `null` until the video is recorded. Watch mode is unavailable while null. */
  videoRef: VideoRef | null;
  /** See `TestMap`. */
  testMap: TestMap;
  /**
   * One entry per question type the lesson can play. Order is the order the
   * worked set is solved on video and replayed in Together.
   */
  workedSet: WorkedSetEntry[];
}

/** The three renderings of one worked set, in the order a student takes them. */
export type Mode = 'watch' | 'together' | 'solo';

/**
 * One entry a student made, in any mode. The unit of storage from Stage 2 on.
 *
 * Together produces one per blank entry (up to `TOGETHER_TRIES_BEFORE_REVEAL`
 * per blank). Solo produces one per worked-set entry. Watch produces none.
 */
export interface Attempt {
  /** What was being practised. */
  problemTypeId: ProblemTypeId;
  /** Which generator made the question. */
  generatorId: string;
  /** The seed of the question: the worked-set seed in Together, `nextSeed()` in Solo. */
  seed: number;
  /** Which mode produced it. Progress counts only `'solo'`. */
  mode: Mode;
  /** Set on Together attempts only: the step whose blank was filled. */
  stepId?: StepId;
  /** Exactly what the student typed or picked, untrimmed. */
  entered: string;
  /** What `check.ts` said about `entered`. */
  correct: boolean;
  /**
   * Position of this attempt within the play session, 0-based and increasing.
   * Not a timestamp: `lib/lesson/` has no clock, and a clock would make two
   * runs of the same policy differ. Stage 2 stamps wall time when it stores.
   */
  at: number;
}

/**
 * Progress on one problem type. Deliberately two fields.
 *
 * `attempted` and `correctAtLast` are facts about the test. A ratio, a streak,
 * a percentage or a "mastery" level would be a verdict about the student, and
 * the spec's rule is that the UI presents the test, never a verdict. A field
 * that could render as a grade does not go here.
 */
export interface ProblemTypeProgress {
  /** Solo attempts on this type. Together attempts are guided and do not count. */
  attempted: number;
  /** Whether the most recent Solo attempt was correct; `null` before any. */
  correctAtLast: boolean | null;
}

/** Progress across a lesson, keyed by problem type id. */
export type LessonProgress = Record<ProblemTypeId, ProblemTypeProgress>;

/**
 * The seam between the engine and whoever is playing: a scripted student in
 * tests, a React component in Stage 1. `playLesson` calls these and nothing
 * else; the engine never reads the DOM, the clock or a random source.
 */
export interface StudentPolicy {
  /**
   * Called before each mode. Returning `'done'` ends the session. A policy
   * that never returns `'done'` never terminates; tests always do.
   */
  chooseMode(lesson: Lesson): Promise<Mode | 'done'>;
  /**
   * Together: called when `step` is revealed, whether or not it has a blank,
   * so a UI can render narration. Optional; tests omit it. Solo and Watch
   * never call it.
   */
  reveal?(step: Step): Promise<void>;
  /**
   * Together: called at a blank. `attemptNo` is 1 on the first try and 2 on
   * the retry after the hint. Returns what the student entered.
   */
  fillBlank(step: Step, blank: Blank, attemptNo: number): Promise<string>;
  /** Solo: called once per generated question. Returns what the student entered. */
  answer(instance: QuestionInstance): Promise<string>;
  /**
   * Solo: the seed for the next fresh question. The policy owns randomness,
   * so a test policy returns fixed seeds and a browser policy draws its own.
   */
  nextSeed(): number;
}
