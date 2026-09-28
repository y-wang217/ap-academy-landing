/**
 * The one loop that plays a lesson, for tests and for the browser alike.
 *
 * `playLesson` owns the rules of each mode; `StudentPolicy` owns every
 * decision and every random number. The engine reads nothing from the DOM,
 * the clock, or a global RNG, which is what lets a scripted student prove a
 * mode works before a pixel of UI exists.
 *
 * Mode rules:
 * - **Watch** emits no attempts and returns at once. The video is the UI's job.
 * - **Together** reveals steps in order. At a blank it asks the policy to fill
 *   it; a wrong entry gets the hint and one more try; a second wrong entry
 *   reveals the answer and the script moves on. Every entry is an `Attempt`
 *   carrying its `stepId`.
 * - **Solo** generates each worked-set entry's type at a fresh seed from the
 *   policy, asks for an answer, and records one `Attempt`.
 */

import { getGenerator } from '../questions/generators/index.ts';
import { checkAnswer, checkBlank } from './check.ts';
import { TOGETHER_TRIES_BEFORE_REVEAL } from './tuning.ts';
import type { Attempt, Lesson, StudentPolicy, WorkedSetEntry } from './types.ts';

/**
 * Plays `lesson` under `policy` until the policy returns `'done'`.
 *
 * @returns every attempt made, in the order it was made, with `at` set to its
 * position in that list.
 * @throws if a worked-set entry names a generator that is not registered. That
 * is a content error `validateLesson` reports; a lesson reaching this loop has
 * passed validation, so the throw is a guard, not a code path.
 */
export async function playLesson(lesson: Lesson, policy: StudentPolicy): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  const record = (attempt: Omit<Attempt, 'at'>): void => {
    attempts.push({ ...attempt, at: attempts.length });
  };

  for (;;) {
    const mode = await policy.chooseMode(lesson);
    if (mode === 'done') return attempts;
    if (mode === 'watch') continue;
    if (mode === 'together') {
      for (const entry of lesson.workedSet) {
        await playTogether(entry, policy, record);
      }
      continue;
    }
    for (const entry of lesson.workedSet) {
      await playSolo(entry, policy, record);
    }
  }
}

/** Together mode for one worked-set entry. */
async function playTogether(
  entry: WorkedSetEntry,
  policy: StudentPolicy,
  record: (attempt: Omit<Attempt, 'at'>) => void,
): Promise<void> {
  for (const step of entry.script.steps) {
    if (policy.reveal) await policy.reveal(step);
    const blank = step.blank;
    if (!blank) continue;

    for (let attemptNo = 1; attemptNo <= TOGETHER_TRIES_BEFORE_REVEAL; attemptNo += 1) {
      const entered = await policy.fillBlank(step, blank, attemptNo);
      const correct = checkBlank(blank, entered);
      record({
        problemTypeId: entry.problemTypeId,
        generatorId: entry.generatorId,
        seed: entry.seed,
        mode: 'together',
        stepId: step.id,
        entered,
        correct,
      });
      if (correct) break;
    }
    // Falling out of the loop without a break is the reveal: the answer is in
    // `blank.answer`, the UI shows it, and the script moves on.
  }
}

/** Solo mode for one worked-set entry: one fresh question, one attempt. */
async function playSolo(
  entry: WorkedSetEntry,
  policy: StudentPolicy,
  record: (attempt: Omit<Attempt, 'at'>) => void,
): Promise<void> {
  const generator = getGenerator(entry.generatorId);
  if (!generator) {
    throw new Error(
      `Worked-set entry for ${entry.problemTypeId} names generator ${JSON.stringify(entry.generatorId)}, which is not registered. Run validate:lessons.`,
    );
  }
  const seed = policy.nextSeed();
  const instance = generator.generate(seed);
  const entered = await policy.answer(instance);
  record({
    problemTypeId: entry.problemTypeId,
    generatorId: entry.generatorId,
    seed,
    mode: 'solo',
    entered,
    correct: checkAnswer(instance, entered),
  });
}
