import { occurrenceRef } from "../schedule/lesson-link";
import { monthRange } from "../schedule/month";
import { expandOccurrences, type ClassException, type ClassPurpose, type ClassSeries, type Occurrence } from "../schedule/recurrence";
import { BILLING_RULES_VERSION, chargeState, type ChargeInput, type ChargeStateName } from "./charge-state";

/**
 * The structured month input for the monthly billing run (REQ-40, tracker ADR
 * 0060, docs/billing-input.md). Pure: `now` is an argument. Every class of the
 * month per adopted student, from the same expansion the calendars use, so
 * `from`/`until` and moved-in classes are already honoured. IDs only: no
 * names, emails or money. Changing the shape bumps BILLING_SCHEMA_VERSION.
 */
export const BILLING_SCHEMA_VERSION = 1;

export type OutcomeInput = { seriesId: string; originalDate: string; outcome: "delivered" | "no_show"; pending: boolean };
export type SyncInput = { state: "pending" | "synced" | "failed"; stale: boolean };
export type BillingOccurrence = {
  occurrenceRef: string;
  seriesId: string;
  originalDate: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  subject: string;
  /** The Notion Staff page ID. */
  teacherId: string;
  schedulerState: "scheduled" | "moved" | "cancelled" | "one_off";
  purpose: ClassPurpose | null;
  movedFrom: string | null;
  /** For a makeup: the original date of the cancelled class it replaces. */
  makeupFor: string | null;
  unlinkedMakeup: boolean;
  outcome: "delivered" | "no_show" | "none";
  chargeState: ChargeStateName;
  unconfirmed: boolean;
};
export type BillingInput = {
  schemaVersion: typeof BILLING_SCHEMA_VERSION;
  rulesVersion: typeof BILLING_RULES_VERSION;
  month: string;
  asOf: string;
  students: { studentId: string; sync: SyncInput; occurrences: BillingOccurrence[] }[];
};

const key = (seriesId: string, originalDate: string) => `${seriesId}:${originalDate}`;

function schedulerState(o: Occurrence): BillingOccurrence["schedulerState"] {
  if (o.status !== "scheduled") return o.status;
  return o.kind === "one_off" ? "one_off" : "scheduled";
}

export function buildBillingInput(input: {
  month: string;
  now: string;
  students: { studentId: string; sync: SyncInput }[];
  series: ClassSeries[];
  exceptions: ClassException[];
  outcomes: OutcomeInput[];
}): BillingInput {
  const nowMs = Date.parse(input.now);
  const outcomeOf = new Map(input.outcomes.map((x) => [key(x.seriesId, x.originalDate), x]));
  const cancelledById = new Map(input.exceptions.filter((e) => e.id && e.kind === "cancelled").map((e) => [e.id!, e]));
  // The makeup that replaces each cancelled exception, in any month.
  const makeupOf = new Map(input.series.filter((s) => s.kind === "one_off" && s.purpose === "makeup" && s.makeupFor).map((s) => [s.makeupFor!, s]));
  const range = monthRange(input.month);

  const toEntry = (o: Occurrence): BillingOccurrence => {
    const own = outcomeOf.get(key(o.seriesId, o.originalDate));
    const series = input.series.find((s) => s.id === o.seriesId)!;
    const link = o.purpose === "makeup" && series.makeupFor ? cancelledById.get(series.makeupFor) : undefined;
    let makeup: ChargeInput["makeup"] = "none";
    if (o.status === "cancelled") {
      const exception = input.exceptions.find((e) => e.seriesId === o.seriesId && e.originalDate === o.originalDate);
      const m = exception?.id ? makeupOf.get(exception.id) : undefined;
      // A pending claim counts as delivered here: the class happened, the Lessons row is on its way.
      if (m) makeup = outcomeOf.get(key(m.id, m.startDate))?.outcome === "delivered" ? "delivered" : "linked";
    }
    const charge = chargeState({
      status: o.status, kind: o.kind, purpose: o.purpose, past: Date.parse(o.endsAt) <= nowMs,
      outcome: own?.outcome ?? "none", outcomePending: own?.outcome === "delivered" && own.pending, makeup,
    });
    return {
      occurrenceRef: occurrenceRef(o),
      seriesId: o.seriesId,
      originalDate: o.originalDate,
      date: o.date,
      startTime: o.startTime,
      durationMinutes: o.durationMinutes,
      subject: o.subject,
      teacherId: o.staffId,
      schedulerState: schedulerState(o),
      purpose: o.purpose,
      movedFrom: o.status === "moved" ? o.originalDate : null,
      makeupFor: link ? link.originalDate : null,
      unlinkedMakeup: o.purpose === "makeup" && !link,
      outcome: own?.outcome ?? "none",
      chargeState: charge.state,
      unconfirmed: charge.unconfirmed,
    };
  };

  const students = [...input.students].sort((a, b) => a.studentId.localeCompare(b.studentId)).map((st) => {
    const series = input.series.filter((s) => s.studentId === st.studentId);
    const ids = new Set(series.map((s) => s.id));
    const occurrences = expandOccurrences(series, input.exceptions.filter((e) => ids.has(e.seriesId)), range)
      .map(toEntry)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.occurrenceRef.localeCompare(b.occurrenceRef));
    return { studentId: st.studentId, sync: st.sync, occurrences };
  });
  return { schemaVersion: BILLING_SCHEMA_VERSION, rulesVersion: BILLING_RULES_VERSION, month: input.month, asOf: input.now, students };
}
