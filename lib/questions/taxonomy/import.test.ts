import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_FLOOR,
  formatReconciliation,
  reconcileExtractedBank,
  type ExtractedQuestion,
} from './import.ts';
import { allProblemTypes } from './index.ts';

/**
 * The fixture the brief asks for: one question that matches an existing slot,
 * one whose outcome has no slot at all, and — by consequence — many slots that
 * received nothing.
 */
const FIXTURE: ExtractedQuestion[] = [
  {
    // Matches mhf4u-u3-factor-theorem-find-k, whose label is exactly this.
    unitLabel: 'Polynomial equations and inequalities',
    outcome: 'Find k given a known factor',
    questionText:
      'The polynomial f(x) = x^3 + 2x^2 - 5x + k has (x - 2) as a factor. Find the value of k.',
  },
  {
    // Nothing in the tree is about matrices; MHF4U does not contain them.
    unitLabel: 'Polynomial equations and inequalities',
    outcome: 'Invert a 3x3 matrix by row reduction',
    questionText: 'Use row reduction to find the inverse of the given matrix.',
  },
];

test('import: matches an extracted question onto an existing slot', () => {
  const report = reconcileExtractedBank('MHF4U', FIXTURE);
  const match = report.matches[0];
  assert.ok(match.bestMatch, 'the exact-label question did not match anything');
  assert.equal(match.bestMatch.problemTypeId, 'mhf4u-u3-factor-theorem-find-k');
  assert.equal(match.bestMatch.reason, 'exact_label');
  assert.equal(match.bestMatch.score, 1);
});

test('import: reports an extracted outcome with no slot', () => {
  const report = reconcileExtractedBank('MHF4U', FIXTURE);
  assert.equal(report.matches[1].bestMatch, null);
  assert.equal(report.unmatchedOutcomes.length, 1);
  const unmatched = report.unmatchedOutcomes[0];
  assert.equal(unmatched.outcome, 'Invert a 3x3 matrix by row reduction');
  assert.equal(unmatched.questionCount, 1);
  assert.deepEqual(unmatched.questionIndices, [1]);
  assert.deepEqual(unmatched.unitLabels, ['Polynomial equations and inequalities']);
});

test('import: reports slots that received no extracted questions', () => {
  const report = reconcileExtractedBank('MHF4U', FIXTURE);
  const total = allProblemTypes('MHF4U').length;
  assert.equal(report.uncoveredProblemTypes.length, total - 1);
  assert.ok(
    !report.uncoveredProblemTypes.some((t) => t.problemTypeId === 'mhf4u-u3-factor-theorem-find-k'),
    'the matched slot must not be reported as uncovered',
  );
});

test('import: separates uncovered slots in extracted units from unexamined ones', () => {
  const report = reconcileExtractedBank('MHF4U', FIXTURE);
  // Only unit 3 was extracted, so only its slots count as real evidence.
  const examined = report.uncoveredProblemTypes.filter((t) => t.unitWasExtracted);
  assert.ok(examined.length > 0);
  assert.ok(examined.every((t) => t.unitId === 'mhf4u-u3-polynomial-equations'));
  const unexamined = report.uncoveredProblemTypes.filter((t) => !t.unitWasExtracted);
  assert.ok(unexamined.every((t) => t.unitId !== 'mhf4u-u3-polynomial-equations'));
});

test('import: the summary counts add up', () => {
  const report = reconcileExtractedBank('MHF4U', FIXTURE);
  assert.equal(report.summary.questionsIn, 2);
  assert.equal(report.summary.questionsMatched, 1);
  assert.equal(report.summary.distinctOutcomesIn, 2);
  assert.equal(report.summary.outcomesMatched, 1);
  assert.equal(report.summary.problemTypesHit, 1);
  assert.equal(report.summary.problemTypesTotal, allProblemTypes('MHF4U').length);
});

// --- matching behaviour -------------------------------------------------------

test('import: matches on the slot outcome as well as the label', () => {
  const report = reconcileExtractedBank('MHF4U', [
    {
      unitLabel: 'Rational functions',
      outcome: 'I can find vertical asymptotes from the denominator, after cancelling common factors.',
      questionText: 'State the vertical asymptotes.',
    },
  ]);
  assert.equal(report.matches[0].bestMatch?.problemTypeId, 'mhf4u-u4-vertical-asymptotes');
  assert.equal(report.matches[0].bestMatch?.reason, 'exact_outcome');
});

test('import: matches on keyword overlap when the wording differs', () => {
  const report = reconcileExtractedBank('MHF4U', [
    {
      unitLabel: 'Exponential and logarithmic functions',
      outcome: 'Change of base',
      questionText: 'Rewrite log base 5 of 20 using the change of base formula.',
    },
  ]);
  const match = report.matches[0].bestMatch;
  assert.ok(match);
  assert.equal(match.problemTypeId, 'mhf4u-u7-change-of-base');
  assert.equal(match.reason, 'keyword_overlap');
  assert.ok(match.score >= MATCH_FLOOR);
  assert.ok(match.sharedTerms.length > 0);
});

test('import: scopes matching to the resolved unit', () => {
  // "factor" appears in polynomial and rational contexts. Filed under rational
  // functions, it must not match the unit-3 factor theorem slot.
  const report = reconcileExtractedBank('MHF4U', [
    {
      unitLabel: 'Rational functions',
      outcome: 'Identify holes by looking at common factors',
      questionText: 'Which value of x produces a hole rather than a vertical asymptote?',
    },
  ]);
  const match = report.matches[0].bestMatch;
  assert.ok(match);
  assert.equal(match.unitId, 'mhf4u-u4-rational-functions');
});

test('import: resolves a unit heading that is worded differently', () => {
  const report = reconcileExtractedBank('MHF4U', [
    {
      unitLabel: 'Trigonometric Identities',
      outcome: 'Prove a trigonometric identity',
      questionText: 'Prove that the left side equals the right side.',
    },
  ]);
  assert.deepEqual(report.unmatchedUnitLabels, []);
  assert.equal(report.matches[0].bestMatch?.unitId, 'mhf4u-u6-trigonometric-identities');
});

test('import: reports a unit heading it cannot resolve, and falls back to the whole course', () => {
  const report = reconcileExtractedBank('MHF4U', [
    {
      unitLabel: 'Chapter 12: Miscellaneous',
      outcome: 'Find k given a known factor',
      questionText: 'Find k.',
    },
  ]);
  assert.deepEqual(report.unmatchedUnitLabels, ['Chapter 12: Miscellaneous']);
  // The unit did not resolve, but the outcome still found its home course-wide.
  assert.equal(report.matches[0].bestMatch?.problemTypeId, 'mhf4u-u3-factor-theorem-find-k');
});

test('import: offers alternatives below the best match', () => {
  const report = reconcileExtractedBank('MHF4U', [
    {
      unitLabel: 'Exponential and logarithmic functions',
      outcome: 'Solve a logarithmic equation',
      questionText: 'Solve for x.',
    },
  ]);
  const match = report.matches[0];
  assert.ok(match.bestMatch);
  assert.ok(match.alternatives.length > 0, 'expected sibling log-equation slots as alternatives');
  assert.ok(
    match.alternatives.every((alt) => alt.score <= match.bestMatch!.score),
    'alternatives must not outscore the best match',
  );
  assert.ok(
    !match.alternatives.some((alt) => alt.problemTypeId === match.bestMatch!.problemTypeId),
    'the best match must not repeat in alternatives',
  );
});

test('import: an unmatched outcome carries its nearest rejected candidates', () => {
  const report = reconcileExtractedBank('MHF4U', FIXTURE);
  const unmatched = report.unmatchedOutcomes[0];
  // Nothing in MHF4U is about matrices, so anything offered must be below the floor.
  assert.ok(unmatched.nearestCandidates.every((c) => c.score < MATCH_FLOOR));
});

test('import: groups repeated outcomes rather than listing them once each', () => {
  const repeated: ExtractedQuestion[] = [
    { unitLabel: 'Polynomial functions', outcome: 'Invert a 3x3 matrix', questionText: 'One.' },
    { unitLabel: 'Polynomial functions', outcome: 'Invert a 3x3 matrix', questionText: 'Two.' },
    { unitLabel: 'Polynomial functions', outcome: 'Invert a 3x3 matrix', questionText: 'Three.' },
  ];
  const report = reconcileExtractedBank('MHF4U', repeated);
  assert.equal(report.unmatchedOutcomes.length, 1);
  assert.equal(report.unmatchedOutcomes[0].questionCount, 3);
  assert.deepEqual(report.unmatchedOutcomes[0].questionIndices, [0, 1, 2]);
});

test('import: unmatched outcomes are ordered by how many questions they carry', () => {
  const report = reconcileExtractedBank('MHF4U', [
    { unitLabel: 'Polynomial functions', outcome: 'Matrix inversion', questionText: 'a' },
    { unitLabel: 'Polynomial functions', outcome: 'Vector cross products', questionText: 'b' },
    { unitLabel: 'Polynomial functions', outcome: 'Vector cross products', questionText: 'c' },
  ]);
  assert.equal(report.unmatchedOutcomes[0].outcome, 'Vector cross products');
  assert.equal(report.unmatchedOutcomes[0].questionCount, 2);
});

// --- edge cases ---------------------------------------------------------------

test('import: an empty bank reports every slot as uncovered and none as examined', () => {
  const report = reconcileExtractedBank('MHF4U', []);
  assert.equal(report.matches.length, 0);
  assert.deepEqual(report.unmatchedOutcomes, []);
  assert.equal(report.uncoveredProblemTypes.length, allProblemTypes('MHF4U').length);
  assert.ok(report.uncoveredProblemTypes.every((t) => !t.unitWasExtracted));
  assert.equal(report.summary.questionsIn, 0);
});

test('import: an unknown course code throws', () => {
  assert.throws(() => reconcileExtractedBank('MCV4U', FIXTURE), /Unknown course code/);
});

test('import: tolerates blank outcomes and unit labels without crashing', () => {
  const report = reconcileExtractedBank('MHF4U', [
    { unitLabel: '', outcome: '', questionText: '' },
  ]);
  assert.equal(report.matches.length, 1);
  assert.equal(report.matches[0].bestMatch, null);
  assert.deepEqual(report.unmatchedUnitLabels, [], 'a blank heading is not a failed resolution');
});

test('import: matching is case- and punctuation-insensitive', () => {
  const report = reconcileExtractedBank('MHF4U', [
    {
      unitLabel: 'POLYNOMIAL EQUATIONS AND INEQUALITIES',
      outcome: '  find K, given a known factor!  ',
      questionText: 'Find k.',
    },
  ]);
  assert.equal(report.matches[0].bestMatch?.problemTypeId, 'mhf4u-u3-factor-theorem-find-k');
});

test('import: is pure — it does not mutate the taxonomy', () => {
  const before = JSON.stringify(allProblemTypes('MHF4U'));
  reconcileExtractedBank('MHF4U', FIXTURE);
  assert.equal(JSON.stringify(allProblemTypes('MHF4U')), before);
});

// --- rendering ----------------------------------------------------------------

test('import: formatReconciliation renders the three questions it answers', () => {
  const text = formatReconciliation(reconcileExtractedBank('MHF4U', FIXTURE));
  assert.match(text, /Reconciliation against MHF4U/);
  assert.match(text, /1\/2 extracted questions matched a slot/);
  assert.match(text, /Extracted outcomes with no slot \(1\)/);
  assert.match(text, /Invert a 3x3 matrix by row reduction/);
  assert.match(text, /Slots with no extracted questions, in units that WERE extracted/);
  assert.match(text, /unexamined, not evidence of anything/);
});

test('import: formatReconciliation handles an empty bank', () => {
  const text = formatReconciliation(reconcileExtractedBank('MHF4U', []));
  assert.match(text, /0\/0 extracted questions matched/);
  assert.match(text, /\(none\)/);
});

// --- regressions --------------------------------------------------------------

test('import: a single coincidental word in the question text cannot carry a match', () => {
  // "One." shares the word "one" with the outcome of
  // mhf4u-u2-write-equation-from-zeros-and-point ("given zeros and one point").
  // The smaller-set denominator scored that 1.0 and matched it.
  const report = reconcileExtractedBank('MHF4U', [
    { unitLabel: 'Polynomial functions', outcome: 'Invert a 3x3 matrix', questionText: 'One.' },
  ]);
  assert.equal(report.matches[0].bestMatch, null);
});

test('import: two shared terms in the question text is enough', () => {
  const report = reconcileExtractedBank('MHF4U', [
    {
      unitLabel: 'Polynomial functions',
      outcome: 'Unlabelled',
      questionText: 'Use finite differences to find the degree of the polynomial.',
    },
  ]);
  const match = report.matches[0].bestMatch;
  assert.ok(match, 'a question body with real topic vocabulary should still match');
  assert.match(match.problemTypeId, /finite-differences/);
});

test('import: unit resolution prefers the longer term overlap over the higher score', () => {
  // "Trigonometric Identities" shares 1 term with unit 5 and 2 with unit 6;
  // both score 1.0 under a smaller-set denominator, so shared count decides.
  const report = reconcileExtractedBank('MHF4U', [
    {
      unitLabel: 'Trigonometric Identities',
      outcome: 'Solve a linear trig equation over an interval',
      questionText: 'Solve 2 sin x - 1 = 0 for all x in [0, 2pi].',
    },
  ]);
  assert.equal(report.matches[0].bestMatch?.unitId, 'mhf4u-u6-trigonometric-identities');
});
