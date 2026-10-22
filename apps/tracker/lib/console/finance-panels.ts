import { normalId } from "../domain/billing";
import { cashPulse, type CashPulse } from "./cash-pulse";
import type { ConsolePanels, PanelResult, SourceEvidence } from "./contracts";
import { readComplete } from "./facade";
import { withParam } from "./modes";
import { dayLabel } from "./north-star";
import type { PanelView } from "./panel-view";
import { trialFunnel, type FunnelCount, type FunnelWindow, type TrialFunnel } from "./trial-funnel";
import { todayIso } from "../time";

/**
 * The trial funnel and cash pulse panels (REQ-59, tracker ADR 0073), built from the facade's one
 * read. A failed or page-capped read of a panel's own source makes it unverifiable; a failed
 * Lessons or Invoices read marks only the funnel counts that need it (Decision 18). Error is kept
 * for a panel whose own computation throws. Neither builder throws.
 */
export type WindowLinks = { label: string; others: { days: number; href: string }[]; operations: string };
export type FunnelPanelData = TrialFunnel & { links: WindowLinks };
export type CashPanelData = CashPulse & { links: WindowLinks };

export const TRIAL_RECORDS_UNAVAILABLE = "Trial records unavailable";
export const PAYMENT_RECORDS_UNAVAILABLE = "Payment records unavailable";
export const LESSONS_UNAVAILABLE = "Lessons unavailable";
const MESSAGE_CHARS = 300;
const cut = (s: string) => s.slice(0, MESSAGE_CHARS);

const why = (r: PanelResult<unknown>) => r.errorMessage ?? r.staleReason ?? "Read failed";
const failed = (r: PanelResult<unknown>) => r.status === "error";

/** "Wed 23 Sep": en-GB writes September as "Sept"; the console's three-letter months do not. */
const shortDay = (date: string) => dayLabel(date).replace(" Sept", " Sep");

function windowLinks(window: FunnelWindow, search: URLSearchParams): WindowLinks {
  return {
    label: `Last ${window.days} days, ${shortDay(window.from)} to ${shortDay(window.to)}`,
    others: ([7, 30, 90] as const).filter((d) => d !== window.days).map((days) => ({ days, href: withParam(search, "window", String(days)) })),
    operations: `?${new URLSearchParams({ mode: "operations", window: String(window.days) })}`,
  };
}

/** The oldest last success of the sources, or null when any has none. */
function oldest(sources: PanelResult<unknown>[]): string | null {
  const times = sources.map((s) => s.lastSuccessfulFetchAt);
  if (times.some((t) => t === null)) return null;
  return (times as string[]).sort()[0] ?? null;
}

function evidence(sources: PanelResult<unknown>[]): SourceEvidence[] {
  const seen = new Set<string>();
  return sources.flatMap((s) => s.sourceEvidence).filter((e) => !seen.has(`${e.source}:${e.sourceId}`) && seen.add(`${e.source}:${e.sourceId}`));
}

const isZero = (c: FunnelCount) => c.state === "ok" && c.count === 0;

export function buildTrialFunnelPanel(panels: ConsolePanels, window: FunnelWindow, now: Date, search: URLSearchParams): PanelView<FunnelPanelData> {
  const { leads, trialLessons, invoices } = panels;
  const sources = [leads, trialLessons, invoices];
  const base = {
    panel: "trialFunnel", lastCheckedAt: now.toISOString(), sourceEvidence: evidence(sources), lastSuccessfulFetchAt: oldest(sources), errorMessage: null,
  };
  if (failed(leads)) return { ...base, status: "unverifiable", data: null, count: null, staleReason: cut(`${TRIAL_RECORDS_UNAVAILABLE}: ${why(leads)}`) };
  if (!readComplete(leads) || leads.data === null) return { ...base, status: "unverifiable", data: null, count: null, staleReason: cut(`Trial records incomplete: ${why(leads)}`) };
  try {
    const lessonsOk = readComplete(trialLessons) && trialLessons.data !== null;
    const invoicesOk = readComplete(invoices) && invoices.data !== null;
    const paid = new Map<string, string>();
    if (invoicesOk) {
      for (const r of invoices.data!) if (r.status === "Paid") for (const id of r.studentIds) if (!paid.has(normalId(id))) paid.set(normalId(id), r.pageUrl);
    }
    const funnel = trialFunnel({
      window, now, leads: leads.data,
      trialLessons: lessonsOk ? trialLessons.data : null,
      paidStudentIds: invoicesOk ? paid : null,
      unusable: { lessons: lessonsOk ? null : LESSONS_UNAVAILABLE, invoices: invoicesOk ? null : PAYMENT_RECORDS_UNAVAILABLE },
    });
    const data: FunnelPanelData = { ...funnel, links: windowLinks(window, search) };
    const count = funnel.booked.state === "ok" ? funnel.booked.count : null;
    const reasons = [
      ...(lessonsOk ? [] : [`${LESSONS_UNAVAILABLE}: delivered and outcome unknown unverifiable`]),
      ...(invoicesOk ? [] : [`${PAYMENT_RECORDS_UNAVAILABLE}: verified enrolments unverifiable`]),
    ];
    if (reasons.length) return { ...base, status: "stale", data, count, staleReason: cut(reasons.join("; ")) };
    const empty = [funnel.booked, funnel.delivered, funnel.closed, funnel.verified, funnel.outcomeUnknown].every(isZero);
    return { ...base, status: empty ? "empty" : "ready", data, count, staleReason: null };
  } catch {
    return { ...base, status: "error", data: null, count: null, staleReason: null, errorMessage: "Read failed" };
  }
}

export function buildCashPulsePanel(panels: ConsolePanels, window: FunnelWindow, now: Date, search: URLSearchParams): PanelView<CashPanelData> {
  const { invoices } = panels;
  const base = {
    panel: "cashPulse", lastCheckedAt: now.toISOString(), sourceEvidence: evidence([invoices]), lastSuccessfulFetchAt: invoices.lastSuccessfulFetchAt, errorMessage: null,
  };
  if (failed(invoices)) return { ...base, status: "unverifiable", data: null, count: null, staleReason: cut(`${PAYMENT_RECORDS_UNAVAILABLE}: ${why(invoices)}`) };
  if (!readComplete(invoices) || invoices.data === null) {
    return { ...base, status: "unverifiable", data: null, count: null, staleReason: cut(`Payment records incomplete: ${why(invoices)}; totals not shown`) };
  }
  try {
    const pulse = cashPulse({ window, today: todayIso(now), invoices: invoices.data });
    const data: CashPanelData = { ...pulse, links: windowLinks(window, search) };
    if (invoices.status === "empty" || invoices.data.length === 0) return { ...base, status: "empty", data, count: 0, staleReason: null };
    return { ...base, status: "ready", data, count: pulse.collected.rows.length, staleReason: null };
  } catch {
    return { ...base, status: "error", data: null, count: null, staleReason: null, errorMessage: "Read failed" };
  }
}
