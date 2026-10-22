import { TUNING } from "../domain/tuning";
import type { TypeScore } from "./eval-score";
import { NEVER_AUTO_SEND, REPLY_TYPES, type ReplyType } from "./policy";

/**
 * The auto-send gate (REQ-45 AC10, spec decision 21, tracker ADR 0069).
 * Pure. A reply type may be switched to auto-send (Iris 9/9) only when it
 * passes; this card only shows the result. Every failing condition is named.
 */
export type GateCondition =
  | "never_auto_send"
  | "no_run"
  | "stale_run"
  | "labelled_count"
  | "precision"
  | "sensitive_recall"
  | "mean_rating"
  | "streak";

/** The latest recorded iris.eval_runs row, as the gate reads it. */
export type GateRun = {
  policyVersion: number;
  model: string | null;
  perType: Record<string, TypeScore>;
  sensitiveRecall: number | null;
  meanRatingPerType: Record<string, number>;
};

export type GateStreak = { uneditedStreak: number; streakPolicyVersion: number | null };

/** The reply types that could ever be switched on: never-auto-send and no_reply_needed are left out. */
export const AUTO_SEND_CANDIDATES: readonly ReplyType[] = REPLY_TYPES.filter(
  (t) => t !== "no_reply_needed" && !(NEVER_AUTO_SEND as readonly string[]).includes(t),
);

export function evaluateGate(input: {
  type: string;
  run: GateRun | null;
  replyType: GateStreak | null;
  policyVersion: number;
  model: string;
}): { pass: boolean; failing: GateCondition[] } {
  if ((NEVER_AUTO_SEND as readonly string[]).includes(input.type)) return { pass: false, failing: ["never_auto_send"] };
  const failing: GateCondition[] = [];
  const { run } = input;
  if (!run) {
    failing.push("no_run");
  } else if (run.policyVersion !== input.policyVersion || run.model !== input.model) {
    failing.push("stale_run");
  } else {
    const score = run.perType[input.type];
    const rating = run.meanRatingPerType[input.type];
    if (!score || score.count < TUNING.irisGateMinLabelled) failing.push("labelled_count");
    if (!score || score.precision === null || score.precision < TUNING.irisGateMinPrecision) failing.push("precision");
    if (run.sensitiveRecall === null || run.sensitiveRecall < TUNING.irisGateMinSensitiveRecall) failing.push("sensitive_recall");
    if (rating === undefined || rating < TUNING.irisGateMinMeanRating) failing.push("mean_rating");
  }
  const rt = input.replyType;
  if (!rt || rt.uneditedStreak < TUNING.irisAutoSendStreak || rt.streakPolicyVersion !== input.policyVersion) failing.push("streak");
  return { pass: failing.length === 0, failing };
}
