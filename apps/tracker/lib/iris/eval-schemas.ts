import { z } from "zod";
import type { GateRun, GateStreak } from "./gate";

/** REQ-45: the shapes the eval page, the settings card and the eval routes read. Every row is parsed (ADR 0017). */

export const EvalLabelRow = z.object({
  message_id: z.guid(),
  gold_intent: z.string().nullable(),
  gold_reply_type: z.string().nullable(),
  gold_escalate: z.boolean().nullable(),
  draft_rating: z.number().int().nullable(),
  note: z.string().nullable(),
  rated_result_id: z.guid().nullable(),
});

export const EvalResultRow = z.object({
  id: z.guid(),
  message_id: z.guid(),
  request_event_id: z.number().int(),
  policy_version: z.number().int(),
  model: z.string().nullable(),
  predicted_intent: z.string().nullable(),
  predicted_reply_type: z.string().nullable(),
  predicted_escalate: z.boolean(),
  draft_body: z.string().nullable(),
  outcome: z.enum(["ok", "error"]),
});

const TypeScoreJson = z.object({ precision: z.number().nullable(), recall: z.number().nullable(), count: z.number().int() });

export const EvalRunRow = z
  .object({
    ran_at: z.string(),
    policy_version: z.number().int(),
    model: z.string().nullable(),
    labelled_count: z.number().int(),
    per_type: z.record(z.string(), TypeScoreJson),
    sensitive_recall: z.coerce.number().nullable(),
    mean_rating_per_type: z.record(z.string(), z.number()),
  })
  .transform((r) => ({
    ranAt: r.ran_at, policyVersion: r.policy_version, model: r.model, labelledCount: r.labelled_count, perType: r.per_type,
    sensitiveRecall: r.sensitive_recall, meanRatingPerType: r.mean_rating_per_type,
  }));
export type RecordedRun = z.infer<typeof EvalRunRow>;

export const EventRow = z.object({ id: z.number().int(), at: z.string(), kind: z.string(), detail: z.record(z.string(), z.unknown()) });

export type EvalLabel = {
  goldIntent: string | null;
  goldReplyType: string | null;
  goldEscalate: boolean | null;
  note: string | null;
  draftRating: number | null;
  ratedResultId: string | null;
};

export type EvalResultView = {
  id: string;
  requestEventId: number;
  policyVersion: number;
  predictedIntent: string | null;
  predictedReplyType: string | null;
  predictedEscalate: boolean;
  draftBody: string | null;
  outcome: "ok" | "error";
};

/** One imported inbound message on /iris/eval. */
export type EvalItem = {
  id: string;
  receivedAt: string;
  fromEmail: string;
  subject: string | null;
  notionStudentIds: string[];
  bodyText: string | null;
  /** Charlie's first reply after it in the thread, or null. */
  reply: string | null;
  label: EvalLabel | null;
  /** The latest finished request's result for it, or null. */
  result: EvalResultView | null;
};

export type EvalFilter = "unlabelled" | "labelled" | "all";

export type EvalStatus = {
  importRequest: {
    id: number;
    at: string;
    finished: { at: string; storedInbound: number; storedReplies: number; skipped: number; capped: boolean } | null;
  } | null;
  runRequest: {
    id: number;
    at: string;
    policyVersion: number | null;
    model: string | null;
    finished: { at: string; scored: number; errors: number; reason: string | null } | null;
  } | null;
  /** The newest finished, not stale, run request: the one whose drafts are rated and recorded. */
  ratedRequestId: number | null;
  latestRun: RecordedRun | null;
  /** Gold reply type or escalate, against predicted, for the rated request's results; null once they are purged. */
  confusion: Record<string, Record<string, number>> | null;
  counts: { imported: number; labelled: number; evalTotal: number; evalDone: number; unratedDrafts: number };
};

export type GateInputs = { run: (GateRun & { ranAt: string }) | null; replyTypes: Record<string, GateStreak> };
