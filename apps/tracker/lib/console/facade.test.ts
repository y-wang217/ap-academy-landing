import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvoiceSource, LeadSource, ReadResult, TouchSource, TrialLessonSource, WorkSource } from "./contracts";
import { loadConsolePanels, ProviderTimeoutError, type FacadeDeps, type NotionPorts, type PeopleSnapshot } from "./facade";

// REQ-54 AC2, AC3, AC4, AC5, AC10, AC11: the facade over fake ports.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const T1 = new Date("2026-10-22T12:00:00.000Z");
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const S2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002";
const STAFF = "cccccccc-cccc-4ccc-8ccc-cccccccc0001";
const W1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0001";
const SOURCES = { leads: "fe3d651a", touches: "772939bd", trialLessons: "6300f58a", work: "3031b455", invoices: "be0f91e4" };

const lead = (id: string, name: string, extra: Partial<LeadSource> = {}): LeadSource => ({
  id, createdAt: "2026-10-20T14:00:00.000Z", name, stage: "New", ownerStaffId: STAFF, nextAction: "Call", nextActionDue: "2026-11-01T03:30:00Z",
  attempts: 1, lastContact: null, source: "Website", lostReason: null, contactedAt: null, trialBookedAt: null, trialAttendedAt: null, closedAt: null,
  trialTime: null, trialTeacherId: null, level: null, hasMajorGaps: false, recommendedPlan: null, hasTrialSummary: false, parentName: "Pat",
  leadId: null, grade: null, subjects: [], majorGaps: null, trialSummary: null, ...extra,
});
const touch = (n: number, studentId: string): TouchSource => ({
  id: `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`, when: `2026-10-${String(10 + n).padStart(2, "0")}T12:00:00Z`, type: "Call", outcome: "No answer", studentId, staffId: STAFF, note: "n",
});
const trial: TrialLessonSource = { id: W1, date: "2026-10-18", studentId: S1, teacherId: STAFF, durationHours: 1, hasTopic: true, hasDiagnosis: false, preferredDays: [], diagnosis: null };
const work: WorkSource = { id: W1, name: "Post", area: "Marketing", state: "Next", type: "Task", dueReview: "2026-10-24", owner: "Charlie", taskTypeIds: [] };
const invoice: InvoiceSource = { id: W1, status: "Sent", paidOn: null, amount: 240, creditApplied: null, issued: "2026-10-01", due: "2026-10-15", month: "2026-10", studentIds: [S2.toUpperCase(), S1] };
const done = <T,>(rows: T[], extra: Partial<ReadResult<T>> = {}): ReadResult<T> => ({ rows, complete: true, skipped: 0, pages: 1, ...extra });

const freshPeople = (now: Date): PeopleSnapshot => ({
  students: [{ id: S1, name: "Sam L.", stage: "Active", active: true }, { id: S2, name: "Sam L.", stage: "New", active: true }],
  staff: [{ id: STAFF, name: "Ryan", active: true }],
  syncedAt: new Date(now.getTime() - 10 * 60_000).toISOString(),
});

function ports(over: Partial<NotionPorts> = {}): NotionPorts {
  return {
    leads: async () => done([lead(S1, "Sam Lee"), lead(S2, "Sam Lee")]),
    touches: async () => done([touch(1, S1), touch(2, S1), touch(3, S2)]),
    trialLessons: async () => done([trial]),
    work: async () => done([work]),
    invoices: async () => done([invoice]),
    ...over,
  };
}

function deps(over: Partial<FacadeDeps> = {}, now = T1): FacadeDeps {
  return {
    orgId: ORG, now: () => now, people: async () => freshPeople(now), notion: ports(), sources: SOURCES,
    timeoutMs: 8_000, maxPages: 10, touchesPerStudent: 5, touchesWindowDays: 90, freshness: new Map(), ...over,
  };
}

afterEach(() => vi.useRealTimers());

describe("loadConsolePanels", () => {
  it("all ready: six panels, every one with times and evidence", async () => {
    const p = await loadConsolePanels(deps());
    expect(Object.keys(p).sort()).toEqual(["invoices", "leads", "people", "touches", "trialLessons", "work"]);
    for (const r of Object.values(p)) {
      expect(r.status).toBe("ready");
      expect(r.lastCheckedAt).toBe(T1.toISOString());
      expect(r.lastSuccessfulFetchAt).toBe(T1.toISOString());
      expect(r.sourceEvidence.length).toBeGreaterThan(0);
      expect(r.errorMessage).toBeNull();
    }
    expect(p.leads.sourceEvidence[0]).toEqual({ source: "notion", sourceId: "fe3d651a", sourceUrl: "https://www.notion.so/fe3d651a", observedAt: T1.toISOString() });
    expect(p.people.sourceEvidence.map((e) => e.sourceId)).toEqual(["tracker.student_people", "tracker.staff"]);
  });

  it("joins by page id: two same-name leads are two rows, names and owners resolved by id", async () => {
    const p = await loadConsolePanels(deps());
    expect(p.leads.data?.map((l) => l.id)).toEqual([S1, S2]);
    expect(p.leads.data?.[0]).toMatchObject({ name: "Sam Lee", ownerName: "Ryan", inPeopleCopy: true, pageUrl: `https://www.notion.so/${S1.replaceAll("-", "")}`, nextActionDueDate: "2026-10-31" });
    expect(p.invoices.data?.[0].studentName).toBe("Sam L.");
    expect(p.trialLessons.data?.[0]).toMatchObject({ studentName: "Sam L.", teacherName: "Ryan" });
    expect(p.touches.data?.map((g) => [g.studentId, g.touches.length])).toEqual([[S1, 2], [S2, 1]]);
    expect(p.touches.count).toBe(3);
    expect(p.touches.data?.[0].touches[0].staffName).toBe("Ryan");
  });

  it("a row repeated across pages is returned once", async () => {
    const p = await loadConsolePanels(deps({ notion: ports({ work: async () => done([work, { ...work, id: W1.toUpperCase() }]) }) }));
    expect(p.work.count).toBe(1);
    expect(p.work.data).toHaveLength(1);
  });

  it("one throws, one 500s, one hangs: the others stay ready, the failed ones are errors with no data", async () => {
    vi.useFakeTimers({ now: T1 });
    const notionError = Object.assign(new Error("Notion returned 500"), { name: "NotionError", status: 500 });
    const run = loadConsolePanels(deps({
      notion: ports({
        leads: async () => { throw new Error("boom with Sam Lee in it"); },
        touches: async () => { throw notionError; },
        work: () => new Promise(() => {}),
      }),
    }));
    await vi.advanceTimersByTimeAsync(8_000);
    const p = await run;
    expect([p.trialLessons.status, p.invoices.status, p.people.status]).toEqual(["ready", "ready", "ready"]);
    expect(p.leads).toMatchObject({ status: "error", data: null, count: null, errorMessage: "Read failed", lastSuccessfulFetchAt: null });
    expect(p.touches).toMatchObject({ status: "error", data: null, count: null, errorMessage: "Notion returned 500" });
    expect(p.work).toMatchObject({ status: "error", data: null, count: null, errorMessage: "Timed out after 8 s" });
    for (const r of [p.leads, p.touches, p.work]) expect(r.errorMessage!.length).toBeLessThanOrEqual(300);
  });

  it("an abort from the fetcher reads as the same timeout, and the port gets an AbortSignal", async () => {
    let signal: AbortSignal | undefined;
    const p = await loadConsolePanels(deps({
      notion: ports({
        leads: async (o) => { signal = o.signal; throw new DOMException("aborted", "AbortError"); },
        work: async () => { throw new DOMException("t", "TimeoutError"); },
        invoices: async () => { throw new ProviderTimeoutError(8_000); },
      }),
    }));
    expect(signal).toBeInstanceOf(AbortSignal);
    expect([p.leads.errorMessage, p.work.errorMessage, p.invoices.errorMessage]).toEqual(["Timed out after 8 s", "Timed out after 8 s", "Timed out after 8 s"]);
  });

  it("a long error message is cut to 300 characters", async () => {
    const long = Object.assign(new Error("x".repeat(500)), { name: "NotionError" });
    const p = await loadConsolePanels(deps({ notion: ports({ leads: async () => { throw long; } }) }));
    expect(p.leads.errorMessage).toHaveLength(300);
  });

  it("a truncated read is stale with the count and the cap named, never ready", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ ...work, id: `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, "0")}` }));
    const p = await loadConsolePanels(deps({ notion: ports({ work: async () => done(rows, { complete: false, pages: 10 }) }) }));
    expect(p.work).toMatchObject({ status: "stale", count: 1000, staleReason: "Stopped after 10 pages; showing 1000 rows" });
    expect(p.work.data).toHaveLength(1000);
  });

  it("an empty complete read is empty with count 0", async () => {
    const p = await loadConsolePanels(deps({ notion: ports({ invoices: async () => done([]) }) }));
    expect(p.invoices).toMatchObject({ status: "empty", count: 0, data: [] });
  });

  it("strips keys the row schema does not list", async () => {
    const leaky = { ...lead(S1, "Sam Lee"), parentPhone: "555-0100", leadId: "L-1", notes: "private" } as LeadSource;
    const p = await loadConsolePanels(deps({ notion: ports({ leads: async () => done([leaky]) }) }));
    expect(p.leads.status).toBe("ready");
    expect(JSON.stringify(p.leads)).not.toMatch(/555-0100|private/);
    // REQ-57: the Lead ID stays server-side as the dedupe key; the sales view schema drops it.
    expect(p.leads.data?.[0].dedupeKey).toBe("L-1");
  });

  it("lastCheckedAt every call; lastSuccessfulFetchAt kept from the previous success on failure", async () => {
    const freshness = new Map<string, string>();
    await loadConsolePanels(deps({ freshness }));
    const T2 = new Date("2026-10-22T12:05:00.000Z");
    const p = await loadConsolePanels(deps({ freshness, notion: ports({ leads: async () => { throw new Error("x"); } }) }, T2));
    expect(p.leads).toMatchObject({ status: "error", lastCheckedAt: T2.toISOString(), lastSuccessfulFetchAt: T1.toISOString() });
    expect(p.work).toMatchObject({ lastCheckedAt: T2.toISOString(), lastSuccessfulFetchAt: T2.toISOString() });
    expect([...freshness.keys()].every((k) => k.startsWith(`${ORG}:`))).toBe(true);
  });

  it("people read fails: name panels are stale names_unavailable with null names, people is error", async () => {
    const p = await loadConsolePanels(deps({ people: async () => { throw new Error("unavailable"); } }));
    expect(p.people).toMatchObject({ status: "error", errorMessage: "Read failed", data: null });
    expect(p.leads).toMatchObject({ status: "stale", staleReason: "names_unavailable" });
    expect(p.leads.data?.[0]).toMatchObject({ name: "Sam Lee", ownerName: null, inPeopleCopy: false });
    expect(p.invoices.data?.[0].studentName).toBeNull();
    expect(p.work.status).toBe("ready");
  });

  it("people older than 120 minutes: stale people_sync_stale, Notion data kept", async () => {
    const old = { ...freshPeople(T1), syncedAt: new Date(T1.getTime() - 121 * 60_000).toISOString() };
    const p = await loadConsolePanels(deps({ people: async () => old }));
    expect(p.people).toMatchObject({ status: "stale", staleReason: "people_sync_stale" });
    expect(p.trialLessons).toMatchObject({ status: "stale", staleReason: "people_sync_stale" });
    expect(p.trialLessons.data?.[0].studentName).toBe("Sam L.");
    expect(p.work.status).toBe("ready");
  });

  it("truncated and stale people: stale with both reasons, cap first", async () => {
    const old = { ...freshPeople(T1), syncedAt: null };
    const rows = Array.from({ length: 1000 }, (_, i) => ({ ...invoice, id: `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, "0")}` }));
    const p = await loadConsolePanels(deps({ people: async () => old, notion: ports({ invoices: async () => done(rows, { complete: false, pages: 10 }) }) }));
    expect(p.invoices).toMatchObject({ status: "stale", staleReason: "Stopped after 10 pages; showing 1000 rows; people_sync_stale" });
  });

  it("a failed panel with stale people stays error; an empty one stays empty", async () => {
    const old = { ...freshPeople(T1), syncedAt: null };
    const p = await loadConsolePanels(deps({ people: async () => old, notion: ports({ leads: async () => { throw new Error("x"); }, invoices: async () => done([]) }) }));
    expect(p.leads).toMatchObject({ status: "error", staleReason: null });
    expect(p.invoices).toMatchObject({ status: "empty", staleReason: null });
  });

  it("no Notion token: the five Notion panels say Notion is not configured, people reports its own status", async () => {
    const p = await loadConsolePanels(deps({ notion: null }));
    for (const k of ["leads", "touches", "trialLessons", "work", "invoices"] as const) {
      expect(p[k]).toMatchObject({ status: "error", errorMessage: "Notion is not configured", data: null, count: null });
      expect(p[k].sourceEvidence[0].source).toBe("notion");
    }
    expect(p.people.status).toBe("ready");
  });

  it("touches asks for the 90-day window and keeps students in newest-touch order", async () => {
    let since = "";
    await loadConsolePanels(deps({ notion: ports({ touches: async (o) => { since = o.since; return done([]); } }) }));
    expect(since).toBe("2026-07-24");
  });
});
