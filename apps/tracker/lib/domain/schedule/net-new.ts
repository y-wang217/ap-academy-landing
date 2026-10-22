import { normalId } from "../billing";
import { addDays } from "./wallclock";

/**
 * Verified net-new recurring teaching minutes per week (REQ-56, tracker ADR 0068), the founder
 * console's north star. The rule is docs/spec/founder-console/02-data-contracts.md section 5:
 * weekly series only; an addition when a series starts in the week, a reduction when the day after
 * its effective_until is in the week; a series is verified when its student is synced, has a Paid
 * invoice and is Onboarding or Active (or the series has ended). ADR 0068 adds the adoption rule,
 * the not-in-scheduler rule and the opening baseline. Dates are wall-clock strings compared as
 * strings, never instants, so DST weeks keep every event on its day. Pure: no I/O, no clock.
 */
export type Week = { from: string; to: string };

export type SeriesFact = {
  id: string; studentId: string; staffId: string; kind: "weekly" | "one_off";
  purpose: "trial" | "makeup" | "extra" | null; startDate: string; effectiveUntil: string | null;
  durationMinutes: number; splitFrom: string | null; createdAt: string;
};

export type Adoption = { studentId: string; adoptedAt: string };
export type PaidInvoice = { invoiceId: string; paidOn: string | null; month: string | null };

export type NetNewInput = {
  week: Week;
  /** Today in America/Toronto, for rule (c). */
  today: string;
  series: SeriesFact[];
  adoptions: Adoption[];
  people: { ok: true; stale: boolean; syncedAt: string | null; students: { id: string; stage: string }[] } | { ok: false; reason: string };
  /** Keyed by normalId of the student page id. */
  payments: { ok: true; paidByStudent: Map<string, PaidInvoice[]> } | { ok: false; reason: string };
};

export type UnverifiedReason = "not_synced" | "unpaid" | "stage_not_active";
export type ExcludedReason = "trial" | "makeup" | "extra" | "one_off" | "adopted" | "not_in_scheduler";

export type CountedEvent = {
  seriesId: string; studentId: string; staffId: string; event: "addition" | "reduction"; date: string; minutes: number;
  class: "verified" | "unverified" | "unclassified"; reason: UnverifiedReason | null; paidOn: string | null;
};
export type ExcludedSeries = { seriesId: string; studentId: string; staffId: string; date: string; reason: ExcludedReason };

export type NetNewResult = {
  week: Week;
  status: "verified" | "incomplete" | "unverifiable";
  reason: string | null;
  openingVerifiedMinutes: number | null;
  additionsVerifiedMinutes: number | null;
  reductionsVerifiedMinutes: number | null;
  netNewVerifiedMinutes: number | null;
  additionsUnverifiedMinutes: number | null;
  reductionsUnverifiedMinutes: number | null;
  netNewUnverifiedMinutes: number | null;
  /** Always set, unclassified: every counted event whatever its class. */
  grossAdditionsMinutes: number;
  grossReductionsMinutes: number;
  counted: CountedEvent[];
  excluded: ExcludedSeries[];
  /** Students with no adoption row: Onboarding or Active ones, plus any whose series were excluded. */
  notInScheduler: string[];
  lastSuccessfulSyncAt: string | null;
};

/** The stages that verify an open series. A copy of ACTIVE_STUDENT_STAGES: domain cannot import lib/notion. */
export const VERIFYING_STAGES: readonly string[] = ["Onboarding", "Active"];

export function priorWeek(week: Week): Week {
  return { from: addDays(week.from, -7), to: addDays(week.to, -7) };
}

const inWeek = (date: string, w: Week) => date >= w.from && date <= w.to;
const sameInstant = (a: string, b: string) => {
  const x = Date.parse(a);
  return !Number.isNaN(x) && x === Date.parse(b);
};
const latest = (dates: (string | null)[]) => dates.filter((d): d is string => d !== null).sort().at(-1) ?? null;

export function netNewHours(input: NetNewInput): NetNewResult {
  const { week, today } = input;
  const seen = new Set<string>();
  const series = input.series.filter((s) => {
    const key = normalId(s.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const adoptedAt = new Map(input.adoptions.map((a) => [normalId(a.studentId), a.adoptedAt]));
  const stageOf = input.people.ok ? new Map(input.people.students.map((p) => [normalId(p.id), p.stage])) : null;
  const paid = input.payments.ok ? input.payments.paidByStudent : null;
  const classified = stageOf !== null && paid !== null;

  /** Rules a, b and c, in that order; null reason means verified. */
  const classOf = (s: SeriesFact): { reason: UnverifiedReason | null; paidOn: string | null } => {
    const student = normalId(s.studentId);
    const invoices = paid?.get(student) ?? [];
    const paidOn = latest(invoices.map((i) => i.paidOn));
    const stage = stageOf?.get(student);
    if (stage === undefined) return { reason: "not_synced", paidOn };
    if (invoices.length === 0) return { reason: "unpaid", paidOn };
    const ended = s.effectiveUntil !== null && s.effectiveUntil < today;
    if (!VERIFYING_STAGES.includes(stage) && !ended) return { reason: "stage_not_active", paidOn };
    return { reason: null, paidOn };
  };

  const counted: CountedEvent[] = [];
  const excluded: ExcludedSeries[] = [];
  const notInScheduler = new Map<string, string>();
  let opening = 0;

  for (const s of series) {
    const base = { seriesId: s.id, studentId: s.studentId, staffId: s.staffId };
    const reductionDate = s.kind === "weekly" && s.effectiveUntil !== null ? addDays(s.effectiveUntil, 1) : null;
    const adds = inWeek(s.startDate, week);
    const reduces = reductionDate !== null && inWeek(reductionDate, week);

    if (!adoptedAt.has(normalId(s.studentId))) {
      const runs = s.kind === "weekly" && s.startDate <= week.to && (s.effectiveUntil === null || s.effectiveUntil >= week.from);
      if (adds || reduces || runs) {
        excluded.push({ ...base, date: adds ? s.startDate : reduces ? reductionDate! : week.from, reason: "not_in_scheduler" });
        notInScheduler.set(normalId(s.studentId), s.studentId);
      }
      continue;
    }
    if (s.kind === "one_off") {
      if (adds) excluded.push({ ...base, date: s.startDate, reason: s.purpose ?? "one_off" });
      continue;
    }

    const adopted = sameInstant(s.createdAt, adoptedAt.get(normalId(s.studentId))!);
    const { reason, paidOn } = classOf(s);
    const cls = !classified ? "unclassified" : reason === null ? "verified" : "unverified";
    const runsOnMonday = s.startDate < week.from && (s.effectiveUntil === null || s.effectiveUntil >= week.from);
    if (cls === "verified" && (runsOnMonday || (adopted && adds))) opening += s.durationMinutes;

    if (adds && adopted) excluded.push({ ...base, date: s.startDate, reason: "adopted" });
    else if (adds) counted.push({ ...base, event: "addition", date: s.startDate, minutes: s.durationMinutes, class: cls, reason: classified ? reason : null, paidOn });
    if (reduces) counted.push({ ...base, event: "reduction", date: reductionDate!, minutes: s.durationMinutes, class: cls, reason: classified ? reason : null, paidOn });
  }

  if (input.people.ok) {
    for (const p of input.people.students) {
      if (VERIFYING_STAGES.includes(p.stage) && !adoptedAt.has(normalId(p.id)) && !notInScheduler.has(normalId(p.id))) notInScheduler.set(normalId(p.id), p.id);
    }
  }

  const sum = (cls: CountedEvent["class"] | null, event: CountedEvent["event"]) =>
    counted.filter((c) => (cls === null || c.class === cls) && c.event === event).reduce((n, c) => n + c.minutes, 0);
  const shared = {
    week,
    grossAdditionsMinutes: sum(null, "addition"),
    grossReductionsMinutes: sum(null, "reduction"),
    counted,
    excluded,
    notInScheduler: [...notInScheduler.values()],
    lastSuccessfulSyncAt: input.people.ok ? input.people.syncedAt : null,
  };

  if (!classified) {
    const reasons = [input.payments, input.people].flatMap((r) => (r.ok ? [] : [r.reason]));
    return {
      ...shared, status: "unverifiable", reason: reasons.join("; "), openingVerifiedMinutes: null,
      additionsVerifiedMinutes: null, reductionsVerifiedMinutes: null, netNewVerifiedMinutes: null,
      additionsUnverifiedMinutes: null, reductionsUnverifiedMinutes: null, netNewUnverifiedMinutes: null,
    };
  }
  const [va, vr, ua, ur] = [sum("verified", "addition"), sum("verified", "reduction"), sum("unverified", "addition"), sum("unverified", "reduction")];
  return {
    ...shared,
    status: input.people.ok && input.people.stale ? "incomplete" : "verified",
    reason: null,
    openingVerifiedMinutes: opening,
    additionsVerifiedMinutes: va,
    reductionsVerifiedMinutes: vr,
    netNewVerifiedMinutes: va - vr,
    additionsUnverifiedMinutes: ua,
    reductionsUnverifiedMinutes: ur,
    netNewUnverifiedMinutes: ua - ur,
  };
}
