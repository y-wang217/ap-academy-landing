import { addDays, localToUtc } from "../domain/schedule/wallclock";
import { TUNING } from "../domain/tuning";
import { localHhmm, SCHEDULE_TIME_ZONE, todayIso } from "../time";
import type { GmailSendPort } from "./gmail";
import { CHILD_SCOPED, NEVER_AUTO_SEND } from "./policy";
import { attemptSend, type ClaimResult } from "./send";
import type { AutoSendCandidate, IrisSettings, IrisStore } from "./store";

/**
 * Auto-send (REQ-49, tracker ADR 0078). After drafting, each draft whose
 * message ended drafted is checked against every condition; a pass is
 * approved by iris.auto_approve_draft (which re-checks the switches under the
 * message lock) and sent in the same run, or held to the end of quiet hours.
 * A fail writes one auto_send_skipped event naming every failing condition.
 * Every port is injected, and it never throws.
 */
export type AutoSkipCondition =
  | "paused"
  | "sending_disabled"
  | "type_disabled"
  | "never_auto_send"
  | "needs_charlie"
  | "intent"
  | "flags"
  | "confidence"
  | "student"
  | "policy_version"
  | "edited";

/** Every skip condition, in the order a skip event lists them. */
export const AUTO_SKIP_CONDITIONS: readonly AutoSkipCondition[] = [
  "paused", "sending_disabled", "type_disabled", "never_auto_send", "needs_charlie", "intent", "flags", "confidence", "student", "policy_version", "edited",
];

export type GateSettings = Pick<IrisSettings, "paused" | "sendingEnabled" | "confidenceThreshold">;

/** Pure. Every condition of AC1, with each failure named. */
export function autoSendCheck(settings: GateSettings, c: AutoSendCandidate): { approve: boolean; failing: AutoSkipCondition[] } {
  const m = c.message;
  const broken: Record<AutoSkipCondition, boolean> = {
    paused: settings.paused,
    sending_disabled: !settings.sendingEnabled,
    type_disabled: !c.typeSwitch?.autoSendEnabled,
    never_auto_send: (NEVER_AUTO_SEND as readonly string[]).includes(c.replyType),
    needs_charlie: m.state !== "drafted",
    intent: m.intent === null,
    flags: m.flags.length > 0,
    confidence: m.confidence === null || m.confidence < settings.confidenceThreshold,
    student: m.intent !== null && (CHILD_SCOPED as readonly string[]).includes(m.intent) && m.notionStudentId === null && m.notionStudentIds.length !== 1,
    policy_version: c.policyVersion !== (c.typeSwitch?.streakPolicyVersion ?? null),
    edited: c.version !== 1 || c.createdBy !== "iris" || c.edited,
  };
  const failing = AUTO_SKIP_CONDITIONS.filter((k) => broken[k]);
  return { approve: failing.length === 0, failing };
}

const hhmm = (t: string) => t.slice(0, 5);

/**
 * Pure. Inside quiet hours (America/Toronto; the window may wrap midnight)
 * the instant of the next quietEnd; otherwise null (send now).
 */
export function quietSendAfter(now: Date, quietStart: string, quietEnd: string): string | null {
  const start = hhmm(quietStart);
  const end = hhmm(quietEnd);
  if (start === end) return null;
  const local = localHhmm(now);
  const wraps = start > end;
  const inside = wraps ? local >= start || local < end : local >= start && local < end;
  if (!inside) return null;
  const today = todayIso(now);
  const day = wraps && local >= start ? addDays(today, 1) : today;
  return localToUtc(day, end, SCHEDULE_TIME_ZONE);
}

export type AutoSendOutcome = { approved: number; sent: number; failed: number; skipped: number; error: string | null };

/**
 * The run's gate step. `drafted` are the drafts runDraft left drafted. Sends
 * stop starting after irisSendBudgetMs; those go out with the next run's
 * send step (their lease is empty).
 */
export async function runAutoSend(d: {
  store: IrisStore;
  sender: GmailSendPort | null;
  mailbox: string;
  settings: GateSettings & Pick<IrisSettings, "quietStart" | "quietEnd">;
  drafted: { messageId: string; draftId: string }[];
  now: () => Date;
  startedAtMs: number;
}): Promise<AutoSendOutcome> {
  const out: AutoSendOutcome = { approved: 0, sent: 0, failed: 0, skipped: 0, error: null };
  if (d.drafted.length === 0) return out;
  const { store } = d;
  let candidates: AutoSendCandidate[];
  try {
    candidates = await store.autoSendCandidates(d.drafted.map((x) => x.draftId));
  } catch {
    return { ...out, error: "Could not read drafts for auto-send" };
  }
  const skip = async (c: AutoSendCandidate, conditions: string[]) => {
    await store.insertEvent({ kind: "auto_send_skipped", messageId: c.messageId, draftId: c.draftId, detail: { reply_type: c.replyType, conditions } });
    out.skipped += 1;
  };
  try {
    for (const c of candidates) {
      const check = autoSendCheck(d.settings, c);
      if (!check.approve) {
        await skip(c, check.failing);
        continue;
      }
      const sendAfter = quietSendAfter(d.now(), d.settings.quietStart, d.settings.quietEnd);
      const r = await store.autoApprove(c.draftId, sendAfter);
      if (r.result === "skipped") {
        await skip(c, [r.reason]);
        continue;
      }
      out.approved += 1;
      if (sendAfter !== null || !d.sender) continue;
      if (d.now().getTime() - d.startedAtMs >= TUNING.irisSendBudgetMs) continue;
      let claim: ClaimResult;
      try {
        claim = await store.claimSend(r.sendId, TUNING.irisSendLeaseSeconds, TUNING.irisSendMaxAttempts);
      } catch {
        out.error ??= "Could not claim a send";
        continue;
      }
      if (claim !== "claimed") continue;
      // Attempts were 0: nothing can have gone out yet, so no search first.
      const sent = await attemptSend({ store, gmail: d.sender, sendId: r.sendId, mailbox: d.mailbox, verifyFirst: false, now: d.now });
      if (sent.state === "sent") out.sent += 1;
      if (sent.state === "failed") out.failed += 1;
      if (sent.error) out.error ??= sent.error;
    }
  } catch {
    out.error ??= "Auto-send stopped: the store failed";
  }
  return out;
}
