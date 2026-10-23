import { z } from "zod";
import { normalId } from "../domain/billing";
import { TUNING } from "../domain/tuning";
import { notionPageUrl, type ConsolePanels, type LeadRow, type PanelResult } from "./contracts";
import { NAME_JOIN_REASONS } from "./facade";
import type { LessonGapsData } from "./operations";
import { PANEL_STATUSES, type PanelStatus, type PanelView } from "./panel-view";
import { ACTIVE, instantOf, OPTED_OUT, whenLabel } from "./sales-queue";

/**
 * The console's signals (REQ-62, tracker ADR 0077). Pure: no I/O, no clock but
 * the `now` it is given. Fresh Stage = New leads and six kinds of exception,
 * each keyed by its source record, with its source, check time and one next
 * action; the seven providers' health; and whether the owner is teaching. A
 * kind whose source failed is not computed: its check reads `skipped` and a
 * provider failure stands in its place, so a failed check never looks like
 * "no exceptions". The view is parsed with SignalsViewSchema before it leaves
 * the server, which drops every key it does not list.
 */
export const SIGNAL_KINDS = ["fresh_lead", "followup_overdue", "trial_undecided", "lesson_gap", "provider_failure", "people_stale", "outbox_failed"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];
/** The kinds a source check computes; provider failures are what a failed check becomes. */
export const CHECK_KINDS = ["fresh_lead", "followup_overdue", "trial_undecided", "lesson_gap", "people_stale", "outbox_failed"] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];
export const KIND_LABELS: Record<SignalKind, string> = {
  fresh_lead: "Fresh lead", followup_overdue: "Follow-up overdue", trial_undecided: "Trial undecided", lesson_gap: "Missing lesson log",
  provider_failure: "Provider failure", people_stale: "People sync stale", outbox_failed: "Outbox failed",
};

export const HEALTH_KEYS = ["notionLeads", "notionLessons", "notionInvoices", "notionWork", "schedulerTables", "peopleSync", "outbox"] as const;
export type HealthKey = (typeof HEALTH_KEYS)[number];
export const HEALTH_LABELS: Record<HealthKey, string> = {
  notionLeads: "Notion leads", notionLessons: "Notion lessons", notionInvoices: "Notion invoices", notionWork: "Notion work",
  schedulerTables: "Scheduler tables", peopleSync: "People sync", outbox: "Outbox",
};
export const NOT_CHECKED = "Not checked";

const str = z.string().nullable();
const Signal = z.object({
  signalKey: z.string(), kind: z.enum(SIGNAL_KINDS), title: z.string(), detail: z.string(), sourceLabel: z.string(), sourceUrl: z.string(),
  checkedAt: z.string(), createdAt: str, action: z.object({ label: z.string(), href: z.string() }),
});
const Check = z.object({ kind: z.enum(CHECK_KINDS), state: z.enum(["ok", "failed", "skipped"]) });
const Health = z.object({
  key: z.enum(HEALTH_KEYS), label: z.string(), status: z.enum(PANEL_STATUSES), lastCheckedAt: str, lastSuccessfulFetchAt: str, staleReason: str, errorMessage: str,
});
const ProtectedTime = z.discriminatedUnion("state", [
  z.object({ state: z.literal("teaching"), until: z.string(), title: z.string() }),
  z.object({ state: z.literal("free") }),
  z.object({ state: z.literal("unknown"), reason: z.string() }),
]);
// Plain z.object (strip mode): a parent phone, an email or an outbox last_error never leaves (AC5).
export const SignalsViewSchema = z.object({
  checkedAt: z.string(), signals: z.array(Signal), checks: z.array(Check), health: z.array(Health), protectedTime: ProtectedTime,
});
export type Signal = z.infer<typeof Signal>;
export type SignalCheck = z.infer<typeof Check>;
export type HealthEntry = z.infer<typeof Health>;
export type ProtectedTime = z.infer<typeof ProtectedTime>;
export type SignalsView = z.infer<typeof SignalsViewSchema>;

/** The owner's failed Notion exports: ids, kinds and times only. */
export type OutboxRead =
  | { ok: true; checkedAt: string; rows: { id: string; kind: string; finishedAt: string | null }[] }
  | { ok: false; checkedAt: string; message: string };

export type SignalsInput = {
  panels: ConsolePanels;
  /** Operations' lesson gaps and the schedule read (the upcoming panel shares its status); null when not loaded. */
  lessonGaps: PanelView<LessonGapsData> | null;
  schedule: PanelView<unknown> | null;
  outbox: OutboxRead | null;
  protectedTime: ProtectedTime;
};

type Source = Pick<PanelView<unknown>, "status" | "lastCheckedAt" | "lastSuccessfulFetchAt" | "staleReason" | "errorMessage" | "data">;

const SETUP = "/tracker/scheduler/setup";
const SCHEDULE = "/tracker/schedule";
const SEVERITY: Record<PanelStatus, number> = { ready: 0, empty: 1, loading: 2, unverifiable: 3, stale: 4, error: 5 };
const UNDECIDED = new Set(["Trial Claimed", "Awaiting Close"]);
const HOUR = 3_600_000;

/** Stale only for joining names: the source read itself is whole. */
const nameJoinOnly = (reason: string | null) => reason !== null && reason.split("; ").every((r) => NAME_JOIN_REASONS.includes(r));
/** A source that failed or read only part of its rows. */
const failing = (s: Source) => s.status === "error" || (s.status === "stale" && !nameJoinOnly(s.staleReason));
const usable = (s: Source | null): s is Source => s !== null && s.data !== null && s.status !== "error";
const checkOf = (s: Source | null): SignalCheck["state"] => (!usable(s) ? "skipped" : failing(s) ? "failed" : "ok");

export function buildSignals(input: SignalsInput, now: Date): SignalsView {
  const at = now.getTime();
  const checkedAt = now.toISOString();
  const { panels } = input;
  const signals = new Map<string, Signal>();
  const add = (s: Signal) => {
    const had = signals.get(s.signalKey);
    const older = had?.createdAt && (!s.createdAt || Date.parse(had.createdAt) <= Date.parse(s.createdAt));
    if (!had || !older) signals.set(s.signalKey, s);
  };
  const checks: SignalCheck[] = [];

  // Leads: fresh leads, overdue follow-ups and undecided trials share the one read.
  const leads = panels.leads;
  const leadCheck = checkOf(leads);
  for (const kind of ["fresh_lead", "followup_overdue", "trial_undecided"] as const) checks.push({ kind, state: leadCheck });
  if (usable(leads)) {
    const leadSignal = (l: LeadRow, kind: SignalKind, detail: string, action: Signal["action"], createdAt: string | null = null): Signal => ({
      signalKey: `${kind}:${normalId(l.id)}`, kind, title: l.name, detail, sourceLabel: "Students & Parents", sourceUrl: l.pageUrl,
      checkedAt: leads.lastCheckedAt, createdAt, action,
    });
    const inSales = (l: LeadRow) => ({ label: "Call now", href: `?mode=sales&lead=${l.id}` });
    for (const l of leads.data ?? []) {
      const created = instantOf(l.createdAt);
      if (l.stage === "New" && created !== null && created <= at && at - created <= TUNING.consoleFreshLeadLookbackHours * HOUR) {
        add(leadSignal(l, "fresh_lead", `${l.source ?? "No source"}, created ${whenLabel(l.createdAt)}`, inSales(l), new Date(created).toISOString()));
      }
      const due = instantOf(l.nextActionDue);
      const optedOut = l.lostReason !== null && OPTED_OUT.has(l.lostReason);
      if (due !== null && due < at && l.stage !== null && ACTIVE.has(l.stage) && !optedOut) {
        add(leadSignal(l, "followup_overdue", `${l.nextAction ?? "Follow-up"} due ${whenLabel(l.nextActionDue)}, ${l.stage}`, { label: "Open in Sales", href: `?mode=sales&lead=${l.id}` }));
      }
      const attended = instantOf(l.trialAttendedAt);
      if (attended !== null && l.stage !== null && UNDECIDED.has(l.stage) && at - attended > TUNING.consoleTrialDecisionHours * HOUR) {
        add(leadSignal(l, "trial_undecided", `Trial attended ${whenLabel(l.trialAttendedAt)}, still ${l.stage}`, { label: "Open in Notion", href: l.pageUrl }));
      }
    }
  }

  // Lesson-log gaps, from Operations.
  const gaps = input.lessonGaps;
  checks.push({ kind: "lesson_gap", state: checkOf(gaps) });
  if (usable(gaps)) {
    for (const g of gaps.data?.gaps ?? []) {
      const ended = Date.parse(g.endedAt);
      if (Number.isNaN(ended) || at - ended <= TUNING.consoleLessonGapSignalHours * HOUR) continue;
      add({
        signalKey: `lesson_gap:${g.key}`, kind: "lesson_gap", title: g.title, detail: `${g.reason}, ${g.ended}`, sourceLabel: "Schedule", sourceUrl: g.href,
        checkedAt: gaps.lastCheckedAt ?? checkedAt, createdAt: null, action: { label: g.reason, href: g.href },
      });
    }
  }

  // People sync freshness.
  const people = panels.people;
  checks.push({ kind: "people_stale", state: people.status === "error" ? "skipped" : "ok" });
  if (people.status !== "error" && people.staleReason === "people_sync_stale") {
    const synced = people.data?.syncedAt ?? null;
    add({
      signalKey: "people_stale:people", kind: "people_stale", title: "People sync stale", detail: synced ? `Last sync ${whenLabel(synced)}` : "No successful sync yet",
      sourceLabel: "People copy", sourceUrl: SETUP, checkedAt: people.lastCheckedAt, createdAt: null, action: { label: "Open setup", href: SETUP },
    });
  }

  // Failed Notion exports: one aggregate signal, never last_error.
  const outbox = input.outbox;
  checks.push({ kind: "outbox_failed", state: outbox?.ok ? "ok" : "skipped" });
  if (outbox?.ok && outbox.rows.length > 0) {
    const kinds = [...new Set(outbox.rows.map((r) => r.kind))].sort().join(", ");
    add({
      signalKey: "outbox_failed:outbox", kind: "outbox_failed", title: plural(outbox.rows.length, "failed export"), detail: `Kinds: ${kinds}`,
      sourceLabel: "Notion exports", sourceUrl: SCHEDULE, checkedAt: outbox.checkedAt, createdAt: null, action: { label: "Open schedule", href: SCHEDULE },
    });
  }

  // Provider failures: every failed or partial read, the people copy's staleness aside (its own kind above).
  const failure = (id: string, label: string, s: Source | null, sourceUrl: string) => {
    if (s === null || !failing(s)) return;
    add({
      signalKey: `provider_failure:${id}`, kind: "provider_failure", title: `${label} ${s.status === "error" ? "check failed" : "read incomplete"}`,
      detail: (s.status === "error" ? s.errorMessage : s.staleReason) ?? "Read failed", sourceLabel: label, sourceUrl,
      checkedAt: s.lastCheckedAt ?? checkedAt, createdAt: null, action: { label: "Open source", href: sourceUrl },
    });
  };
  const notionSource = (r: PanelResult<unknown>) => r.sourceEvidence.find((e) => e.source === "notion")?.sourceUrl ?? notionPageUrl(r.sourceEvidence[0]?.sourceId ?? "");
  failure("leads", "Notion leads", leads, notionSource(leads));
  failure("touches", "Notion touches", panels.touches, notionSource(panels.touches));
  failure("trialLessons", "Notion lessons", panels.trialLessons, notionSource(panels.trialLessons));
  failure("work", "Notion work", panels.work, notionSource(panels.work));
  failure("invoices", "Notion invoices", panels.invoices, notionSource(panels.invoices));
  failure("people", "People sync", people, SETUP);
  failure("schedule", "Scheduler tables", input.schedule, SCHEDULE);
  failure("lessons", "Lesson log", gaps, gaps?.canonical?.href ?? SCHEDULE);
  if (outbox && !outbox.ok) {
    failure("outbox", "Outbox", { status: "error", lastCheckedAt: outbox.checkedAt, lastSuccessfulFetchAt: null, staleReason: null, errorMessage: outbox.message, data: null }, SCHEDULE);
  }

  return {
    checkedAt,
    signals: [...signals.values()],
    checks,
    health: buildHealth(input),
    protectedTime: input.protectedTime,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function entry(key: HealthKey, s: Source | null): HealthEntry {
  if (s === null) return { key, label: HEALTH_LABELS[key], status: "unverifiable", lastCheckedAt: null, lastSuccessfulFetchAt: null, staleReason: NOT_CHECKED, errorMessage: null };
  return { key, label: HEALTH_LABELS[key], status: s.status, lastCheckedAt: s.lastCheckedAt, lastSuccessfulFetchAt: s.lastSuccessfulFetchAt, staleReason: s.staleReason, errorMessage: s.errorMessage };
}

/** The seven providers in their fixed order (AC7). A provider with no read is "Not checked", never ok. */
export function buildHealth(input: Omit<SignalsInput, "protectedTime">): HealthEntry[] {
  const { panels } = input;
  const worse = (a: Source, b: Source | null) => (b !== null && SEVERITY[b.status] > SEVERITY[a.status] ? b : a);
  const outbox: Source | null = input.outbox === null
    ? null
    : input.outbox.ok
      ? {
          status: input.outbox.rows.length ? "stale" : "ready", lastCheckedAt: input.outbox.checkedAt, lastSuccessfulFetchAt: input.outbox.checkedAt,
          staleReason: input.outbox.rows.length ? plural(input.outbox.rows.length, "failed export") : null, errorMessage: null, data: input.outbox.rows,
        }
      : { status: "error", lastCheckedAt: input.outbox.checkedAt, lastSuccessfulFetchAt: null, staleReason: null, errorMessage: input.outbox.message, data: null };
  return [
    entry("notionLeads", panels.leads),
    entry("notionLessons", worse(panels.trialLessons, input.lessonGaps)),
    entry("notionInvoices", panels.invoices),
    entry("notionWork", panels.work),
    entry("schedulerTables", input.schedule),
    entry("peopleSync", panels.people),
    entry("outbox", outbox),
  ];
}

/** The signals slots' panel: stale while a check failed or a refresh failed, empty only when every check is ok (AC3). */
export function signalsSlotView(view: SignalsView, rows: Signal[] = view.signals.filter((s) => s.kind !== "fresh_lead"), failure: { at: string; message: string } | null = null): PanelView<Signal[]> {
  const failed = view.checks.filter((c) => c.state !== "ok").map((c) => KIND_LABELS[c.kind]);
  const staleReason = failure ? `Refresh failed: ${failure.message}` : failed.length ? `Some checks failed: ${failed.join(", ")}` : null;
  return {
    panel: "signals", status: staleReason ? "stale" : rows.length ? "ready" : "empty", data: rows, count: rows.length,
    lastCheckedAt: failure?.at ?? view.checkedAt, lastSuccessfulFetchAt: view.checkedAt, staleReason, errorMessage: null, sourceEvidence: [],
  };
}

/** The integrations slot's panel: the worst provider's status, with the seven entries as data. */
export function healthSlotView(view: SignalsView, health: HealthEntry[] = view.health): PanelView<HealthEntry[]> {
  const worst = health.reduce<PanelStatus>((w, h) => (SEVERITY[h.status] > SEVERITY[w] ? h.status : w), "ready");
  const status: PanelStatus = worst === "error" || worst === "stale" || worst === "unverifiable" ? "stale" : "ready";
  const bad = health.filter((h) => h.status === "error" || h.status === "stale" || h.status === "unverifiable").map((h) => h.label);
  return {
    panel: "integrations", status, data: health, count: health.length, lastCheckedAt: view.checkedAt, lastSuccessfulFetchAt: view.checkedAt,
    staleReason: bad.length ? `Not ok: ${bad.join(", ")}` : null, errorMessage: null, sourceEvidence: [],
  };
}
