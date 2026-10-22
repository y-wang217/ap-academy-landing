import { normalId } from "../domain/billing";
import { netNewHours, priorWeek, type NetNewInput, type NetNewResult, type PaidInvoice, type Week } from "../domain/schedule/net-new";
import { addDays } from "../domain/schedule/wallclock";
import { weekOf } from "../domain/schedule/week";
import { TUNING } from "../domain/tuning";
import { todayIso } from "../time";
import type { ConsolePanels, SourceEvidence } from "./contracts";
import { readComplete, type PeopleSnapshot } from "./facade";
import { formatReadout, hhmm } from "./format";
import type { PanelView } from "./panel-view";
import type { SeriesRead } from "./series-read";

/**
 * The north-star panel (REQ-56, tracker ADR 0068): verified net-new weekly teaching hours for one
 * Toronto week, from the facade's Invoices panel, the shared people read and the series read.
 * Precedence: a failed series read is error; else a failed Invoices or people read is unverifiable;
 * else a stale people copy is stale (incomplete); else ready, or empty when nothing moved.
 */
export type NorthStarData = {
  week: Week;
  weekLabel: string;
  current: NetNewResult;
  prior: NetNewResult;
  /** Only when both weeks are verified (AC6). percent is null when the prior week's net is 0. */
  comparison: { deltaMinutes: number; percent: number | null } | null;
  /** normalId of a student page id to the synced name. */
  names: Record<string, string>;
  diagnostics: { leads: { awaitingFirstContact: number; overdueFollowUps: number } | null; bookedMinutes: number };
  links: { previous: string; next: string | null; retry: string };
};

export type NorthStarInput = {
  week: Week;
  now: Date;
  panels: ConsolePanels;
  people: { ok: true; value: PeopleSnapshot } | { ok: false };
  series: { ok: true; value: SeriesRead } | { ok: false };
};

export const CANNOT_VERIFY = "Cannot verify weekly hours";
const STAGES_UNAVAILABLE = "Student stages unavailable";
const CLOSED_STAGES = ["Lost", "Churned"];

/** "+1.5 h", "-1 h", "0 h": minutes as signed hours to one decimal. */
export function signedHours(minutes: number): string {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "-" : "";
  return `${sign}${formatReadout(Math.abs(minutes) / 60, { unit: "h" })}`;
}

/** "Wed 21 Oct" for a wall-clock date. */
export function dayLabel(date: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).formatToParts(new Date(`${date}T12:00:00Z`));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

export function comparisonLine(c: { deltaMinutes: number; percent: number | null }): string {
  const percent = c.percent === null ? "" : ` (${c.percent > 0 ? "+" : ""}${c.percent}%)`;
  return `vs last week ${signedHours(c.deltaMinutes)}${percent}`;
}

const weekHref = (from: string) => `?mode=sales&week=${from}`;

function peopleStale(syncedAt: string | null, now: Date): boolean {
  if (!syncedAt) return true;
  const at = Date.parse(syncedAt);
  return Number.isNaN(at) || now.getTime() - at > TUNING.peopleStaleMinutes * 60_000;
}

export function buildNorthStar({ week, now, panels, people, series }: NorthStarInput): PanelView<NorthStarData> {
  const checkedAt = now.toISOString();
  const invoices = panels.invoices;
  const sourceEvidence: SourceEvidence[] = [
    ...["tracker.class_series", "tracker.schedule_summaries", "tracker.student_people"].map((sourceId) => ({ source: "supabase" as const, sourceId, sourceUrl: null, observedAt: checkedAt })),
    ...invoices.sourceEvidence.filter((e) => e.source === "notion"),
  ];
  const base = { panel: "northStar", lastCheckedAt: checkedAt, sourceEvidence };

  if (!series.ok) {
    return { ...base, status: "error", data: null, count: null, lastSuccessfulFetchAt: null, staleReason: null, errorMessage: CANNOT_VERIFY };
  }

  const today = todayIso(now);
  const payments: NetNewInput["payments"] = readComplete(invoices) && invoices.data !== null
    ? { ok: true, paidByStudent: paidByStudent(invoices.data) }
    : { ok: false, reason: invoices.errorMessage ?? invoices.staleReason ?? "Invoices unavailable" };
  const peopleIn: NetNewInput["people"] = people.ok
    ? { ok: true, stale: peopleStale(people.value.syncedAt, now), syncedAt: people.value.syncedAt, students: people.value.students }
    : { ok: false, reason: STAGES_UNAVAILABLE };
  const run = (w: Week) => netNewHours({ week: w, today, series: series.value.series, adoptions: series.value.adoptions, people: peopleIn, payments });
  const current = run(week);
  const prior = run(priorWeek(week));

  const comparison = current.status === "verified" && prior.status === "verified"
    ? (() => {
        const deltaMinutes = current.netNewVerifiedMinutes! - prior.netNewVerifiedMinutes!;
        const p = prior.netNewVerifiedMinutes!;
        return { deltaMinutes, percent: p === 0 ? null : Math.round((deltaMinutes / Math.abs(p)) * 100) };
      })()
    : null;

  const leads = panels.leads;
  const leadReadouts = readComplete(leads) && leads.data !== null
    ? {
        awaitingFirstContact: leads.data.filter((l) => l.stage === "New").length,
        overdueFollowUps: leads.data.filter((l) => {
          if (!l.nextActionDue || l.nextAction === "None" || (l.stage !== null && CLOSED_STAGES.includes(l.stage))) return false;
          return l.nextActionDue.length === 10 ? l.nextActionDue < today : Date.parse(l.nextActionDue) < now.getTime();
        }).length,
      }
    : null;
  const seen = new Set<string>();
  const bookedMinutes = series.value.series
    .filter((s) => s.kind === "weekly" && s.startDate <= week.to && (s.effectiveUntil === null || s.effectiveUntil >= week.from))
    .filter((s) => !seen.has(normalId(s.id)) && seen.add(normalId(s.id)))
    .reduce((n, s) => n + s.durationMinutes, 0);

  const thisWeek = weekOf(today);
  const data: NorthStarData = {
    week,
    weekLabel: `${dayLabel(week.from)} to ${dayLabel(week.to)}`,
    current,
    prior,
    comparison,
    names: people.ok ? Object.fromEntries(people.value.students.map((s) => [normalId(s.id), s.name])) : {},
    diagnostics: { leads: leadReadouts, bookedMinutes },
    links: { previous: weekHref(addDays(week.from, -7)), next: week.from < thisWeek.from ? weekHref(addDays(week.from, 7)) : null, retry: weekHref(week.from) },
  };
  const count = current.counted.length + current.excluded.length;
  // The older of the Invoices read and the series read (this load).
  const invoicesAt = invoices.lastSuccessfulFetchAt;
  const lastSuccessfulFetchAt = invoicesAt === null ? null : invoicesAt < checkedAt ? invoicesAt : checkedAt;
  const view = { ...base, data, count, lastSuccessfulFetchAt, errorMessage: null };

  switch (current.status) {
    case "unverifiable":
      return { ...view, status: "unverifiable", staleReason: `${CANNOT_VERIFY}: ${current.reason}` };
    case "incomplete": {
      const synced = current.lastSuccessfulSyncAt;
      return { ...view, status: "stale", staleReason: synced ? `Student stages last synced ${hhmm(synced)}; figures may be incomplete` : "Student stages never synced; figures may be incomplete" };
    }
    case "verified":
      return { ...view, status: count === 0 ? "empty" : "ready", staleReason: null };
  }
}

function paidByStudent(rows: NonNullable<ConsolePanels["invoices"]["data"]>): Map<string, PaidInvoice[]> {
  const out = new Map<string, PaidInvoice[]>();
  for (const r of rows) {
    if (r.status !== "Paid") continue;
    for (const id of r.studentIds) {
      const key = normalId(id);
      out.set(key, [...(out.get(key) ?? []), { invoiceId: r.id, paidOn: r.paidOn, month: r.month }]);
    }
  }
  return out;
}
