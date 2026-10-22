import { normalId } from "../domain/billing";
import { addDays } from "../domain/schedule/wallclock";
import { localDateOf } from "../time";
import type { LeadRow, TrialLessonRow } from "./contracts";

/**
 * The trial funnel (REQ-59, tracker ADR 0073). Pure. Booked, delivered, closed, verified
 * enrolments and outcome unknown are each counted from their own field, never from another
 * count or from Stage. A count whose source could not be read in full is unverifiable,
 * never 0.
 */
export type FunnelWindow = { days: 7 | 30 | 90; from: string; to: string };
export type FunnelRef = { id: string; name: string; date: string | null; href: string; label: string | null };
export type FunnelCount = { state: "ok"; count: number; rows: FunnelRef[] } | { state: "unverifiable"; reason: string };
export type TrialFunnel = {
  window: FunnelWindow;
  booked: FunnelCount;
  delivered: FunnelCount;
  closed: FunnelCount;
  verified: FunnelCount;
  outcomeUnknown: FunnelCount;
};

/** The `days` Toronto dates ending today, today counted. */
export function windowOf(days: 7 | 30 | 90, today: string): FunnelWindow {
  return { days, from: addDays(today, -(days - 1)), to: today };
}

const byDateDesc = (a: FunnelRef, b: FunnelRef) => (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id);
const ok = (rows: FunnelRef[]): FunnelCount => ({ state: "ok", count: rows.length, rows: [...rows].sort(byDateDesc) });

export function trialFunnel(input: {
  window: FunnelWindow;
  now: Date;
  leads: LeadRow[];
  /** Null: the Lessons read failed or is incomplete. */
  trialLessons: TrialLessonRow[] | null;
  /** normalId(student) to a Paid invoice pageUrl. Null: the Invoices read failed or is incomplete. */
  paidStudentIds: Map<string, string> | null;
  /** Reasons printed on unverifiable counts. */
  unusable: { lessons: string | null; invoices: string | null };
}): TrialFunnel {
  const { window } = input;
  const inWindow = (date: string | null) => date !== null && date >= window.from && date <= window.to;
  const leads = new Map<string, LeadRow>();
  for (const l of input.leads) if (!leads.has(normalId(l.id))) leads.set(normalId(l.id), l);
  const all = [...leads.values()];
  const ref = (l: LeadRow, date: string | null, label: string | null = null): FunnelRef => ({ id: l.id, name: l.name, date, href: l.pageUrl, label });

  const booked = all.filter((l) => inWindow(localDateOf(l.trialBookedAt))).map((l) => ref(l, localDateOf(l.trialBookedAt)));
  const closedLeads = all.filter((l) => inWindow(localDateOf(l.closedAt)));
  const closed = closedLeads.map((l) => ref(l, localDateOf(l.closedAt)));

  let delivered: FunnelCount;
  let outcomeUnknown: FunnelCount;
  if (input.trialLessons === null) {
    const reason = input.unusable.lessons ?? "Lessons unavailable";
    delivered = { state: "unverifiable", reason };
    outcomeUnknown = { state: "unverifiable", reason };
  } else {
    const lessons = input.trialLessons;
    const entries = new Map<string, FunnelRef & { milestone: boolean; lesson: boolean }>();
    for (const l of all) {
      const date = localDateOf(l.trialAttendedAt);
      if (inWindow(date)) entries.set(normalId(l.id), { ...ref(l, date, "milestone"), milestone: true, lesson: false });
    }
    for (const t of lessons) {
      const date = localDateOf(t.date);
      if (!inWindow(date)) continue;
      if (!t.studentId) {
        entries.set(`lesson:${normalId(t.id)}`, { id: t.id, name: t.studentName ?? "Unknown student", date, href: t.pageUrl, label: "no student linked", milestone: false, lesson: true });
        continue;
      }
      const key = normalId(t.studentId);
      const seen = entries.get(key);
      if (seen) {
        seen.lesson = true;
        seen.label = seen.milestone ? "milestone and lesson" : "lesson";
        continue;
      }
      const lead = leads.get(key);
      entries.set(key, {
        id: lead?.id ?? t.studentId, name: lead?.name ?? t.studentName ?? "Unknown student", date, href: lead?.pageUrl ?? t.pageUrl, label: "lesson", milestone: false, lesson: true,
      });
    }
    delivered = ok([...entries.values()].map(({ milestone: _m, lesson: _l, ...r }) => r));

    const lessonsOf = (studentId: string) => lessons.filter((t) => t.studentId && normalId(t.studentId) === studentId);
    outcomeUnknown = ok(all
      .filter((l) => {
        if (!l.trialTime || l.trialAttendedAt) return false;
        const at = Date.parse(l.trialTime);
        if (Number.isNaN(at) || at >= input.now.getTime() || !inWindow(localDateOf(l.trialTime))) return false;
        const bookedOn = localDateOf(l.trialBookedAt);
        return !lessonsOf(normalId(l.id)).some((t) => {
          const d = localDateOf(t.date);
          return d !== null && (bookedOn === null || d >= bookedOn);
        });
      })
      .map((l) => ref(l, localDateOf(l.trialTime))));
  }

  const paid = input.paidStudentIds;
  const verified: FunnelCount = paid === null
    ? { state: "unverifiable", reason: input.unusable.invoices ?? "Payment records unavailable" }
    : ok(closedLeads.filter((l) => paid.has(normalId(l.id))).map((l) => ({ ...ref(l, localDateOf(l.closedAt), "Paid invoice"), href: paid.get(normalId(l.id))! })));

  return { window, booked: ok(booked), delivered, closed: ok(closed), verified, outcomeUnknown };
}
