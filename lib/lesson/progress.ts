/**
 * Progress is a pure function of attempts. No storage, no clock, no state.
 *
 * Only Solo attempts count. Together is guided (the hint, then the answer), so
 * a Together entry says nothing about what the student can do alone. Watch
 * produces no attempts at all.
 */

import type { Attempt, LessonProgress, ProblemTypeProgress } from './types.ts';

/** A type with no Solo attempts yet. */
function fresh(): ProblemTypeProgress {
  return { attempted: 0, correctAtLast: null };
}

/**
 * Folds a list of attempts into per-type progress.
 *
 * Attempts are taken in array order, so "last" means last in the list, not
 * highest `at`. Callers that store attempts keep them ordered; this function
 * does not sort, because sorting by `at` across sessions would be a guess.
 */
export function progressFrom(attempts: Attempt[]): LessonProgress {
  const progress: LessonProgress = {};
  for (const attempt of attempts) {
    if (attempt.mode !== 'solo') continue;
    const current = progress[attempt.problemTypeId] ?? fresh();
    progress[attempt.problemTypeId] = {
      attempted: current.attempted + 1,
      correctAtLast: attempt.correct,
    };
  }
  return progress;
}
