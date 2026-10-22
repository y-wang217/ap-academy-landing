import { z } from "zod";
import { scoreEval, type ScoreRow } from "../iris/eval-score";
import {
  EvalLabelRow, EvalResultRow, EvalRunRow, EventRow,
  type EvalFilter, type EvalItem, type EvalLabel, type EvalResultView, type EvalStatus, type GateInputs,
} from "../iris/eval-schemas";
import { FINISHED_KIND, type IrisClient } from "./iris";

/**
 * The owner's eval reads and writes (REQ-45), on the owner's own client, so
 * RLS decides: labels and ratings in iris.eval_labels, requests as the
 * owner's own iris.events rows, recorded runs in iris.eval_runs. It never
 * writes eval_results (only the run does). Every row is parsed and every
 * query error throws.
 */
export type EvalReader = {
  listEvalItems(filter: EvalFilter, page: number): Promise<{ items: EvalItem[]; total: number }>;
  evalStatus(): Promise<EvalStatus>;
  /** not_found when the message is not an imported history message of the org. */
  saveLabel(messageId: string, input: { goldIntent: string; goldReplyType: string | null; goldEscalate: boolean; note: string | null }): Promise<"ok" | "not_found">;
  /** invalid when the result is not this message's draft from the rated request, or the message has no label. */
  saveRating(messageId: string, resultId: string, rating: number): Promise<"ok" | "invalid">;
  requestEval(kind: keyof typeof FINISHED_KIND, detail: Record<string, string | number>): Promise<void>;
  recordRun(requestId: number): Promise<"ok" | "not_finished" | "has_errors" | "not_found">;
  gateInputs(): Promise<GateInputs>;
};

export const EVAL_PAGE_SIZE = 25;
const CHUNK = 100;
/** Imported messages the page reads ids for. A year of family mail is far below this. */
const MAX_HISTORY = 5000;
const EVENT_WINDOW = 200;

const fail = (): never => {
  throw new Error("iris unavailable");
};

const labelOf = (r: z.infer<typeof EvalLabelRow>): EvalLabel => ({
  goldIntent: r.gold_intent, goldReplyType: r.gold_reply_type, goldEscalate: r.gold_escalate, note: r.note, draftRating: r.draft_rating, ratedResultId: r.rated_result_id,
});
const resultOf = (r: z.infer<typeof EvalResultRow>): EvalResultView => ({
  id: r.id, requestEventId: r.request_event_id, policyVersion: r.policy_version, predictedIntent: r.predicted_intent,
  predictedReplyType: r.predicted_reply_type, predictedEscalate: r.predicted_escalate, draftBody: r.draft_body, outcome: r.outcome,
});
const fullyLabelled = (l: EvalLabel | undefined) => !!l && l.goldIntent !== null && l.goldEscalate !== null;
const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);
const str = (v: unknown) => (typeof v === "string" ? v : null);

export function createEvalReader(iris: IrisClient, orgId: string, uid: () => Promise<string | null>): EvalReader {
  const RESULT_SELECT = "id, message_id, request_event_id, policy_version, model, predicted_intent, predicted_reply_type, predicted_escalate, draft_body, outcome";
  const LABEL_SELECT = "message_id, gold_intent, gold_reply_type, gold_escalate, draft_rating, note, rated_result_id";

  async function inChunks<T>(ids: string[], read: (chunk: string[]) => PromiseLike<{ data: unknown; error: unknown }>, row: z.ZodType<T>): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await read(ids.slice(i, i + CHUNK));
      if (error) fail();
      out.push(...z.array(row).parse(data ?? []));
    }
    return out;
  }

  /** Imported inbound messages, newest first: ids and dates only. */
  async function historyIds(): Promise<{ id: string; received_at: string }[]> {
    const { data, error } = await iris
      .from("messages")
      .select("id, received_at")
      .eq("org_id", orgId)
      .eq("direction", "inbound")
      .eq("escalation_reason", "history_import")
      .order("received_at", { ascending: false })
      .limit(MAX_HISTORY);
    if (error) fail();
    return z.array(z.object({ id: z.guid(), received_at: z.string() })).parse(data ?? []);
  }

  async function allLabels(): Promise<Map<string, EvalLabel>> {
    const { data, error } = await iris.from("eval_labels").select(LABEL_SELECT).eq("org_id", orgId);
    if (error) fail();
    return new Map(z.array(EvalLabelRow).parse(data ?? []).map((r) => [r.message_id, labelOf(r)]));
  }

  async function resultsOf(requestId: number): Promise<z.infer<typeof EvalResultRow>[]> {
    const { data, error } = await iris.from("eval_results").select(RESULT_SELECT).eq("org_id", orgId).eq("request_event_id", requestId);
    if (error) fail();
    return z.array(EvalResultRow).parse(data ?? []);
  }

  async function latestRun() {
    const { data, error } = await iris
      .from("eval_runs")
      .select("ran_at, policy_version, model, labelled_count, per_type, sensitive_recall, mean_rating_per_type")
      .eq("org_id", orgId)
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail();
    return data ? EvalRunRow.parse(data) : null;
  }

  /** The newest request of each kind, its finish, and the newest finished, not stale, run request. */
  async function requests() {
    const { data, error } = await iris
      .from("events")
      .select("id, at, kind, detail")
      .eq("org_id", orgId)
      .in("kind", ["eval_import_requested", "eval_import_finished", "eval_run_requested", "eval_run_finished"])
      .order("id", { ascending: false })
      .limit(EVENT_WINDOW);
    if (error) fail();
    const events = z.array(EventRow).parse(data ?? []);
    const finishOf = (kind: string, id: number) => events.find((e) => e.kind === kind && num(e.detail.request_id, -1) === id) ?? null;
    const imp = events.find((e) => e.kind === "eval_import_requested") ?? null;
    const run = events.find((e) => e.kind === "eval_run_requested") ?? null;
    const impDone = imp ? finishOf("eval_import_finished", imp.id) : null;
    const runDone = run ? finishOf("eval_run_finished", run.id) : null;
    const rated = events.find((e) => {
      if (e.kind !== "eval_run_requested") return false;
      const done = finishOf("eval_run_finished", e.id);
      return done !== null && done.detail.reason === undefined;
    });
    return {
      importRequest: imp
        ? {
            id: imp.id, at: imp.at,
            finished: impDone
              ? { at: impDone.at, storedInbound: num(impDone.detail.stored_inbound), storedReplies: num(impDone.detail.stored_replies), skipped: num(impDone.detail.skipped), capped: impDone.detail.capped === true }
              : null,
          }
        : null,
      runRequest: run
        ? {
            id: run.id, at: run.at, policyVersion: typeof run.detail.policy_version === "number" ? run.detail.policy_version : null, model: str(run.detail.model),
            finished: runDone ? { at: runDone.at, scored: num(runDone.detail.scored), errors: num(runDone.detail.errors), reason: str(runDone.detail.reason) } : null,
          }
        : null,
      ratedRequestId: rated?.id ?? null,
    };
  }

  const scoreRows = (results: z.infer<typeof EvalResultRow>[], labels: Map<string, EvalLabel>): ScoreRow[] =>
    results.flatMap((r) => {
      const l = labels.get(r.message_id);
      if (!l || !fullyLabelled(l)) return [];
      return [{
        goldIntent: l.goldIntent!, goldReplyType: l.goldReplyType, goldEscalate: l.goldEscalate!, predictedReplyType: r.predicted_reply_type,
        predictedEscalate: r.predicted_escalate, rating: l.ratedResultId === r.id ? l.draftRating : null,
      }];
    });

  return {
    async listEvalItems(filter, page) {
      const [ids, labels, req] = await Promise.all([historyIds(), allLabels(), requests()]);
      const wanted = ids.filter((m) => filter === "all" || (filter === "labelled") === fullyLabelled(labels.get(m.id)));
      const pageIds = wanted.slice((page - 1) * EVAL_PAGE_SIZE, page * EVAL_PAGE_SIZE).map((m) => m.id);
      if (pageIds.length === 0) return { items: [], total: wanted.length };

      const msgs = await inChunks(
        pageIds,
        (c) => iris.from("messages").select("id, thread_id, from_email, received_at, body_text").eq("org_id", orgId).in("id", c),
        z.object({ id: z.guid(), thread_id: z.guid(), from_email: z.string(), received_at: z.string(), body_text: z.string().nullable() }),
      );
      const threadIds = [...new Set(msgs.map((m) => m.thread_id))];
      const [threads, replies, results] = await Promise.all([
        inChunks(threadIds, (c) => iris.from("threads").select("id, subject, notion_student_ids").eq("org_id", orgId).in("id", c), z.object({ id: z.guid(), subject: z.string().nullable(), notion_student_ids: z.array(z.guid()) })),
        inChunks(
          threadIds,
          (c) => iris.from("messages").select("thread_id, received_at, body_text").eq("org_id", orgId).eq("source", "charlie_manual").in("thread_id", c).order("received_at", { ascending: true }),
          z.object({ thread_id: z.guid(), received_at: z.string(), body_text: z.string().nullable() }),
        ),
        req.ratedRequestId === null
          ? Promise.resolve([])
          : inChunks(pageIds, (c) => iris.from("eval_results").select(RESULT_SELECT).eq("org_id", orgId).eq("request_event_id", req.ratedRequestId!).in("message_id", c), EvalResultRow),
      ]);
      const threadOf = new Map(threads.map((t) => [t.id, t]));
      const resultOfMsg = new Map(results.map((r) => [r.message_id, resultOf(r)]));
      const byId = new Map(msgs.map((m) => [m.id, m]));
      const items: EvalItem[] = pageIds.flatMap((id) => {
        const m = byId.get(id);
        if (!m) return [];
        const t = threadOf.get(m.thread_id);
        const reply = replies.find((r) => r.thread_id === m.thread_id && r.received_at > m.received_at);
        return [{
          id, receivedAt: m.received_at, fromEmail: m.from_email, subject: t?.subject ?? null, notionStudentIds: t?.notion_student_ids ?? [], bodyText: m.body_text,
          reply: reply ? (reply.body_text ?? "") : null, label: labels.get(id) ?? null, result: resultOfMsg.get(id) ?? null,
        }];
      });
      return { items, total: wanted.length };
    },

    async evalStatus() {
      const [ids, labels, req, run] = await Promise.all([historyIds(), allLabels(), requests(), latestRun()]);
      const imported = new Set(ids.map((m) => m.id));
      const labelled = [...labels.entries()].filter(([id, l]) => imported.has(id) && fullyLabelled(l)).length;
      const rated = req.ratedRequestId === null ? [] : await resultsOf(req.ratedRequestId);
      const current = req.runRequest && !req.runRequest.finished ? await resultsOf(req.runRequest.id) : rated;
      const unratedDrafts = rated.filter((r) => r.draft_body !== null && labels.get(r.message_id)?.ratedResultId !== r.id).length;
      return {
        ...req,
        latestRun: run,
        confusion: rated.length > 0 ? scoreEval(scoreRows(rated, labels)).confusion : null,
        counts: { imported: imported.size, labelled, evalTotal: labelled, evalDone: current.length, unratedDrafts },
      };
    },

    async saveLabel(messageId, input) {
      const actor = await uid();
      if (!actor) fail();
      const m = await iris.from("messages").select("id").eq("org_id", orgId).eq("id", messageId).eq("escalation_reason", "history_import").maybeSingle();
      if (m.error) fail();
      if (!m.data) return "not_found";
      const columns = { gold_intent: input.goldIntent, gold_reply_type: input.goldReplyType, gold_escalate: input.goldEscalate, note: input.note, labelled_by: actor };
      // Update first, then insert: the owner's insert grant has no labelled_at, so a single upsert cannot refresh it.
      const update = () => iris.from("eval_labels").update({ ...columns, labelled_at: new Date().toISOString() }).eq("org_id", orgId).eq("message_id", messageId).select("message_id");
      const first = await update();
      if (first.error) fail();
      if (z.array(z.unknown()).parse(first.data ?? []).length > 0) return "ok";
      const ins = await iris.from("eval_labels").insert({ org_id: orgId, message_id: messageId, ...columns });
      if (!ins.error) return "ok";
      // Two tabs raced to the first label: the other insert won, so update it.
      if ((ins.error as { code?: string }).code !== "23505") fail();
      const again = await update();
      if (again.error) fail();
      return "ok";
    },

    async saveRating(messageId, resultId, rating) {
      const actor = await uid();
      if (!actor) fail();
      const req = await requests();
      if (req.ratedRequestId === null) return "invalid";
      const r = await iris.from("eval_results").select(RESULT_SELECT).eq("org_id", orgId).eq("id", resultId).maybeSingle();
      if (r.error) fail();
      const result = r.data ? EvalResultRow.parse(r.data) : null;
      if (!result || result.message_id !== messageId || result.request_event_id !== req.ratedRequestId || result.draft_body === null) return "invalid";
      const { data, error } = await iris
        .from("eval_labels")
        .update({ draft_rating: rating, rated_result_id: resultId, labelled_by: actor })
        .eq("org_id", orgId)
        .eq("message_id", messageId)
        .select("message_id");
      if (error) fail();
      return z.array(z.unknown()).parse(data ?? []).length > 0 ? "ok" : "invalid";
    },

    async requestEval(kind, detail) {
      const actor = await uid();
      if (!actor) fail();
      const { error } = await iris.from("events").insert({ org_id: orgId, kind, actor, detail });
      if (error) fail();
    },

    async recordRun(requestId) {
      const req = await requests();
      if (req.runRequest?.id === requestId && !req.runRequest.finished) return "not_finished";
      if (req.ratedRequestId !== requestId) return "not_found";
      const [results, labels] = await Promise.all([resultsOf(requestId), allLabels()]);
      if (results.some((r) => r.outcome === "error")) return "has_errors";
      const policyVersion = results[0]?.policy_version ?? req.runRequest?.policyVersion;
      if (policyVersion === undefined || policyVersion === null) return "not_found";
      const s = scoreEval(scoreRows(results, labels));
      const { error } = await iris.from("eval_runs").insert({
        org_id: orgId, policy_version: policyVersion, model: results[0]?.model ?? null, labelled_count: s.labelledCount, per_type: s.perType,
        sensitive_recall: s.sensitiveRecall === null ? null : Math.round(s.sensitiveRecall * 1000) / 1000, mean_rating_per_type: s.meanRatingPerType,
      });
      if (error) fail();
      return "ok";
    },

    async gateInputs() {
      const [run, rt] = await Promise.all([latestRun(), iris.from("reply_types").select("type, unedited_streak, streak_policy_version").eq("org_id", orgId)]);
      if (rt.error) fail();
      const replyTypes: GateInputs["replyTypes"] = {};
      for (const r of z.array(z.object({ type: z.string(), unedited_streak: z.number().int(), streak_policy_version: z.number().int().nullable() })).parse(rt.data ?? [])) {
        replyTypes[r.type] = { uneditedStreak: r.unedited_streak, streakPolicyVersion: r.streak_policy_version };
      }
      return { run, replyTypes };
    },
  };
}
