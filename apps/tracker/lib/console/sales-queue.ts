import { normalId } from "../domain/billing";
import { localToUtc } from "../domain/schedule/wallclock";
import { localDateOf, localHhmm } from "../time";
import type { LeadRow, TrialLessonRow } from "./contracts";

/**
 * The Sales next-lead queue (REQ-57, tracker ADR 0071). Pure: no I/O, no
 * clock but the `now` it is given. One ranked, deduplicated list from the
 * leads read model, a reason per item, and the rows that break the OPS
 * SYSTEM rules listed as exceptions, never hidden.
 */
export type Bucket = 1 | 2 | 3 | 4 | 5;
export type QueueEntry = { lead: LeadRow; bucket: Bucket; effectiveBucket: Bucket; priorityReason: string; trialLessonId: string | null };
export type QueueException = { id: string; pageUrl: string; name: string; stage: string | null; reason: "No Next Action Due" | "No Stage" };
export type RankedQueue = { items: QueueEntry[]; exceptions: QueueException[]; mergedDuplicates: number };

const ACTIVE = new Set(["New", "Working", "Trial Booked", "Trial Claimed", "Awaiting Close", "Onboarding"]);
const NEEDS_DUE = new Set(["New", "Working", "Awaiting Close", "Onboarding"]);
const OPTED_OUT = new Set(["Do not contact", "Duplicate"]);
const CALLBACK = new Set(["Call", "Text"]);
const LIFTED = " (moved up: due earlier)";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A Notion date as an instant: a date-only value is 00:00 Toronto that day. Null when unset or unreadable. */
export function instantOf(value: string | null): number | null {
  if (value === null) return null;
  const at = Date.parse(DATE_ONLY.test(value) ? localToUtc(value, "00:00") : value);
  return Number.isNaN(at) ? null : at;
}

/** "Wed 21 Oct" for a calendar date (YYYY-MM-DD). */
export function dayLabel(date: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).formatToParts(new Date(`${date}T12:00:00Z`));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** "Wed 21 Oct 09:00" for a datetime in Toronto, "Wed 21 Oct" for a date-only value, null when unreadable. */
export function whenLabel(value: string | null): string | null {
  if (value === null) return null;
  const date = localDateOf(value);
  if (date === null) return null;
  return DATE_ONLY.test(value) ? dayLabel(date) : `${dayLabel(date)} ${localHhmm(new Date(value))}`;
}

type Candidate = { lead: LeadRow; bucket: Bucket; due: number | null; trial: TrialLessonRow | null };

/** Ascending, with nulls last. */
const nullsLast = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b);
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function compare(a: Candidate & { effective: Bucket }, b: Candidate & { effective: Bucket }): number {
  if (a.effective !== b.effective) return a.effective - b.effective;
  if (a.effective === 5) {
    // Oldest Last Contact first, never contacted before any.
    const la = instantOf(a.lead.lastContact);
    const lb = instantOf(b.lead.lastContact);
    if (la !== lb) {
      if (la === null) return -1;
      if (lb === null) return 1;
      return la - lb;
    }
  }
  return nullsLast(a.due, b.due) || nullsLast(instantOf(a.lead.createdAt), instantOf(b.lead.createdAt)) || byText(normalId(a.lead.id), normalId(b.lead.id));
}

function reasonOf(c: Candidate, effective: Bucket): string {
  const l = c.lead;
  const action = l.nextAction ?? "Next action";
  let reason: string;
  switch (c.bucket) {
    case 1:
      reason = "New lead, not contacted yet";
      break;
    case 2:
      reason = `Urgent callback: ${action} due ${whenLabel(l.nextActionDue)}`;
      break;
    case 3:
      reason = l.stage === "Awaiting Close"
        ? "Post-trial decision: awaiting close"
        : c.trial?.date
          ? `Post-trial decision: trial on ${dayLabel(c.trial.date)}, not closed`
          : "Post-trial decision: trial logged, not closed";
      break;
    case 4:
      reason = `Follow-up due: ${action} due ${whenLabel(l.nextActionDue)}`;
      break;
    case 5: {
      const last = localDateOf(l.lastContact);
      const next = whenLabel(l.nextActionDue);
      reason = `Later: ${last ? `last contact ${dayLabel(last)}` : "never contacted"}, ${next ? `next ${action} ${next}` : "no due date"}`;
      break;
    }
  }
  return effective < c.bucket ? `${reason}${LIFTED}` : reason;
}

export function rankSalesQueue(input: { leads: LeadRow[]; trialLessons: TrialLessonRow[] | null; now: Date }): RankedQueue {
  const now = input.now.getTime();
  const byPage = new Map<string, LeadRow>();
  for (const l of input.leads) if (!byPage.has(normalId(l.id))) byPage.set(normalId(l.id), l);
  const rows = [...byPage.values()];

  const exceptions: QueueException[] = rows
    .flatMap((l): QueueException[] => {
      const base = { id: l.id, pageUrl: l.pageUrl, name: l.name, stage: l.stage };
      if (l.stage === null) return [{ ...base, reason: "No Stage" }];
      if (NEEDS_DUE.has(l.stage) && l.nextActionDue === null) return [{ ...base, reason: "No Next Action Due" }];
      return [];
    })
    .sort((a, b) => nullsLast(instantOf(byPage.get(normalId(a.id))!.createdAt), instantOf(byPage.get(normalId(b.id))!.createdAt)) || byText(normalId(a.id), normalId(b.id)));

  // Newest trial lesson per student, date descending then id.
  const trials = new Map<string, TrialLessonRow>();
  const sortedTrials = [...(input.trialLessons ?? [])].sort((a, b) => byText(b.date ?? "", a.date ?? "") || byText(a.id, b.id));
  for (const t of sortedTrials) if (t.studentId && !trials.has(normalId(t.studentId))) trials.set(normalId(t.studentId), t);

  const eligible = rows.filter((l) => l.stage !== null && ACTIVE.has(l.stage) && !(l.lostReason && OPTED_OUT.has(l.lostReason)) && l.nextAction !== "None");
  const candidates: Candidate[] = eligible.map((l) => {
    const due = instantOf(l.nextActionDue);
    const overdue = due !== null && due <= now;
    const trial = trials.get(normalId(l.id)) ?? null;
    let bucket: Bucket;
    if (l.stage === "New") bucket = 1;
    else if (l.stage === "Working" && l.nextAction !== null && CALLBACK.has(l.nextAction) && overdue) bucket = 2;
    else if (l.stage === "Awaiting Close" || (l.stage === "Trial Claimed" && trial !== null && l.closedAt === null)) bucket = 3;
    else if (overdue) bucket = 4;
    else bucket = 5;
    return { lead: l, bucket, due, trial };
  });

  // Lead ID dedupe: per key keep the row with the smallest base sort key.
  const baseSorted = candidates.map((c) => ({ ...c, effective: c.bucket })).sort(compare);
  const kept: Candidate[] = [];
  const seenKeys = new Set<string>();
  let mergedDuplicates = 0;
  for (const c of baseSorted) {
    const key = c.lead.dedupeKey;
    if (key !== null) {
      if (seenKeys.has(key)) {
        mergedDuplicates++;
        continue;
      }
      seenKeys.add(key);
    }
    kept.push(c);
  }

  // The override: an overdue explicit due lifts into bucket 2 or 3 when that bucket holds a later due. Bucket 1 is never jumped.
  const lifted = kept.map((c) => {
    let effective = c.bucket;
    if (c.bucket >= 3 && c.due !== null && c.due <= now) {
      for (const b of [2, 3] as const) {
        if (b < c.bucket && kept.some((o) => o.bucket === b && o.due !== null && o.due > c.due!)) {
          effective = b;
          break;
        }
      }
    }
    return { ...c, effective };
  });

  const items = lifted.sort(compare).map((c) => ({
    lead: c.lead, bucket: c.bucket, effectiveBucket: c.effective, priorityReason: reasonOf(c, c.effective), trialLessonId: c.trial?.id ?? null,
  }));
  return { items, exceptions, mergedDuplicates };
}
