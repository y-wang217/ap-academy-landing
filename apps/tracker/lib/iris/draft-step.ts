import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import type { DraftPort, DraftPrompt } from "./draft";
import { buildDraftPrompt } from "./draft-prompt";
import { checkDraft } from "./draft-rules";
import { shortError } from "./intake";
import { DRAFTABLE_ESCALATIONS, DRAFTABLE_INTENTS, POLICY_VERSION, type DraftableType } from "./policy";
import type { DraftableMessage, IrisStore, ThreadHistoryRow } from "./store";

/**
 * Rung 2 (REQ-44, tracker ADR 0063): each classified message, and each
 * unhandled no-show escalation, gets one Claude draft from its policy
 * section, checked by code. A clean draft is stored as version 1 for Charlie
 * to approve, edit or reject; nothing is sent. Every call writes one ai_calls
 * row with tokens only; the event keeps ids and codes; the model's reason and
 * the prompt stay in memory. Every port is injected, and it never throws.
 */
export type DraftStepDeps = {
  store: IrisStore;
  /** Null when ANTHROPIC_API_KEY is unset: nothing is read and no call is made. */
  draft: DraftPort | null;
  /** The run's memoised Students & Parents read, shared with intake and classify. */
  directory: () => Promise<FamilyEntry[]>;
  now: () => Date;
  startedAtMs: number;
  signal?: AbortSignal;
};

export type DraftOutcome = { result: "ok" | "failed"; drafted: number; escalated: number; failed: number; error: string | null };

const CONCURRENCY = 2;
const HISTORY_LINES = 5;
const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? "";
const lastWords = (s: string) => s.trim().split(/\s+/).slice(1);
const DRAFTABLE: readonly string[] = [...DRAFTABLE_INTENTS, ...DRAFTABLE_ESCALATIONS];

/**
 * The draft prompt for one message. Pure. The live step and the eval step
 * (REQ-45) both call it, so their prompts cannot drift.
 */
export function prepareDraftPrompt(
  m: { bodyText: string | null; notionStudentId: string | null },
  replyType: DraftableType,
  ctx: { studentIds: string[]; history: ThreadHistoryRow[] },
  byStudent: Map<string, FamilyEntry>,
): DraftPrompt {
  const family = ctx.studentIds.map((id) => byStudent.get(id)).filter((e): e is FamilyEntry => e !== undefined);
  const child = (m.notionStudentId ? byStudent.get(m.notionStudentId) : undefined) ?? (family.length === 1 ? family[0] : undefined);
  const parent = family[0]?.parentName ?? "";
  return buildDraftPrompt({
    replyType,
    parentFirstName: firstWord(parent) || null,
    childFirstName: child ? firstWord(child.studentName) || null : null,
    surnames: [...lastWords(parent), ...family.flatMap((e) => lastWords(e.studentName))],
    history: ctx.history,
    body: m.bodyText ?? "",
  });
}

export async function runDraft(deps: DraftStepDeps): Promise<DraftOutcome> {
  const out: DraftOutcome = { result: "ok", drafted: 0, escalated: 0, failed: 0, error: null };
  const { store, draft } = deps;
  if (!draft) return out;
  const at = () => deps.now().toISOString();
  const outOfTime = () => deps.now().getTime() - deps.startedAtMs >= TUNING.irisDraftBudgetMs;

  let queue: DraftableMessage[];
  try {
    queue = (await store.listDraftable(TUNING.irisMaxRetries, TUNING.irisMaxDraftPerRun)).filter((m) => m.intent !== null && DRAFTABLE.includes(m.intent));
  } catch {
    return { ...out, result: "failed", error: "Iris run failed" };
  }
  if (queue.length === 0 || outOfTime()) return out;

  // The family directory: a failure leaves every message as it was, with no retry spent.
  const byStudent = new Map<string, FamilyEntry>();
  try {
    for (const e of await deps.directory()) byStudent.set(e.studentId, e);
  } catch (e) {
    return { ...out, error: shortError(e, "Could not read the family directory") };
  }

  const one = async (m: DraftableMessage) => {
    const replyType = m.intent as DraftableType;
    const ctx = await store.threadContext(m.threadId, m.receivedAt, HISTORY_LINES);
    const prompt = prepareDraftPrompt(m, replyType, ctx, byStudent);

    const answer = await draft(prompt, deps.signal);
    await store.insertAiCall({
      messageId: m.id,
      purpose: "draft",
      model: answer.model,
      inputTokens: answer.ok ? answer.inputTokens : null,
      outputTokens: answer.ok ? answer.outputTokens : null,
      policyVersion: POLICY_VERSION,
      outcome: answer.ok ? "ok" : answer.outcome,
      error: answer.ok ? null : answer.error,
    });

    if (!answer.ok) {
      // A budget abort is not a failure: the message waits for the next run as it was.
      if (answer.aborted) return;
      const retryCount = m.retryCount + 1;
      // A no-show stays in Needs you whatever happens; only a classified message can fail.
      if (retryCount >= TUNING.irisMaxRetries && m.state === "classified") {
        await store.updateMessage(m.id, { retryCount, state: "failed", stateChangedAt: at(), lastError: answer.error });
        await store.insertEvent({ kind: "failed", messageId: m.id, detail: { state: "failed", reason: "draft_failed" } });
        out.failed += 1;
      } else {
        await store.updateMessage(m.id, { retryCount, lastError: answer.error });
      }
      return;
    }

    const rules = checkDraft(answer.output.body);
    if (rules.length > 0) {
      await store.updateMessage(m.id, { state: "escalated", escalationReason: "draft_rule", stateChangedAt: at(), handledAt: null, lastError: null });
      await store.insertEvent({ kind: "escalated", messageId: m.id, detail: { state: "escalated", reason: "draft_rule", rules } });
      out.escalated += 1;
      return;
    }

    const draftId = await store.insertDraft({ messageId: m.id, replyType, bodyText: answer.output.body, policyVersion: POLICY_VERSION });
    const now = at();
    if (m.state === "escalated") {
      // The no-show stays escalated (escalate_only) and carries its draft.
      await store.updateMessage(m.id, { lastError: null });
    } else if (answer.output.needsCharlie) {
      await store.updateMessage(m.id, { state: "escalated", escalationReason: "needs_charlie", stateChangedAt: now, handledAt: null, lastError: null });
    } else {
      await store.updateMessage(m.id, { state: "drafted", stateChangedAt: now, lastError: null });
    }
    const state = m.state === "escalated" || answer.output.needsCharlie ? "escalated" : "drafted";
    const reason = m.state === "escalated" ? "escalate_only" : answer.output.needsCharlie ? "needs_charlie" : null;
    await store.insertEvent({ kind: "drafted", messageId: m.id, draftId, detail: { state, reason, reply_type: replyType, version: 1 } });
    out.drafted += 1;
  };

  // Concurrency 2. A store error stops new work and fails the run, like classify.
  let next = 0;
  let broken = false;
  const worker = async () => {
    while (!broken && next < queue.length && !outOfTime()) {
      const m = queue[next++];
      try {
        await one(m);
      } catch {
        broken = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return broken ? { ...out, result: "failed", error: "Iris run failed" } : out;
}
