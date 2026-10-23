import { describe, expect, it } from "vitest";
import type { ConsolePanels, LeadRow, PanelResult } from "./contracts";
import type { LessonGapsData } from "./operations";
import type { PanelView } from "./panel-view";
import { buildSignals, HEALTH_LABELS, NOT_CHECKED, SignalsViewSchema, type OutboxRead, type SignalsInput } from "./signals";

// REQ-62 AC1, AC3, AC5, AC7: the pure signal builder.
const NOW = new Date("2026-10-22T18:00:00.000Z");
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const ID = "aaaaaaaa-0000-4000-8000-000000000001";

function lead(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: ID, pageUrl: "https://www.notion.so/aaaaaaaa000040008000000000000001", createdAt: at(-2), name: "Nova New", stage: "New", ownerStaffId: null, ownerName: null,
    nextAction: "Call", nextActionDue: null, nextActionDueDate: null, attempts: 0, lastContact: null, source: "Meta form", lostReason: null, contactedAt: null,
    trialBookedAt: null, trialAttendedAt: null, closedAt: null, trialTime: null, trialTimeDate: null, trialTeacherId: null, trialTeacherName: null, level: null,
    hasMajorGaps: false, recommendedPlan: null, hasTrialSummary: false, parentName: null, inPeopleCopy: false, dedupeKey: null, grade: null, subjects: [],
    majorGaps: null, trialSummary: null, ...over,
  };
}

function panel<T>(id: PanelResult<T>["panel"], data: T | null, over: Partial<PanelResult<T>> = {}): PanelResult<T> {
  return {
    panel: id, status: data === null ? "error" : "ready", data, count: Array.isArray(data) ? data.length : null, lastCheckedAt: at(0), lastSuccessfulFetchAt: at(0),
    staleReason: null, errorMessage: data === null ? "Timed out after 8 s" : null,
    sourceEvidence: [{ source: "notion", sourceId: `src-${id}`, sourceUrl: `https://www.notion.so/src${id}`, observedAt: at(0) }], ...over,
  };
}

function panels(leads: LeadRow[] | null, over: Partial<ConsolePanels> = {}): ConsolePanels {
  return {
    leads: panel("leads", leads),
    touches: panel("touches", []),
    trialLessons: panel("trialLessons", []),
    work: panel("work", []),
    invoices: panel("invoices", []),
    people: panel("people", { syncedAt: at(-0.5), students: 3, staff: 1 }),
    ...over,
  };
}

const GAPS: LessonGapsData = {
  window: { from: "2026-10-09", to: "2026-10-22", days: 14, label: "Last 14 days" },
  gaps: [
    { id: "g47", key: "sched:s1:2026-10-20", title: "Sam S. with Ryan M., MHF4U", action: "log", reason: "Log", ended: "ended Tue 20 Oct", endedAt: at(-47), href: "/tracker/schedule?date=2026-10-20" },
    { id: "g49", key: "sched:s1:2026-10-19", title: "Sam S. with Ryan M., MHF4U", action: "log", reason: "Log", ended: "ended Mon 19 Oct", endedAt: at(-49), href: "/tracker/schedule?date=2026-10-19" },
  ],
  moreGaps: 0, noShows: [], moreNoShows: 0, pendingLogs: 0, toggle: { href: "?", label: "Show 31 days" }, unlinkedHref: "/tracker/schedule/lessons",
};
const view = <T,>(id: string, data: T | null, over: Partial<PanelView<T>> = {}): PanelView<T> => ({
  panel: id, status: data === null ? "error" : "ready", data, count: null, lastCheckedAt: at(0), lastSuccessfulFetchAt: at(0), staleReason: null,
  errorMessage: data === null ? "unavailable" : null, sourceEvidence: [], ...over,
});
const OUTBOX: OutboxRead = { ok: true, checkedAt: at(0), rows: [] };

function input(over: Partial<SignalsInput> = {}): SignalsInput {
  return { panels: panels([lead()]), lessonGaps: view("lessonGaps", GAPS), schedule: view("upcoming", []), outbox: OUTBOX, protectedTime: { state: "free" }, ...over };
}
const keys = (i: SignalsInput) => buildSignals(i, NOW).signals.map((s) => s.signalKey).sort();

describe("fresh leads (AC1)", () => {
  it("duplicate rows for one page id, dashed and undashed, give one fresh_lead", () => {
    const rows = [lead(), lead({ id: ID.replaceAll("-", "") }), lead({ id: ID.toUpperCase() })];
    const fresh = buildSignals(input({ panels: panels(rows) }), NOW).signals.filter((s) => s.kind === "fresh_lead");
    expect(fresh).toHaveLength(1);
    expect(fresh[0].signalKey).toBe("fresh_lead:aaaaaaaa000040008000000000000001");
  });

  it("an edit that keeps created_time gives the same key on the next poll", () => {
    const first = keys(input());
    const edited = keys(input({ panels: panels([lead({ nextAction: "Text", lastContact: at(-1) })]) }));
    expect(edited).toEqual(first);
  });

  it("a stage other than New, or a created time outside the lookback, is not fresh", () => {
    expect(keys(input({ panels: panels([lead({ stage: "Working" })]) }))).not.toContain("fresh_lead:aaaaaaaa000040008000000000000001");
    expect(keys(input({ panels: panels([lead({ createdAt: at(-73) })]) }))).not.toContain("fresh_lead:aaaaaaaa000040008000000000000001");
    expect(keys(input({ panels: panels([lead({ createdAt: at(-71) })]) }))).toContain("fresh_lead:aaaaaaaa000040008000000000000001");
  });

  it("carries the name, source, created time and a Call now deep link", () => {
    const [s] = buildSignals(input(), NOW).signals;
    expect(s).toMatchObject({ title: "Nova New", createdAt: at(-2), action: { label: "Call now", href: `?mode=sales&lead=${ID}` }, sourceLabel: "Students & Parents" });
    expect(s.detail).toMatch(/^Meta form, created Thu 22 Oct \d\d:\d\d$/);
  });
});

describe("thresholds (AC3)", () => {
  it("a trial attended 23 h 59 m ago is not undecided; 24 h 1 m ago is", () => {
    const trial = (h: number) => panels([lead({ stage: "Awaiting Close", trialAttendedAt: at(-h), createdAt: at(-200) })]);
    expect(keys(input({ panels: trial(23 + 59 / 60) }))).not.toContain(`trial_undecided:${ID.replaceAll("-", "")}`);
    expect(keys(input({ panels: trial(24 + 1 / 60) }))).toContain(`trial_undecided:${ID.replaceAll("-", "")}`);
  });

  it("a gap 47 h old is not a signal; 49 h old is", () => {
    const gaps = buildSignals(input(), NOW).signals.filter((s) => s.kind === "lesson_gap");
    expect(gaps.map((s) => s.signalKey)).toEqual(["lesson_gap:sched:s1:2026-10-19"]);
  });

  it("an overdue follow-up on an active stage counts; opted out or Lost does not", () => {
    const overdue = (over: Partial<LeadRow>) => keys(input({ panels: panels([lead({ stage: "Working", nextActionDue: at(-1), ...over })]) }));
    const key = `followup_overdue:${ID.replaceAll("-", "")}`;
    expect(overdue({})).toContain(key);
    expect(overdue({ lostReason: "Do not contact" })).not.toContain(key);
    expect(overdue({ stage: "Lost" })).not.toContain(key);
    expect(overdue({ nextActionDue: at(1) })).not.toContain(key);
  });

  it("every signal has a source label, link, check time and one action", () => {
    const i = input({
      panels: panels([lead({ stage: "Awaiting Close", nextActionDue: at(-1), trialAttendedAt: at(-30) }), lead({ id: "bbbbbbbb-0000-4000-8000-000000000002" })], {
        people: panel("people", { syncedAt: at(-5), students: 3, staff: 1 }, { status: "stale", staleReason: "people_sync_stale" }),
        work: panel<NonNullable<ConsolePanels["work"]["data"]>>("work", null),
      }),
      outbox: { ok: true, checkedAt: at(0), rows: [{ id: "o1", kind: "summary", finishedAt: at(-1) }, { id: "o2", kind: "daily_task", finishedAt: null }] },
    });
    const out = buildSignals(i, NOW).signals;
    expect(new Set(out.map((s) => s.kind))).toEqual(new Set(["fresh_lead", "followup_overdue", "trial_undecided", "lesson_gap", "people_stale", "outbox_failed", "provider_failure"]));
    for (const s of out) {
      expect(s.sourceLabel).not.toBe("");
      expect(s.sourceUrl).not.toBe("");
      expect(s.checkedAt).toBe(at(0));
      expect(s.action.href).not.toBe("");
    }
    expect(out.find((s) => s.kind === "outbox_failed")).toMatchObject({ title: "2 failed exports", detail: "Kinds: daily_task, summary" });
  });
});

describe("failed sources (T3, AC3, AC7)", () => {
  const failed = () => buildSignals(input({ panels: panels(null) }), NOW);

  it("a leads error adds provider_failure:leads and skips the three lead kinds", () => {
    const out = failed();
    expect(out.signals.map((s) => s.signalKey)).toContain("provider_failure:leads");
    expect(out.signals.find((s) => s.signalKey === "provider_failure:leads")?.detail).toBe("Timed out after 8 s");
    expect(out.signals.some((s) => ["fresh_lead", "followup_overdue", "trial_undecided"].includes(s.kind))).toBe(false);
    for (const kind of ["fresh_lead", "followup_overdue", "trial_undecided"]) expect(out.checks.find((c) => c.kind === kind)?.state).toBe("skipped");
    expect(out.checks.find((c) => c.kind === "lesson_gap")?.state).toBe("ok");
    expect(out.health[0]).toMatchObject({ key: "notionLeads", status: "error", errorMessage: "Timed out after 8 s" });
  });

  it("the same across three polls", () => {
    const runs = [failed(), failed(), failed()].map((v) => JSON.stringify({ ...v, checkedAt: null }));
    expect(new Set(runs).size).toBe(1);
  });

  it("a stale only for joining names adds no provider failure; a page-cap stale does, and marks the check failed", () => {
    const names = buildSignals(input({ panels: panels([lead()], { leads: panel("leads", [lead()], { status: "stale", staleReason: "names_unavailable" }) }) }), NOW);
    expect(names.signals.some((s) => s.kind === "provider_failure")).toBe(false);
    expect(names.checks.every((c) => c.state === "ok")).toBe(true);
    const capped = buildSignals(input({ panels: panels([lead()], { leads: panel("leads", [lead()], { status: "stale", staleReason: "Stopped after 10 pages; showing 1000 rows" }) }) }), NOW);
    expect(capped.signals.find((s) => s.signalKey === "provider_failure:leads")?.detail).toBe("Stopped after 10 pages; showing 1000 rows");
    expect(capped.checks.find((c) => c.kind === "fresh_lead")?.state).toBe("failed");
  });

  it("a failed outbox read skips outbox_failed and stands in as a provider failure; health red", () => {
    const out = buildSignals(input({ outbox: { ok: false, checkedAt: at(0), message: "Read failed" } }), NOW);
    expect(out.checks.find((c) => c.kind === "outbox_failed")?.state).toBe("skipped");
    expect(out.signals.find((s) => s.signalKey === "provider_failure:outbox")?.detail).toBe("Read failed");
    expect(out.health.at(-1)).toMatchObject({ key: "outbox", status: "error" });
  });
});

describe("health (AC7)", () => {
  it("seven providers in a fixed order; a missing read is Not checked, never ok", () => {
    const h = buildSignals(input({ lessonGaps: null, schedule: null, outbox: null }), NOW).health;
    expect(h.map((e) => e.label)).toEqual(Object.values(HEALTH_LABELS));
    expect(h.map((e) => e.label)).toEqual(["Notion leads", "Notion lessons", "Notion invoices", "Notion work", "Scheduler tables", "People sync", "Outbox"]);
    expect(h[4]).toMatchObject({ status: "unverifiable", staleReason: NOT_CHECKED });
    expect(h[6]).toMatchObject({ status: "unverifiable", staleReason: NOT_CHECKED });
  });

  it("Notion lessons is the worse of trial lessons and the operations lessons read; failed exports are stale", () => {
    const h = buildSignals(input({
      lessonGaps: view<LessonGapsData>("lessonGaps", null, { errorMessage: "Lessons is missing Class occurrence" }),
      outbox: { ok: true, checkedAt: at(0), rows: [{ id: "o1", kind: "summary", finishedAt: null }] },
    }), NOW).health;
    expect(h[1]).toMatchObject({ status: "error", errorMessage: "Lessons is missing Class occurrence" });
    expect(h[6]).toMatchObject({ status: "stale", staleReason: "1 failed export" });
  });
});

describe("what leaves the server (AC5)", () => {
  it("SignalsViewSchema drops a phone, an email and last_error", () => {
    const leaky = { ...lead(), parentPhone: "555-0177", parentEmail: "parent@example.com", "Parent Phone": "555-0177" } as LeadRow;
    const outbox = { ok: true, checkedAt: at(0), rows: [{ id: "o1", kind: "summary", finishedAt: null, last_error: "Notion said 409 for parent@example.com" }] } as unknown as OutboxRead;
    const built = buildSignals(input({ panels: panels([leaky]), outbox }), NOW);
    (built.signals[0] as Record<string, unknown>).parentPhone = "555-0177";
    const json = JSON.stringify(SignalsViewSchema.parse(built));
    expect(json).not.toContain("555-0177");
    expect(json).not.toContain("@");
    expect(json).not.toContain("409");
  });
});
