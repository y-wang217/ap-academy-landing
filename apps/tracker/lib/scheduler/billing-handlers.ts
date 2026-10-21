import { z } from "zod";
import { buildBillingInput, type BillingInput, type OutcomeInput } from "../domain/billing/month-input";
import { monthRange } from "../domain/schedule/month";
import { expandOccurrences, type ClassException } from "../domain/schedule/recurrence";
import { renderSummary } from "../domain/schedule/summary";
import { requireScheduler } from "./guard";
import type { OccurrenceKey } from "./outcome-store";
import type { ScheduleDeps } from "./schedule-handlers";
import type { SeriesRecord } from "./schedule-store";
import { BillingInputResponse } from "./schemas";

/**
 * The owner's structured billing input (REQ-40, tracker ADR 0060). Reads the
 * adopted students' classes, exceptions, local Weekly Schedule text and class
 * outcomes; never Notion, and writes nothing. The guard runs before any read.
 */
const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export type BillingStudent = { studentId: string; text: string | null; series: SeriesRecord[]; exceptions: ClassException[] };
export type BillingMonth =
  | { ok: true; input: BillingInput; students: BillingStudent[] }
  | { ok: false; status: number; error: string };

/** The export and, per student, what the page needs to reconcile it. Any store failure is a 503, never an empty answer. */
export async function loadBillingMonth(deps: ScheduleDeps, month: string): Promise<BillingMonth> {
  const g = requireScheduler(await deps.identity(), ["admin"]);
  if (!g.ok) return { ok: false, status: g.status, error: g.body.error };
  // Without outcomes every past class would read chargeable and unconfirmed: refuse rather than guess.
  if (!deps.outcomes) return { ok: false, status: 503, error: "lessons_not_ready" };
  const outcomes = deps.outcomes;
  try {
    const [summaries, staff] = await Promise.all([deps.store.listSummaries(), deps.fetchStaff()]);
    const staffNames = new Map(staff.map((s) => [s.id, s.name]));
    const perStudent = await Promise.all(summaries.map(async (s) => ({ s, ...(await deps.store.listSeriesForStudent(s.studentId)) })));
    const series = perStudent.flatMap((p) => p.series);
    const exceptions = perStudent.flatMap((p) => p.exceptions);
    // The month's classes, plus every makeup (it may fall in another month), are the outcomes that matter.
    const keys: OccurrenceKey[] = expandOccurrences(series, exceptions, monthRange(month)).map((o) => ({ seriesId: o.seriesId, originalDate: o.originalDate }));
    for (const s of series) if (s.kind === "one_off" && s.purpose === "makeup") keys.push({ seriesId: s.id, originalDate: s.startDate });
    const rows = await outcomes.listForOccurrences(keys);
    const outcomeInputs: OutcomeInput[] = rows.map((r) => ({ seriesId: r.seriesId, originalDate: r.originalDate, outcome: r.outcome, pending: r.outcome === "delivered" && r.notionLessonId === null }));
    const today = deps.today();
    const students = perStudent.map(({ s }) => {
      const own = series.filter((x) => x.studentId === s.studentId);
      let fresh: string | null;
      try {
        fresh = renderSummary(own, staffNames, today);
      } catch {
        fresh = null;
      }
      return { studentId: s.studentId, sync: { state: s.syncState, stale: s.lastWrittenText !== fresh } };
    });
    const input = buildBillingInput({
      month, now: new Date(deps.now?.() ?? Date.now()).toISOString(), students, series, exceptions, outcomes: outcomeInputs,
    });
    return {
      ok: true,
      input,
      students: perStudent.map((p) => ({ studentId: p.s.studentId, text: p.s.lastWrittenText, series: p.series, exceptions: p.exceptions })),
    };
  } catch {
    return { ok: false, status: 503, error: "scheduler_unavailable" };
  }
}

/** GET ?month=YYYY-MM: the month export, under the strict schema. */
export async function handleMonthlyBillingInput(deps: ScheduleDeps, q: URLSearchParams): Promise<Response> {
  const g = requireScheduler(await deps.identity(), ["admin"]);
  if (!g.ok) return send(g.status, g.body);
  const month = Month.safeParse(q.get("month"));
  if (!month.success) return send(400, { error: "invalid_request" });
  const r = await loadBillingMonth(deps, month.data);
  if (!r.ok) return send(r.status, { error: r.error });
  return send(200, BillingInputResponse.parse(r.input));
}
