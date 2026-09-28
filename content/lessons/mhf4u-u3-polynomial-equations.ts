/**
 * MHF4U Unit 3: Polynomial equations and inequalities.
 *
 * The first lesson, and the model for every later one. A lesson is data: the
 * test map, one worked-set entry per playable problem type, and the video.
 * Nothing here computes.
 *
 * Ids are permanent. The worked-set seed is permanent once the video is
 * recorded; `validate:lessons` regenerates it on every build and fails if the
 * generator has drifted.
 *
 * PLACEHOLDERS, for Charlie to fill from the prose test map (spec section 10):
 * - every `typicalMarks: 0`
 * - every `traps: []`
 * - `videoRef: null`
 * A `0` or `[]` here is "not written yet", never a claim.
 */

import { fromInt } from '../../lib/questions/rational.ts';
import type { Lesson, TestMapEntry } from '../../lib/lesson/types.ts';

const UNIT_ID = 'mhf4u-u3-polynomial-equations';
const FIND_K = 'mhf4u-u3-factor-theorem-find-k';

/** A test-map row for a type with no generator yet. Marks and traps to be filled. */
function coming(problemTypeId: string): TestMapEntry {
  return { problemTypeId, typicalMarks: 0, traps: [], status: 'coming' };
}

export const lesson: Lesson = {
  id: UNIT_ID,
  courseCode: 'MHF4U',
  unitId: UNIT_ID,
  title: 'Polynomial equations and inequalities',
  videoRef: null,

  testMap: {
    unitId: UNIT_ID,
    // PLACEHOLDER: replace with Charlie's half-page prose test map.
    summary:
      'What a typical Ontario unit test on polynomial equations and inequalities asks, roughly how many marks each question type carries, and where marks are usually lost. This summary is a placeholder until the test map is written.',
    entries: [
      coming('mhf4u-u3-remainder-theorem-evaluate'),
      coming('mhf4u-u3-remainder-theorem-find-k'),
      coming('mhf4u-u3-factor-theorem-verify-factor'),
      { problemTypeId: FIND_K, typicalMarks: 0, traps: [], status: 'built' },
      coming('mhf4u-u3-rational-root-candidates'),
      coming('mhf4u-u3-long-division-quotient-remainder'),
      coming('mhf4u-u3-synthetic-division'),
      coming('mhf4u-u3-factor-fully-cubic'),
      coming('mhf4u-u3-factor-fully-quartic'),
      coming('mhf4u-u3-solve-polynomial-equation-factorable'),
      coming('mhf4u-u3-solve-polynomial-equation-irrational-roots'),
      coming('mhf4u-u3-family-of-polynomials-from-roots'),
      coming('mhf4u-u3-sign-analysis-interval-table'),
      coming('mhf4u-u3-solve-polynomial-inequality-factored'),
      coming('mhf4u-u3-solve-polynomial-inequality-unfactored'),
    ],
  },

  workedSet: [
    {
      problemTypeId: FIND_K,
      generatorId: `${FIND_K}-d2`,
      // Seed 0: r = -3, a = 1, b = 2, so k = 24. Permanent once recorded.
      seed: 0,
      stem: 'Given that (x + 3) divides f(x) = x^3 + x^2 + 2x + k exactly, determine k.',
      script: {
        steps: [
          {
            id: `${FIND_K}-s1`,
            say: 'Start with what the word "factor" buys you. If (x + 3) is a factor of f(x), then f(x) comes out to exactly zero at the root of that factor. That is the factor theorem, and it is the whole question. Everything after this is arithmetic.',
            blank: {
              kind: 'rational',
              prompt: 'What value of x makes (x + 3) equal to zero?',
              answer: fromInt(-3),
              hint: 'Set the factor itself to zero: x + 3 = 0. Watch the sign.',
            },
          },
          {
            id: `${FIND_K}-s2`,
            say: 'So substitute x = -3 into f(x) = x^3 + x^2 + 2x + k and set the result equal to zero: (-3)^3 + (1)(-3)^2 + (2)(-3) + k = 0.',
          },
          {
            id: `${FIND_K}-s3`,
            say: 'Work the three known terms one at a time. (-3)^3 = -27. Then (1)(-3)^2 = 9. And (2)(-3) = -6.',
            blank: {
              kind: 'rational',
              prompt: 'Add them up: -27 + 9 + (-6) = ?',
              answer: fromInt(-24),
              hint: 'Two negatives and one positive. -27 + 9 is -18, then take away 6 more.',
            },
          },
          {
            id: `${FIND_K}-s4`,
            say: 'So the equation is now -24 + k = 0. Move the -24 across the equals sign.',
            blank: {
              kind: 'rational',
              prompt: 'k = ?',
              answer: fromInt(24),
              hint: 'Moving -24 to the other side flips its sign. You are solving for k, not reporting the -24.',
            },
          },
          {
            id: `${FIND_K}-s5`,
            say: 'Check it back. Having (x + 3) as a factor means f(-3) is exactly zero, so put k = 24 into what you already computed.',
            blank: {
              kind: 'choice',
              prompt: 'With k = 24, f(-3) = -24 + 24 = ?',
              options: ['0', '24', '-24', '48'],
              answer: 0,
              hint: 'You already found the first three terms add to -24. Add k to that.',
            },
          },
        ],
      },
    },
  ],
};

export default lesson;
