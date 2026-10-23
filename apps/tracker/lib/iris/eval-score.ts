/**
 * The eval aggregates (REQ-45 AC8, AC9, tracker ADR 0074). Pure: one row per
 * labelled message of a finished eval request, nothing else. "Sendable as T"
 * means predicted not escalated with reply type T; a gold T means gold not
 * escalated with reply type T. Escalating is never a false positive.
 */
export type ScoreRow = {
  goldIntent: string;
  goldReplyType: string | null;
  goldEscalate: boolean;
  predictedReplyType: string | null;
  predictedEscalate: boolean;
  /** The owner's 1 to 5 rating of this request's draft, or null. */
  rating: number | null;
};

export type TypeScore = { precision: number | null; recall: number | null; count: number };

export type EvalScore = {
  labelledCount: number;
  perType: Record<string, TypeScore>;
  sensitiveRecall: number | null;
  meanRatingPerType: Record<string, number>;
  /** gold label to predicted label to count; labels are a reply type, "escalate" or "none". */
  confusion: Record<string, Record<string, number>>;
};

const sendable = (r: ScoreRow) => (r.predictedEscalate ? null : r.predictedReplyType);
const goldType = (r: ScoreRow) => (r.goldEscalate ? null : r.goldReplyType);
const label = (escalate: boolean, type: string | null) => (escalate ? "escalate" : (type ?? "none"));
const ratio = (num: number, den: number) => (den === 0 ? null : num / den);

export function scoreEval(rows: readonly ScoreRow[]): EvalScore {
  const types = new Set<string>();
  for (const r of rows) {
    const g = goldType(r);
    const p = sendable(r);
    if (g) types.add(g);
    if (p) types.add(p);
  }

  const perType: Record<string, TypeScore> = {};
  for (const t of types) {
    const predicted = rows.filter((r) => sendable(r) === t);
    const gold = rows.filter((r) => goldType(r) === t);
    perType[t] = {
      precision: ratio(predicted.filter((r) => goldType(r) === t).length, predicted.length),
      recall: ratio(gold.filter((r) => sendable(r) === t).length, gold.length),
      count: gold.length,
    };
  }

  const sensitive = rows.filter((r) => r.goldEscalate);
  const ratings = new Map<string, number[]>();
  for (const r of rows) {
    const p = sendable(r);
    if (p && r.rating !== null) ratings.set(p, [...(ratings.get(p) ?? []), r.rating]);
  }
  const meanRatingPerType: Record<string, number> = {};
  for (const [t, list] of ratings) meanRatingPerType[t] = list.reduce((a, b) => a + b, 0) / list.length;

  const confusion: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const g = label(r.goldEscalate, r.goldReplyType);
    const p = label(r.predictedEscalate, r.predictedReplyType);
    confusion[g] ??= {};
    confusion[g][p] = (confusion[g][p] ?? 0) + 1;
  }

  return {
    labelledCount: rows.length,
    perType,
    sensitiveRecall: ratio(sensitive.filter((r) => r.predictedEscalate).length, sensitive.length),
    meanRatingPerType,
    confusion,
  };
}
