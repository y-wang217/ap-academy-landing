/**
 * Reconciliation between an extracted question bank and the taxonomy.
 *
 * The taxonomy in `mhf4u.ts` is a provisional guess written from the standard
 * course outline. Tomorrow it meets reality: a bank of questions extracted from
 * real textbook sections, organized by learning outcome. This file makes that
 * meeting a ten-minute job instead of an hour of scrolling.
 *
 * It answers three questions:
 * 1. Which extracted outcomes **map onto a slot** that already exists?
 * 2. Which extracted outcomes have **no slot** — a topic the guess missed?
 * 3. Which slots got **no extracted questions** — a guess that may be wrong,
 *    or a topic this particular textbook section did not cover?
 *
 * **Deliberately no file parsing.** The input format is not known yet, and
 * guessing at it would mean writing a parser that gets thrown away. The
 * contract is a plain array of objects; whatever produces that array tomorrow —
 * a paste, a script, a hand-typed literal — is not this file's problem.
 *
 * **Matching is a suggestion, not a decision.** Every match carries a `score`
 * and a `reason`, and the caller is expected to read them. Nothing here writes
 * to the taxonomy: reconciliation ends with a human editing `mhf4u.ts` and
 * setting `status: 'confirmed'`.
 */

import { allProblemTypes, allUnits, getCourse } from './index.ts';
import type { ProblemType, Unit } from './types.ts';

/**
 * One row of an extracted bank.
 *
 * Whatever the extraction produces tomorrow gets shaped into this before being
 * passed in. All three fields are free text as they appear in the source — do
 * not pre-normalize, the matcher does that.
 */
export interface ExtractedQuestion {
  /** The unit heading as written in the source, e.g. `"Polynomial Equations"`. */
  unitLabel: string;
  /** The learning outcome as written in the source. */
  outcome: string;
  /** The question text itself. Used for keyword evidence when the outcome is thin. */
  questionText: string;
}

/** How a match was arrived at, so a human can judge whether to trust it. */
export type MatchReason =
  /** The outcome text is (after normalization) the problem type's label. */
  | 'exact_label'
  /** The outcome text is the problem type's outcome. */
  | 'exact_outcome'
  /** Distinctive words shared between the extracted text and the slot. */
  | 'keyword_overlap';

/** One extracted question, matched (or not) against the taxonomy. */
export interface QuestionMatch {
  /** Index of the question in the input array, so the caller can find it again. */
  index: number;
  question: ExtractedQuestion;
  /** The best-scoring candidate, or `null` when nothing scored above the floor. */
  bestMatch: MatchCandidate | null;
  /** Other candidates worth a look, best first. Never includes `bestMatch`. */
  alternatives: MatchCandidate[];
}

/** A possible home for an extracted question. */
export interface MatchCandidate {
  problemTypeId: string;
  label: string;
  unitId: string;
  /** 0..1. Not a probability — a ranking aid. */
  score: number;
  reason: MatchReason;
  /** The words that drove a `keyword_overlap` match, for eyeballing. */
  sharedTerms: string[];
}

/** An extracted outcome with nowhere to go. */
export interface UnmatchedOutcome {
  /** The outcome text, deduplicated across questions. */
  outcome: string;
  /** The unit label(s) it appeared under in the source. */
  unitLabels: string[];
  /** How many extracted questions carried this outcome. */
  questionCount: number;
  /** Indices into the input array. */
  questionIndices: number[];
  /**
   * The nearest slots that were considered and rejected, best first.
   *
   * An unmatched outcome with a near miss usually means a slug drifted; one with
   * no near miss usually means a genuinely missing topic.
   */
  nearestCandidates: MatchCandidate[];
}

/** A taxonomy slot that the extracted bank had nothing for. */
export interface UncoveredProblemType {
  problemTypeId: string;
  label: string;
  unitId: string;
  unitLabel: string;
  unitOrder: number;
  status: ProblemType['status'];
  /**
   * `true` when the bank contained questions for this slot's *unit* but none for
   * this slot.
   *
   * That is the interesting case: the section was extracted and this type still
   * got nothing, which is real evidence the guess was wrong. A slot in a unit
   * nobody extracted is simply unexamined.
   */
  unitWasExtracted: boolean;
}

/** The whole reconciliation. */
export interface ReconciliationReport {
  courseCode: string;
  /** Every extracted question with its match, in input order. */
  matches: QuestionMatch[];
  /** Extracted outcomes with no slot, by descending question count. */
  unmatchedOutcomes: UnmatchedOutcome[];
  /** Taxonomy slots with no extracted questions, in course order. */
  uncoveredProblemTypes: UncoveredProblemType[];
  /** Source unit labels that did not resolve to a taxonomy unit. */
  unmatchedUnitLabels: string[];
  summary: {
    questionsIn: number;
    questionsMatched: number;
    distinctOutcomesIn: number;
    outcomesMatched: number;
    problemTypesTotal: number;
    problemTypesHit: number;
  };
}

/**
 * Minimum score for a candidate to be offered as `bestMatch`.
 *
 * Deliberately low. A weak suggestion a human dismisses in two seconds costs
 * less than a missed match they have to find by scrolling the tree.
 */
export const MATCH_FLOOR = 0.25;

/** How many alternatives to keep per question. */
export const MAX_ALTERNATIVES = 3;

/**
 * How many shared terms the **question text** alone must contribute before it
 * can carry a match.
 *
 * One shared word is not evidence. A question body reading "One." matched a slot
 * whose outcome mentions "zeros and one point", scoring 1.0 because the body had
 * exactly one content word — the smaller-set denominator turns a single
 * coincidence into a perfect score. The outcome heading is deliberate text and
 * may still match on one term; an incidental word in a question body may not.
 */
export const MIN_TEXT_TERMS_FOR_MATCH = 2;

/**
 * Words carrying no topic information. Left out of overlap scoring, or every
 * outcome would match every other one on "the", "a", and "function".
 *
 * Note `function` is in here: in a course called Advanced Functions it is
 * present in nearly every outcome and so distinguishes nothing.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'find', 'for', 'from', 'given',
  'i', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'state', 'that', 'the', 'their', 'them',
  'then', 'this', 'to', 'use', 'using', 'when', 'where', 'which', 'with', 'without',
  'function', 'functions', 'question', 'questions', 'problem', 'problems', 'value', 'values',
  'determine', 'calculate', 'evaluate', 'solve', 'write', 'my', 'me', 'you', 'your',
]);

/** Lowercases, strips punctuation, and collapses whitespace. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Content words of a string, stop words and one-character tokens removed. */
function terms(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(' ')
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  );
}

/**
 * Jaccard-style overlap between two term sets, biased toward the smaller set.
 *
 * A short extracted outcome ("factor theorem") should still match a longer slot
 * outcome strongly, so the denominator is the smaller set's size rather than the
 * union's. Plain Jaccard would punish the short side for being short.
 */
function overlapScore(a: Set<string>, b: Set<string>): { score: number; shared: string[] } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: [] };
  const shared = [...a].filter((term) => b.has(term));
  return { score: shared.length / Math.min(a.size, b.size), shared: shared.sort() };
}

/** Scores one extracted question against one taxonomy slot. */
function scoreCandidate(
  question: ExtractedQuestion,
  problemType: ProblemType,
): MatchCandidate | null {
  const outcomeNorm = normalize(question.outcome);

  if (outcomeNorm.length > 0 && outcomeNorm === normalize(problemType.label)) {
    return {
      problemTypeId: problemType.id,
      label: problemType.label,
      unitId: problemType.unitId,
      score: 1,
      reason: 'exact_label',
      sharedTerms: [],
    };
  }
  if (outcomeNorm.length > 0 && outcomeNorm === normalize(problemType.outcome)) {
    return {
      problemTypeId: problemType.id,
      label: problemType.label,
      unitId: problemType.unitId,
      score: 1,
      reason: 'exact_outcome',
      sharedTerms: [],
    };
  }

  const slotTerms = new Set([...terms(problemType.label), ...terms(problemType.outcome)]);
  const outcomeTerms = terms(question.outcome);
  const outcomeOverlap = overlapScore(outcomeTerms, slotTerms);
  // The question text is weaker evidence than the outcome heading, so it is
  // discounted rather than pooled — otherwise a long question body full of
  // incidental vocabulary outvotes the outcome it was filed under. It is also
  // held to a minimum number of shared terms, so a single coincidental word
  // cannot carry a match on its own.
  const textOverlap = overlapScore(terms(question.questionText), slotTerms);
  const textScore =
    textOverlap.shared.length >= MIN_TEXT_TERMS_FOR_MATCH ? textOverlap.score * 0.6 : 0;
  const score = Math.max(outcomeOverlap.score, textScore);

  if (score <= 0) return null;
  return {
    problemTypeId: problemType.id,
    label: problemType.label,
    unitId: problemType.unitId,
    score,
    reason: 'keyword_overlap',
    sharedTerms: outcomeOverlap.shared.length > 0 ? outcomeOverlap.shared : textOverlap.shared,
  };
}

/** Resolves a source unit heading to a taxonomy unit, or `null`. */
function resolveUnit(unitLabel: string, units: Unit[]): Unit | null {
  const wanted = normalize(unitLabel);
  if (wanted.length === 0) return null;

  const exact = units.find((unit) => normalize(unit.label) === wanted);
  if (exact) return exact;

  // Ranked by how many terms are shared, then by score. Score alone is not
  // enough: "Trigonometric Identities" shares one term with "Trigonometric
  // functions" and two with "Trigonometric identities and equations", and both
  // score 1.0 under a smaller-set denominator. The longer overlap is the match.
  const wantedTerms = terms(unitLabel);
  let best: { unit: Unit; score: number; shared: number } | null = null;
  for (const unit of units) {
    const { score, shared } = overlapScore(wantedTerms, terms(unit.label));
    if (score <= 0) continue;
    if (
      best === null ||
      shared.length > best.shared ||
      (shared.length === best.shared && score > best.score)
    ) {
      best = { unit, score, shared: shared.length };
    }
  }
  return best && best.score >= 0.5 ? best.unit : null;
}

/**
 * Reconciles an extracted bank against a course's taxonomy.
 *
 * Pure and side-effect free — it reports, it does not edit the tree. Nothing
 * here decides anything; a human reads the output and edits `mhf4u.ts`.
 *
 * Matching is scoped to the resolved unit where the source unit label resolves,
 * and falls back to the whole course where it does not. A question filed under
 * "Polynomial Equations" should not match a rational-functions slot just because
 * both mention "factor".
 *
 * @throws {Error} if the course code is unknown.
 */
export function reconcileExtractedBank(
  courseCode: string,
  questions: ExtractedQuestion[],
): ReconciliationReport {
  const course = getCourse(courseCode);
  if (!course) {
    throw new Error(`Unknown course code ${JSON.stringify(courseCode)}.`);
  }

  const units = allUnits(course.code);
  const everyProblemType = allProblemTypes(course.code);

  const matches: QuestionMatch[] = [];
  const hitProblemTypeIds = new Set<string>();
  const extractedUnitIds = new Set<string>();
  const unmatchedUnitLabels = new Set<string>();

  questions.forEach((question, index) => {
    const unit = resolveUnit(question.unitLabel, units);
    if (unit) extractedUnitIds.add(unit.id);
    else if (question.unitLabel.trim() !== '') unmatchedUnitLabels.add(question.unitLabel);

    const searchSpace = unit ? unit.problemTypes : everyProblemType;
    const candidates = searchSpace
      .map((problemType) => scoreCandidate(question, problemType))
      .filter((candidate): candidate is MatchCandidate => candidate !== null)
      .sort((a, b) => b.score - a.score || a.problemTypeId.localeCompare(b.problemTypeId));

    const viable = candidates.filter((candidate) => candidate.score >= MATCH_FLOOR);
    const bestMatch = viable[0] ?? null;
    if (bestMatch) hitProblemTypeIds.add(bestMatch.problemTypeId);

    matches.push({
      index,
      question,
      bestMatch,
      alternatives: viable.slice(1, 1 + MAX_ALTERNATIVES),
    });
  });

  // --- extracted outcomes with nowhere to go, grouped and deduplicated -------
  const byOutcome = new Map<string, QuestionMatch[]>();
  for (const match of matches) {
    if (match.bestMatch !== null) continue;
    const key = match.question.outcome.trim();
    const existing = byOutcome.get(key);
    if (existing) existing.push(match);
    else byOutcome.set(key, [match]);
  }

  const unmatchedOutcomes: UnmatchedOutcome[] = [...byOutcome.entries()]
    .map(([outcome, group]) => {
      // Re-score against the whole course so a near miss shows up even when the
      // unit-scoped pass found nothing.
      const nearest = everyProblemType
        .map((problemType) => scoreCandidate(group[0].question, problemType))
        .filter((candidate): candidate is MatchCandidate => candidate !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ALTERNATIVES);
      return {
        outcome,
        unitLabels: [...new Set(group.map((match) => match.question.unitLabel))],
        questionCount: group.length,
        questionIndices: group.map((match) => match.index),
        nearestCandidates: nearest,
      };
    })
    .sort((a, b) => b.questionCount - a.questionCount || a.outcome.localeCompare(b.outcome));

  // --- taxonomy slots the bank had nothing for ------------------------------
  const uncoveredProblemTypes: UncoveredProblemType[] = [];
  for (const unit of units) {
    for (const problemType of unit.problemTypes) {
      if (hitProblemTypeIds.has(problemType.id)) continue;
      uncoveredProblemTypes.push({
        problemTypeId: problemType.id,
        label: problemType.label,
        unitId: unit.id,
        unitLabel: unit.label,
        unitOrder: unit.order,
        status: problemType.status,
        unitWasExtracted: extractedUnitIds.has(unit.id),
      });
    }
  }

  const distinctOutcomesIn = new Set(questions.map((question) => question.outcome.trim())).size;

  return {
    courseCode: course.code,
    matches,
    unmatchedOutcomes,
    uncoveredProblemTypes,
    unmatchedUnitLabels: [...unmatchedUnitLabels],
    summary: {
      questionsIn: questions.length,
      questionsMatched: matches.filter((match) => match.bestMatch !== null).length,
      distinctOutcomesIn,
      outcomesMatched: distinctOutcomesIn - unmatchedOutcomes.length,
      problemTypesTotal: everyProblemType.length,
      problemTypesHit: hitProblemTypeIds.size,
    },
  };
}

/**
 * Renders a reconciliation as text, for pasting into a handoff or reading in a
 * terminal. No CLI wraps this yet — tomorrow's caller decides how the bank
 * arrives, and a CLI written before that would guess at the input format.
 */
export function formatReconciliation(report: ReconciliationReport): string {
  const lines: string[] = [];
  const { summary } = report;
  lines.push(`Reconciliation against ${report.courseCode}`);
  lines.push(
    `  ${summary.questionsMatched}/${summary.questionsIn} extracted questions matched a slot.`,
  );
  lines.push(
    `  ${summary.outcomesMatched}/${summary.distinctOutcomesIn} distinct outcomes matched.`,
  );
  lines.push(
    `  ${summary.problemTypesHit}/${summary.problemTypesTotal} taxonomy slots received questions.`,
  );

  if (report.unmatchedUnitLabels.length > 0) {
    lines.push('');
    lines.push('Source unit headings that did not resolve to a taxonomy unit:');
    for (const label of report.unmatchedUnitLabels) lines.push(`  ${JSON.stringify(label)}`);
  }

  lines.push('');
  lines.push(`Extracted outcomes with no slot (${report.unmatchedOutcomes.length}):`);
  if (report.unmatchedOutcomes.length === 0) {
    lines.push('  (none)');
  }
  for (const unmatched of report.unmatchedOutcomes) {
    lines.push(
      `  ${JSON.stringify(unmatched.outcome)} — ${unmatched.questionCount} question(s), under ${unmatched.unitLabels.map((l) => JSON.stringify(l)).join(', ')}`,
    );
    for (const candidate of unmatched.nearestCandidates) {
      lines.push(
        `      nearest: ${candidate.problemTypeId} (${candidate.score.toFixed(2)}, ${candidate.reason})`,
      );
    }
  }

  const examined = report.uncoveredProblemTypes.filter((type) => type.unitWasExtracted);
  lines.push('');
  lines.push(
    `Slots with no extracted questions, in units that WERE extracted (${examined.length}):`,
  );
  if (examined.length === 0) lines.push('  (none)');
  for (const uncovered of examined) {
    lines.push(`  u${uncovered.unitOrder} ${uncovered.problemTypeId} — ${uncovered.label}`);
  }
  lines.push('');
  lines.push(
    `Slots in units that were not extracted at all: ${report.uncoveredProblemTypes.length - examined.length} (unexamined, not evidence of anything).`,
  );

  return lines.join('\n');
}
