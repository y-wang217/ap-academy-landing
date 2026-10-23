import { z } from "zod";
import { normalId } from "../domain/billing";
import { TUNING } from "../domain/tuning";
import { localDateOf } from "../time";
import {
  InvoiceRow, LeadRow, notionPageUrl, PAGE_CAP_PREFIX, PeopleData, TouchGroup, TrialLessonRow, WorkRow,
  type ConsolePanels, type InvoiceSource, type LeadSource, type NotionPanel, type PanelId, type PanelResult, type ReadResult,
  type SourceEvidence, type TouchSource, type TrialLessonSource, type WorkSource,
} from "./contracts";
import type { PeopleSnapshot } from "./people-read";

export type { PeopleSnapshot } from "./people-read";
export { PAGE_CAP_PREFIX } from "./contracts";

/**
 * The Founder Console read facade (REQ-54, tracker ADR 0065). Six providers
 * start together; each is capped by a timeout and its own abort signal, and
 * one failure never blanks another panel. Every panel comes back as a
 * PanelResult with a status, its times and its sources. It never throws and
 * never writes; the only state it keeps is the freshness Map it is handed.
 */
export type ReadOpts = { signal: AbortSignal; maxPages: number };
export type NotionPorts = {
  leads(o: ReadOpts): Promise<ReadResult<LeadSource>>;
  /** The newest `perStudent` touches of each student created on or after `since`. */
  touches(o: ReadOpts & { since: string; perStudent: number }): Promise<ReadResult<TouchSource>>;
  trialLessons(o: ReadOpts): Promise<ReadResult<TrialLessonSource>>;
  work(o: ReadOpts): Promise<ReadResult<WorkSource>>;
  invoices(o: ReadOpts): Promise<ReadResult<InvoiceSource>>;
};

export type FacadeDeps = {
  orgId: string;
  now: () => Date;
  people: () => Promise<PeopleSnapshot>;
  /** Null when Notion has no token configured. */
  notion: NotionPorts | null;
  /** Each Notion panel's data source id, for source evidence. */
  sources: Record<NotionPanel, string>;
  timeoutMs: number;
  maxPages: number;
  touchesPerStudent: number;
  touchesWindowDays: number;
  /** orgId:panel to the last successful read's time. Times only, never rows. */
  freshness: Map<string, string>;
};

/** A provider that did not answer within the timeout. */
export class ProviderTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Timed out after ${timeoutMs / 1000} s`);
    this.name = "ProviderTimeoutError";
  }
}

const MESSAGE_CHARS = 300;
const NOT_CONFIGURED = "Notion is not configured";
const PEOPLE_STALE = "people_sync_stale";
const NAMES_UNAVAILABLE = "names_unavailable";
/** The stale reasons that come from joining names, not from the source read itself. */
export const NAME_JOIN_REASONS: readonly string[] = [PEOPLE_STALE, NAMES_UNAVAILABLE];

/**
 * True when a panel holds every row its source has (REQ-56): ready, empty, or stale only because
 * names could not be joined. A page-cap stop or any other reason is not complete.
 */
export function readComplete(r: Pick<PanelResult<unknown>, "status" | "staleReason">): boolean {
  if (r.status === "ready" || r.status === "empty") return true;
  if (r.status !== "stale" || !r.staleReason) return false;
  return r.staleReason.split("; ").every((reason) => NAME_JOIN_REASONS.includes(reason));
}

export function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new ProviderTimeoutError(ms);
      controller.abort(err);
      reject(err);
    }, ms);
  });
  return Promise.race([run(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

const isAbort = (e: unknown) => e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");

/** The fixed text a failure becomes: never a response body. */
export function messageOf(e: unknown, timeoutMs: number): string {
  const timedOut = `Timed out after ${timeoutMs / 1000} s`;
  if (e instanceof ProviderTimeoutError || isAbort(e)) return timedOut;
  if (e instanceof Error && e.name === "NotionError") {
    // A NotionError with no status whose cause is the abort is the same timeout.
    if ((e as { status?: number }).status === undefined && isAbort(e.cause)) return timedOut;
    return e.message.slice(0, MESSAGE_CHARS);
  }
  return "Read failed";
}

type Settled<T> = { ok: true; value: T } | { ok: false; message: string };
type Names = { students: Map<string, string>; staff: Map<string, string>; reason: string | null };

const byId = <T extends { id: string }>(rows: T[]): T[] => {
  const seen = new Map<string, T>();
  for (const r of rows) if (!seen.has(normalId(r.id))) seen.set(normalId(r.id), r);
  return [...seen.values()];
};

export async function loadConsolePanels(deps: FacadeDeps): Promise<ConsolePanels> {
  const checkedAt = deps.now().toISOString();
  const run = async <T>(read: (signal: AbortSignal) => Promise<T>): Promise<Settled<T>> => {
    try {
      return { ok: true, value: await withTimeout(read, deps.timeoutMs) };
    } catch (e) {
      return { ok: false, message: messageOf(e, deps.timeoutMs) };
    }
  };
  const notion = <T>(pick: (ports: NotionPorts, signal: AbortSignal) => Promise<ReadResult<T>>): Promise<Settled<ReadResult<T>>> =>
    deps.notion ? run((signal) => pick(deps.notion!, signal)) : Promise.resolve({ ok: false, message: NOT_CONFIGURED });

  const since = new Date(deps.now().getTime() - deps.touchesWindowDays * 86_400_000).toISOString().slice(0, 10);
  const opts = (signal: AbortSignal) => ({ signal, maxPages: deps.maxPages });
  const [people, leads, touches, trialLessons, work, invoices] = await Promise.all([
    run(() => deps.people()),
    notion((p, s) => p.leads(opts(s))),
    notion((p, s) => p.touches({ ...opts(s), since, perStudent: deps.touchesPerStudent })),
    notion((p, s) => p.trialLessons(opts(s))),
    notion((p, s) => p.work(opts(s))),
    notion((p, s) => p.invoices(opts(s))),
  ]);

  const peopleStale = people.ok && isStale(people.value.syncedAt, deps.now());
  const names: Names = people.ok
    ? {
        students: new Map(people.value.students.map((s) => [normalId(s.id), s.name])),
        staff: new Map(people.value.staff.map((s) => [normalId(s.id), s.name])),
        reason: peopleStale ? PEOPLE_STALE : null,
      }
    : { students: new Map(), staff: new Map(), reason: NAMES_UNAVAILABLE };
  const student = (id: string | null) => (id ? names.students.get(normalId(id)) ?? null : null);
  const staff = (id: string | null) => (id ? names.staff.get(normalId(id)) ?? null : null);

  const evidence = (panel: NotionPanel, joins: boolean): SourceEvidence[] => [
    { source: "notion", sourceId: deps.sources[panel], sourceUrl: notionPageUrl(deps.sources[panel]), observedAt: checkedAt },
    ...(joins ? [{ source: "supabase" as const, sourceId: "tracker.student_people", sourceUrl: null, observedAt: checkedAt }] : []),
  ];

  /** One Notion panel: error over stale over empty over ready, and two stale reasons joined cap first. */
  function panel<S extends { id: string }, R>(
    id: NotionPanel,
    settled: Settled<ReadResult<S>>,
    joins: boolean,
    build: (rows: S[]) => { data: R; count: number },
  ): PanelResult<R> {
    const key = `${deps.orgId}:${id}`;
    const base = { panel: id as PanelId, lastCheckedAt: checkedAt, sourceEvidence: evidence(id, joins) };
    if (!settled.ok) {
      return { ...base, status: "error", data: null, count: null, lastSuccessfulFetchAt: deps.freshness.get(key) ?? null, staleReason: null, errorMessage: settled.message };
    }
    deps.freshness.set(key, checkedAt);
    const rows = byId(settled.value.rows);
    let built: { data: R; count: number };
    try {
      built = build(rows);
    } catch {
      return { ...base, status: "error", data: null, count: null, lastSuccessfulFetchAt: checkedAt, staleReason: null, errorMessage: "Read failed" };
    }
    const reasons: string[] = [];
    if (!settled.value.complete) reasons.push(`${PAGE_CAP_PREFIX}${settled.value.pages} pages; showing ${built.count} rows`);
    const emptyComplete = settled.value.complete && built.count === 0;
    if (joins && !emptyComplete && names.reason) reasons.push(names.reason);
    const status = reasons.length ? "stale" : built.count === 0 ? "empty" : "ready";
    return { ...base, status, data: built.data, count: built.count, lastSuccessfulFetchAt: checkedAt, staleReason: reasons.length ? reasons.join("; ") : null, errorMessage: null };
  }

  const list = <T extends z.ZodType>(schema: T, rows: unknown[]) => {
    const data = z.array(schema).parse(rows);
    return { data, count: data.length };
  };

  return {
    leads: panel("leads", leads, true, (rows) => list(LeadRow, rows.map((l) => ({
      ...l,
      pageUrl: notionPageUrl(l.id),
      dedupeKey: l.leadId,
      ownerName: staff(l.ownerStaffId),
      nextActionDueDate: localDateOf(l.nextActionDue),
      trialTimeDate: localDateOf(l.trialTime),
      trialTeacherName: staff(l.trialTeacherId),
      inPeopleCopy: names.students.has(normalId(l.id)),
    })))),
    touches: panel("touches", touches, true, (rows) => {
      const groups = new Map<string, z.input<typeof TouchGroup>>();
      for (const t of rows) {
        if (!t.studentId) continue;
        const key = normalId(t.studentId);
        if (!groups.has(key)) groups.set(key, { studentId: t.studentId, studentName: student(t.studentId), touches: [] });
        groups.get(key)!.touches.push({ ...t, pageUrl: notionPageUrl(t.id), whenDate: localDateOf(t.when), staffName: staff(t.staffId) });
      }
      const data = z.array(TouchGroup).parse([...groups.values()]);
      return { data, count: data.reduce((n, g) => n + g.touches.length, 0) };
    }),
    trialLessons: panel("trialLessons", trialLessons, true, (rows) => list(TrialLessonRow, rows.map((t) => ({
      ...t, pageUrl: notionPageUrl(t.id), studentName: student(t.studentId), teacherName: staff(t.teacherId),
    })))),
    work: panel("work", work, false, (rows) => list(WorkRow, rows.map((w) => ({ ...w, pageUrl: notionPageUrl(w.id), dueReviewDate: localDateOf(w.dueReview) })))),
    invoices: panel("invoices", invoices, true, (rows) => list(InvoiceRow, rows.map((i) => ({
      ...i, pageUrl: notionPageUrl(i.id), studentName: i.studentIds.map(student).find((n) => n !== null) ?? null,
    })))),
    people: peoplePanel(),
  };

  function peoplePanel(): PanelResult<PeopleData> {
    const key = `${deps.orgId}:people`;
    const sourceEvidence: SourceEvidence[] = ["tracker.student_people", "tracker.staff"].map((t) => ({ source: "supabase", sourceId: t, sourceUrl: null, observedAt: checkedAt }));
    const base = { panel: "people" as const, lastCheckedAt: checkedAt, sourceEvidence };
    if (!people.ok) {
      return { ...base, status: "error", data: null, count: null, lastSuccessfulFetchAt: deps.freshness.get(key) ?? null, staleReason: null, errorMessage: people.message };
    }
    deps.freshness.set(key, checkedAt);
    const data = PeopleData.parse({ syncedAt: people.value.syncedAt, students: people.value.students.length, staff: people.value.staff.length });
    return {
      ...base, status: peopleStale ? "stale" : "ready", data, count: data.students, lastSuccessfulFetchAt: checkedAt,
      staleReason: peopleStale ? PEOPLE_STALE : null, errorMessage: null,
    };
  }
}

/** The people copy is stale with no good sync, or one older than TUNING.peopleStaleMinutes. */
function isStale(syncedAt: string | null, now: Date): boolean {
  if (!syncedAt) return true;
  const at = Date.parse(syncedAt);
  return Number.isNaN(at) || now.getTime() - at > TUNING.peopleStaleMinutes * 60_000;
}
