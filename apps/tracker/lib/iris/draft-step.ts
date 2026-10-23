import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import type { DraftPort } from "./draft";
import { buildDraftPrompt } from "./draft-prompt";
import { checkDraft, timesOutsideSlots, type DraftRule } from "./draft-rules";
import { shortError } from "./intake";
import { fillOptions, findMakeupSlots, resolveRescheduleTarget, type Slot, type TeacherCalendar } from "./makeup";
import { resolveCancellation, type NoticeResult, type StudentSchedule } from "./notice";
import { DRAFTABLE_ESCALATIONS, DRAFTABLE_INTENTS, POLICY_VERSION, type DraftableType } from "./policy";
import type { DraftableMessage, EventDetail, IrisStore } from "./store";

export type { StudentSchedule } from "./notice";

/**
 * Rung 2 (REQ-44, tracker ADR 0063): each classified message, and each
 * unhandled no-show escalation, gets one Claude draft from its policy
 * section, checked by code. A clean draft is stored as version 1 for Charlie
 * to approve, edit or reject; nothing is sent. Every call writes one ai_calls
 * row with tokens only; the event keeps ids and codes; the model's reason and
 * the prompt stay in memory. Every port is injected, and it never throws.
 *
 * Rung 4 (REQ-46, tracker ADR 0072): a classified cancellation first reads
 * the matched student's schedule and becomes cancel_with_notice, late_cancel,
 * a schedule no-show for Charlie, or the plain cancellation flagged
 * schedule_unknown. Iris writes nothing outside the iris schema.
 *
 * Rung 5 (REQ-47, tracker ADR 0075): a classified reschedule request reads
 * the teacher's calendar too. With free time it becomes reschedule_offer, and
 * code writes the slots in at the model's [OPTIONS] line; otherwise it stays
 * reschedule_request, flagged availability_not_entered, no_free_slot or
 * schedule_unknown. The model never sees a time, and nothing is booked.
 */
export type DraftStepDeps = {
  store: IrisStore;
  /** Null when ANTHROPIC_API_KEY is unset: nothing is read and no call is made. */
  draft: DraftPort | null;
  /** The run's memoised Students & Parents read, shared with intake and classify. */
  directory: () => Promise<FamilyEntry[]>;
  /** One student's classes from the scheduler (REQ-46). Null or absent: cancellations draft as before. */
  schedule?: ((studentId: string) => Promise<StudentSchedule>) | null;
  /** One teacher's whole calendar and availability (REQ-47). Null or absent: reschedule requests draft as before. */
  availability?: ((staffId: string) => Promise<TeacherCalendar>) | null;
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

  // Each student's schedule is read at most once per run.
  const schedules = new Map<string, Promise<StudentSchedule>>();
  const scheduleOf = (studentId: string, read: (id: string) => Promise<StudentSchedule>) => {
    let p = schedules.get(studentId);
    if (!p) schedules.set(studentId, (p = read(studentId)));
    return p;
  };
  // Each teacher's whole calendar is read at most once per run, whatever the message's dates.
  const calendars = new Map<string, Promise<TeacherCalendar>>();
  const calendarOf = (staffId: string, read: (id: string) => Promise<TeacherCalendar>) => {
    let p = calendars.get(staffId);
    if (!p) calendars.set(staffId, (p = read(staffId)));
    return p;
  };

  const one = async (m: DraftableMessage) => {
    let replyType = m.intent as DraftableType;
    let state = m.state;
    let reason: string | null = m.state === "escalated" ? (m.escalationReason ?? "escalate_only") : null;
    let flags: string[] | undefined;
    let schedule: { missedDate: string; nextDate: string | null } | undefined;
    let slots: Slot[] = [];
    const facts: EventDetail = {};
    const ctx = await store.threadContext(m.threadId, m.receivedAt, HISTORY_LINES);

    if (m.intent === "cancellation" && m.state === "classified" && deps.schedule) {
      let notice: NoticeResult = { kind: "schedule_unknown" };
      // No matched student: Iris does not know whose class it is, and does not guess.
      if (m.notionStudentId) {
        let classes: StudentSchedule;
        try {
          classes = await scheduleOf(m.notionStudentId, deps.schedule);
        } catch {
          // The message waits for the next run as it was, with no retry spent.
          out.error ??= "Could not read the schedule";
          return;
        }
        const earlierInbound = ctx.history.filter((h) => h.direction === "inbound").map((h) => h.receivedAt);
        notice = resolveCancellation({ receivedAt: m.receivedAt, earlierInbound, ...classes });
      }
      if (notice.kind === "schedule_unknown") {
        flags = [...m.flags.filter((f) => f !== "schedule_unknown"), "schedule_unknown"];
      } else if (notice.kind === "no_show") {
        await store.updateMessage(m.id, { state: "escalated", intent: "no_show", escalationReason: "schedule_no_show", stateChangedAt: at(), handledAt: null, lastError: null });
        await store.insertEvent({
          kind: "escalated", messageId: m.id,
          detail: { state: "escalated", reason: "schedule_no_show", classified_intent: "cancellation", class_date: notice.missedDate, notion_student_id: m.notionStudentId },
        });
        out.escalated += 1;
        replyType = "no_show";
        state = "escalated";
        reason = "schedule_no_show";
        facts.class_date = notice.missedDate;
      } else {
        replyType = notice.kind;
        schedule = { missedDate: notice.missedDate, nextDate: notice.nextDate };
        facts.notice_minutes = notice.noticeMinutes;
        facts.class_date = notice.missedDate;
      }
    }

    if (m.intent === "reschedule_request" && m.state === "classified" && deps.schedule && deps.availability) {
      let flag: string | null = "schedule_unknown";
      // No matched student: Iris does not know whose class it is, and does not guess.
      if (m.notionStudentId) {
        let classes: StudentSchedule;
        try {
          classes = await scheduleOf(m.notionStudentId, deps.schedule);
        } catch {
          // The message waits for the next run as it was, with no retry spent.
          out.error ??= "Could not read the schedule";
          return;
        }
        const resolved = resolveRescheduleTarget({ receivedAt: m.receivedAt, ...classes });
        if (resolved) {
          let teacher: TeacherCalendar;
          try {
            teacher = await calendarOf(resolved.target.staffId, deps.availability);
          } catch {
            out.error ??= "Could not read the schedule";
            return;
          }
          const found = findMakeupSlots({ ...resolved, student: classes, teacher, now: deps.now() });
          if (found.kind === "slots") {
            flag = null;
            replyType = "reschedule_offer";
            slots = found.slots;
            schedule = { missedDate: resolved.target.date, nextDate: resolved.next?.date ?? null };
            facts.class_date = resolved.target.date;
            facts.offered_slots = slots.map((x) => x.startsAt);
          } else {
            flag = found.kind === "not_entered" ? "availability_not_entered" : "no_free_slot";
          }
        }
      }
      if (flag) flags = [...m.flags.filter((f) => f !== flag), flag];
    }

    const family = ctx.studentIds.map((id) => byStudent.get(id)).filter((e): e is FamilyEntry => e !== undefined);
    const child = (m.notionStudentId ? byStudent.get(m.notionStudentId) : undefined) ?? (family.length === 1 ? family[0] : undefined);
    const parent = family[0]?.parentName ?? "";
    const prompt = buildDraftPrompt({
      replyType,
      parentFirstName: firstWord(parent) || null,
      childFirstName: child ? firstWord(child.studentName) || null : null,
      surnames: [...lastWords(parent), ...family.flatMap((e) => lastWords(e.studentName))],
      history: ctx.history,
      body: m.bodyText ?? "",
      schedule,
      ...(replyType === "reschedule_offer" && { optionCount: slots.length }),
    });

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
      if (retryCount >= TUNING.irisMaxRetries && state === "classified") {
        await store.updateMessage(m.id, { retryCount, state: "failed", stateChangedAt: at(), lastError: answer.error });
        await store.insertEvent({ kind: "failed", messageId: m.id, detail: { state: "failed", reason: "draft_failed" } });
        out.failed += 1;
      } else {
        await store.updateMessage(m.id, { retryCount, lastError: answer.error });
      }
      return;
    }

    const holdBack = async (rules: DraftRule[]) => {
      await store.updateMessage(m.id, { state: "escalated", escalationReason: "draft_rule", stateChangedAt: at(), handledAt: null, lastError: null, ...(flags && { flags }) });
      await store.insertEvent({ kind: "escalated", messageId: m.id, detail: { state: "escalated", reason: "draft_rule", rules } });
      out.escalated += 1;
    };
    const rules = checkDraft(answer.output.body);
    if (rules.length > 0) return holdBack(rules);
    // REQ-47: the times are written in by code, then checked again: a time only a slot supplied may stay.
    const body = replyType === "reschedule_offer" ? fillOptions(answer.output.body, slots) : answer.output.body;
    if (body === null) return holdBack(["options"]);
    if (timesOutsideSlots(body, slots).length > 0) return holdBack(["time"]);

    const draftId = await store.insertDraft({ messageId: m.id, replyType, bodyText: body, policyVersion: POLICY_VERSION });
    const now = at();
    if (state === "escalated") {
      // The no-show stays escalated (escalate_only or schedule_no_show) and carries its draft.
      await store.updateMessage(m.id, { lastError: null });
    } else if (answer.output.needsCharlie) {
      await store.updateMessage(m.id, { state: "escalated", escalationReason: "needs_charlie", stateChangedAt: now, handledAt: null, lastError: null, ...(flags && { flags }) });
    } else {
      await store.updateMessage(m.id, { state: "drafted", stateChangedAt: now, lastError: null, ...(flags && { flags }) });
    }
    const finalState = state === "escalated" || answer.output.needsCharlie ? "escalated" : "drafted";
    const finalReason = state === "escalated" ? reason : answer.output.needsCharlie ? "needs_charlie" : null;
    await store.insertEvent({ kind: "drafted", messageId: m.id, draftId, detail: { state: finalState, reason: finalReason, reply_type: replyType, version: 1, ...facts } });
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
