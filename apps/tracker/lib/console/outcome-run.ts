import { hash } from "node:crypto";
import { normalId } from "../domain/billing";
import { TUNING } from "../domain/tuning";
import { NotionUncertain, type LeadWriter } from "../notion/lead-writer";
import { notionPageUrl } from "./contracts";
import type { OutcomeResult, OutcomeStore, Transition } from "./outcome-store";
import { planOutcome, type LeadPatch, type LeadSnapshot, type Outcome } from "./outcomes";

/**
 * One logged call outcome, end to end (REQ-61, tracker ADR 0076): plan, log,
 * patch the lead, create the Touch, read both back. Two Notion writes with no
 * transaction, so each is marked (`Last Txn` on the lead, `Txn ID` on the
 * Touch) and every retry reads the markers before it writes. Ports are
 * injected; this never throws.
 */
export type OutcomeBody = {
  requestId: string; pageId: string; outcome: Outcome; expected: { stage: string | null; attempts: number | null; lastEditedAt: string };
  note: string; nextAction?: string; due?: string;
};

export type OutcomeRun =
  | { kind: "done"; result: OutcomeResult; cadenceUsedUp: boolean; staffLinked: boolean }
  | { kind: "uncertain"; message: string; retryAfterSeconds: number | null }
  | { kind: "stale"; current: { stage: string | null; attempts: number | null; lastEditedAt: string } }
  | { kind: "in_progress" }
  | { kind: "request_id_reused" }
  | { kind: "unresolved_transition"; openRequestId: string | null }
  | { kind: "contract_missing"; missing: string[]; notionUrl: string; message: string }
  | { kind: "disallowed"; message: string; notionUrl: string }
  | { kind: "bad_form"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "notion_not_ready"; missing: string[] }
  | { kind: "unavailable" };

export const OUTCOME_MESSAGES = {
  changed: "The page changed in Notion after the first try; check it before logging again.",
  duplicates: "Duplicate touches found; delete one in Notion.",
  mismatch: "Notion shows different values; check the page.",
  settling: "Notion has not shown the new Touch yet. Retry in a minute.",
  uncertain: "Notion did not confirm the save. Retry to check and finish it.",
  failed: "Notion refused the save. Nothing was changed.",
} as const;

export const sha256 = (s: string) => hash("sha256", s, "hex");

/** Same value, with datetimes compared as instants. */
function same(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  if (a === b) return true;
  if (typeof a === "string" && typeof b === "string" && a.includes("T") && b.includes("T")) return Date.parse(a) === Date.parse(b);
  return (a ?? null) === (b ?? null);
}

/** Every patched property equals the intended value in the read-back, and Last Txn is this request. */
export function patchLanded(patch: LeadPatch, lead: LeadSnapshot, requestId: string): boolean {
  if (lead.lastTxn !== requestId) return false;
  return Object.entries(patch).every(([k, v]) => same(v as string | number | null, lead[k as keyof LeadPatch & keyof LeadSnapshot] as string | number | null));
}

export async function runOutcome(input: {
  body: OutcomeBody; store: OutcomeStore; writer: LeadWriter; staffId: string | null; now: () => Date;
}): Promise<OutcomeRun> {
  const { body, store, writer, staffId, now } = input;
  const noteSha = sha256(body.note);
  const lease = TUNING.consoleTransitionLeaseSeconds;
  // Whether a write of this transition may have landed; a definite refusal before that is `failed`.
  let sent = false;
  let row: Transition | null = null;

  const finish = async (state: "done" | "failed" | "uncertain", result: OutcomeResult | null, error: string | null) => {
    await store.finish(body.requestId, state, result, error);
  };
  const uncertain = async (message: string, retryAfterSeconds: number | null = null): Promise<OutcomeRun> => {
    await finish("uncertain", null, message);
    return { kind: "uncertain", message, retryAfterSeconds };
  };
  const doneRun = (t: Pick<Transition, "outcome" | "patch" | "touch">, result: OutcomeResult): OutcomeRun => ({
    kind: "done", result, cadenceUsedUp: t.outcome === "no_answer" && t.patch.nextAction === "Text", staffLinked: t.touch.staffId !== null,
  });

  try {
    let missing: string[];
    try {
      missing = await writer.checkReady();
    } catch {
      return { kind: "failed", message: "Notion could not be reached. Nothing was changed." };
    }
    if (missing.length > 0) return { kind: "notion_not_ready", missing };

    // A request seen before: answer it, or resume it.
    const existing = await store.get(body.requestId);
    if (existing) {
      const t = existing.touch;
      if (normalId(existing.pageId) !== normalId(body.pageId) || existing.outcome !== body.outcome || t.noteSha256 !== noteSha
          || t.formNextAction !== (body.nextAction ?? null) || t.formDue !== (body.due ?? null)) {
        return { kind: "request_id_reused" };
      }
      if (existing.state === "done" && existing.result) return doneRun(existing, existing.result);
      if (existing.state === "failed") return { kind: "failed", message: existing.lastError ?? OUTCOME_MESSAGES.failed };
      const claimed = await store.claim(body.requestId, lease);
      if (!claimed) return { kind: "in_progress" };
      row = claimed;
      sent = row.patchSentAt !== null || row.touchSentAt !== null;
      return await resume(row, null);
    }

    // A new request: one open transition per lead.
    const open = await store.openFor(body.pageId);
    if (open) return { kind: "unresolved_transition", openRequestId: open.requestId };

    let lead: LeadSnapshot;
    try {
      lead = await writer.readLead(body.pageId);
    } catch {
      return { kind: "failed", message: "Notion could not be reached. Nothing was changed." };
    }
    const current = { stage: lead.stage, attempts: lead.attempts, lastEditedAt: lead.lastEditedAt };
    if (current.stage !== body.expected.stage || current.attempts !== body.expected.attempts || !same(current.lastEditedAt, body.expected.lastEditedAt)) {
      return { kind: "stale", current };
    }

    const plan = planOutcome({ outcome: body.outcome, lead, form: { nextAction: body.nextAction, due: body.due }, now: now() });
    if (!plan.ok) {
      if (plan.code === "contract_missing") return { kind: "contract_missing", missing: plan.missing ?? [], notionUrl: notionPageUrl(body.pageId), message: plan.message };
      if (plan.code === "disallowed") return { kind: "disallowed", message: plan.message, notionUrl: notionPageUrl(body.pageId) };
      return { kind: "bad_form", message: plan.message };
    }

    const inserted = await store.insert({
      requestId: body.requestId, pageId: body.pageId, outcome: body.outcome, patch: plan.patch,
      touch: {
        ...plan.touch, staffId, noteChars: body.note.length, noteSha256: noteSha, formNextAction: body.nextAction ?? null, formDue: body.due ?? null,
      },
      expected: { stage: lead.stage, attempts: lead.attempts, lastEditedAt: lead.lastEditedAt }, leaseSeconds: lease,
    });
    if (!inserted.ok) {
      return inserted.conflict === "request_id" ? { kind: "in_progress" } : { kind: "unresolved_transition", openRequestId: inserted.openRequestId };
    }
    row = inserted.row;
    return await resume(row, lead);
  } catch {
    if (!row) return { kind: "unavailable" };
    // A store failure mid-run: the row stays running until its lease runs out, then a retry resumes it.
    return { kind: "uncertain", message: OUTCOME_MESSAGES.uncertain, retryAfterSeconds: lease };
  }

  async function resume(t: Transition, fresh: LeadSnapshot | null): Promise<OutcomeRun> {
    try {
      // Patch step.
      if (t.patchVerifiedAt === null) {
        const lead = fresh ?? (await writer.readLead(t.pageId));
        if (lead.lastTxn === t.requestId) {
          await store.mark(t.requestId, { patchVerifiedAt: now().toISOString() });
        } else if (same(lead.lastEditedAt, t.expected.lastEditedAt)) {
          await store.mark(t.requestId, { patchSentAt: now().toISOString() });
          await writer.patchLead(t.pageId, t.patch, t.requestId);
          sent = true;
        } else {
          return await uncertain(OUTCOME_MESSAGES.changed);
        }
      }

      // Touch step.
      let touchId: string;
      const found = await writer.findTouches(t.requestId);
      if (found.length > 1) return await uncertain(OUTCOME_MESSAGES.duplicates);
      if (found.length === 1) {
        touchId = found[0].id;
      } else {
        const settle = TUNING.consoleTouchSettleSeconds * 1000;
        const since = t.touchSentAt === null ? null : now().getTime() - Date.parse(t.touchSentAt);
        if (since !== null && since < settle) return await uncertain(OUTCOME_MESSAGES.settling, Math.ceil((settle - since) / 1000));
        await store.mark(t.requestId, { touchSentAt: now().toISOString() });
        sent = true;
        try {
          touchId = (await writer.createTouch({
            studentId: t.pageId, staffId: t.touch.staffId, type: t.touch.type, outcome: t.touch.outcome, title: t.touch.title, note: body.note, requestId: t.requestId,
          })).id;
        } catch (e) {
          if (e instanceof NotionUncertain) throw e;
          // A refused create landed nothing; with the patch in, the lead is half done.
          return await uncertain(OUTCOME_MESSAGES.uncertain);
        }
        await store.mark(t.requestId, { touchPageId: touchId });
      }

      // Read-back (AC9).
      const [lead, touch] = await Promise.all([writer.readLead(t.pageId), writer.getTouch(touchId)]);
      const touchOk = touch !== null && touch.txnId === t.requestId && touch.studentIds.some((s) => normalId(s) === normalId(t.pageId));
      if (!patchLanded(t.patch, lead, t.requestId) || !touchOk) return await uncertain(OUTCOME_MESSAGES.mismatch);
      const result: OutcomeResult = {
        stage: lead.stage, nextAction: lead.nextAction, nextActionDue: lead.nextActionDue, attempts: lead.attempts, touchId, readBackAt: now().toISOString(),
      };
      await finish("done", result, null);
      return doneRun(t, result);
    } catch (e) {
      if (e instanceof NotionUncertain || sent) return await uncertain(OUTCOME_MESSAGES.uncertain);
      await finish("failed", null, OUTCOME_MESSAGES.failed);
      return { kind: "failed", message: OUTCOME_MESSAGES.failed };
    }
  }
}
