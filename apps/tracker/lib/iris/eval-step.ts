import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import type { ClassifyPort } from "./classify";
import { CLASSIFY_HISTORY_LINES, prepareClassifyPrompt } from "./classify-step";
import type { DraftPort } from "./draft";
import { prepareDraftPrompt } from "./draft-step";
import { checkDraft } from "./draft-rules";
import { shortError } from "./intake";
import { DRAFTABLE_INTENTS, POLICY_VERSION, type DraftableType } from "./policy";
import { routeClassification } from "./route";
import type { EvalResultInsert, IrisSettings, IrisStore } from "./store";

/**
 * The eval run (REQ-45 AC6, tracker ADR 0074). While the owner's
 * eval_run_requested event is pending, each run classifies and drafts up to
 * irisMaxEvalPerRun fully labelled history messages, with the same prompts,
 * router and draft rules as the live steps, and stores one eval_results row
 * each. It changes no message, writes no draft and sends nothing. A request
 * stamped with another policy version or model finishes as stale with no
 * model call. Every call writes an ai_calls row with purpose eval and tokens
 * only. Never throws.
 */
export type EvalStepDeps = {
  store: IrisStore;
  /** Null when AI is not set up: the request waits. */
  classify: ClassifyPort | null;
  draft: DraftPort | null;
  directory: () => Promise<FamilyEntry[]>;
  settings: IrisSettings;
  /** The deployed model (AI_MODEL); a request stamped with another finishes as stale. */
  model: string;
  now: () => Date;
  startedAtMs: number;
};

export type EvalOutcome = { ran: boolean; scored: number; errors: number; finished: boolean; error: string | null };

const DRAFTABLE: readonly string[] = DRAFTABLE_INTENTS;

export async function runEval(deps: EvalStepDeps): Promise<EvalOutcome> {
  const out: EvalOutcome = { ran: false, scored: 0, errors: 0, finished: false, error: null };
  const { store, classify, draft } = deps;
  const elapsed = () => deps.now().getTime() - deps.startedAtMs;
  try {
    const request = await store.pendingRequest("eval_run_requested");
    if (!request) return out;
    out.ran = true;
    const finish = async (reason: string | null) => {
      const counts = await store.evalResultCounts(request.id);
      await store.insertEvent({
        kind: "eval_run_finished",
        messageId: null,
        detail: { request_id: request.id, scored: counts.ok, errors: counts.error, ...(reason ? { reason } : {}) },
      });
      out.finished = true;
    };
    if (request.detail.policy_version !== POLICY_VERSION || request.detail.model !== deps.model) {
      await finish("stale");
      return out;
    }
    if (!classify || !draft || elapsed() >= TUNING.irisEvalBudgetMs) return out;

    const pending = await store.listEvalPending(request.id, TUNING.irisMaxEvalPerRun);
    if (pending.length > 0) {
      const byStudent = new Map<string, FamilyEntry>();
      try {
        for (const e of await deps.directory()) byStudent.set(e.studentId, e);
      } catch (e) {
        return { ...out, error: shortError(e, "Could not read the family directory") };
      }

      for (const m of pending) {
        if (elapsed() >= TUNING.irisEvalBudgetMs) return out;
        const signal = AbortSignal.timeout(Math.max(1, TUNING.irisEvalBudgetMs - elapsed()));
        const ctx = await store.threadContext(m.threadId, m.receivedAt, CLASSIFY_HISTORY_LINES);
        const base = { requestEventId: request.id, messageId: m.id, policyVersion: POLICY_VERSION };
        const failed = (model: string | null, error: string): EvalResultInsert => ({
          ...base, model, predictedIntent: null, predictedReplyType: null, predictedEscalate: true, escalationReason: null, flags: [], draftBody: null, outcome: "error", error: error.slice(0, 300),
        });

        const { prompt, children, text } = prepareClassifyPrompt(m, ctx, byStudent);
        const answer = await classify(prompt, signal);
        await store.insertAiCall({
          messageId: m.id, purpose: "eval", model: answer.model, inputTokens: answer.ok ? answer.inputTokens : null, outputTokens: answer.ok ? answer.outputTokens : null,
          policyVersion: POLICY_VERSION, outcome: answer.ok ? "ok" : answer.outcome, error: answer.ok ? null : answer.error,
        });
        if (!answer.ok) {
          // A budget abort stores nothing: the message waits for the next run.
          if (answer.aborted) return out;
          await store.insertEvalResult(failed(answer.model, answer.error));
          out.errors += 1;
          continue;
        }

        const confidence = Math.round(answer.output.confidence * 100) / 100;
        const routed = routeClassification({ ...answer.output, confidence }, { threshold: deps.settings.confidenceThreshold, children, text });
        let row: EvalResultInsert = {
          ...base, model: answer.model, predictedIntent: routed.intent, predictedReplyType: null, predictedEscalate: routed.state === "escalated" && !routed.handled,
          escalationReason: routed.reason, flags: routed.flags, draftBody: null, outcome: "ok", error: null,
        };

        if (routed.state === "classified" && DRAFTABLE.includes(routed.intent)) {
          const replyType = routed.intent as DraftableType;
          const reply = await draft(prepareDraftPrompt({ bodyText: m.bodyText, notionStudentId: routed.studentId }, replyType, ctx, byStudent), signal);
          await store.insertAiCall({
            messageId: m.id, purpose: "eval", model: reply.model, inputTokens: reply.ok ? reply.inputTokens : null, outputTokens: reply.ok ? reply.outputTokens : null,
            policyVersion: POLICY_VERSION, outcome: reply.ok ? "ok" : reply.outcome, error: reply.ok ? null : reply.error,
          });
          if (!reply.ok) {
            if (reply.aborted) return out;
            await store.insertEvalResult(failed(reply.model, reply.error));
            out.errors += 1;
            continue;
          }
          const rules = checkDraft(reply.output.body);
          row = rules.length > 0
            ? { ...row, predictedReplyType: replyType, predictedEscalate: true, escalationReason: "draft_rule" }
            : {
                ...row, predictedReplyType: replyType, predictedEscalate: reply.output.needsCharlie,
                escalationReason: reply.output.needsCharlie ? "needs_charlie" : null, draftBody: reply.output.body,
              };
        }
        await store.insertEvalResult(row);
        out.scored += 1;
      }
    }

    if ((await store.listEvalPending(request.id, 1)).length === 0) await finish(null);
    return out;
  } catch (e) {
    return { ...out, error: shortError(e, "Iris run failed") };
  }
}
