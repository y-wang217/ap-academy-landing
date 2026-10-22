import { describe, expect, it } from "vitest";
import type { StudentRecord } from "../notion/students";
import type { ScheduleStore, SeriesRecord, SummaryPatch, SummaryRecord } from "./schedule-store";
import { scheduleSourceLine } from "../domain/schedule/source-line";
import { syncStudentSummary, syncStudentSummaryDetail, type SyncDeps, type StudentPatch } from "./summary-sync";

const S1 = "11111111-1111-4111-8111-111111111111";
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TODAY = "2026-10-14";
const LEGACY = "Tue 17:30-18:30 | MPM2D Math | Jane Doe";
const SITE = "https://www.apacademy.ca";
// 01:30 UTC on the 15th is still the 14th in Toronto.
const ADOPTED_AT = "2026-10-15T01:30:00+00:00";
const LINE = scheduleSourceLine({ adoptedOn: "2026-10-14", staffIds: [T1], siteUrl: SITE });

const series = (over: Partial<SeriesRecord> = {}): SeriesRecord => ({
  id: "50000000-0000-4000-8000-000000000001", staffId: T1, studentId: S1, subject: "MPM2D Math", kind: "weekly", startDate: "2026-10-13",
  startTime: "17:30", durationMinutes: 60, effectiveUntil: null, splitFrom: null, updatedAt: "t", ...over,
});

function harness(opts: { listFails?: boolean; summaryFails?: boolean; summary?: Partial<SummaryRecord> | null; notion?: string | null; source?: string; staffFails?: boolean; writeFails?: boolean; getFails?: boolean; list?: SeriesRecord[] } = {}) {
  const row: SummaryRecord | null = opts.summary === null ? null : {
    id: "s1", studentId: S1, adoptedAt: ADOPTED_AT, adoptedFromText: LEGACY, lastWrittenText: null, lastWrittenAt: null, syncState: "pending",
    lastError: null, lastDriftText: null, lastDriftAt: null, driftSeenAt: null, ...opts.summary,
  };
  let notion = opts.notion === undefined ? LEGACY : opts.notion;
  // Schedule Source already holds the line unless a test says otherwise, so Weekly Schedule cases read as before.
  let source = opts.source ?? LINE;
  const marks: SummaryPatch[] = [];
  /** Weekly Schedule texts written, as before REQ-34. */
  const writes: string[] = [];
  const patches: StudentPatch[] = [];
  let writeFails = opts.writeFails ?? false;
  const store = {
    getSummary: async () => {
      if (opts.summaryFails) throw new Error("unavailable");
      return row;
    },
    listSeriesForStudent: async () => {
      if (opts.listFails) throw new Error("unavailable");
      return { series: opts.list ?? [series()], exceptions: [] };
    },
    markSummary: async (_id: string, patch: SummaryPatch) => { marks.push(patch); return true; },
  } as unknown as ScheduleStore;
  const deps: SyncDeps = {
    store,
    siteUrl: SITE,
    today: () => TODAY,
    fetchStaff: async () => {
      if (opts.staffFails) throw new Error("down");
      return [{ id: T1, name: "Jane Doe", email: null, functions: ["Teacher"], status: "Active", subjects: [] }];
    },
    students: {
      list: async () => [],
      get: async (): Promise<StudentRecord | null> => {
        if (opts.getFails) throw new Error("down");
        return notion === null ? null : { id: S1, name: "Sam", stage: "Active", weeklySchedule: notion, scheduleSource: source };
      },
      write: async (_id, patch) => {
        if (writeFails) throw new Error("Notion returned 429");
        patches.push(patch);
        if (patch.weeklySchedule !== undefined) {
          writes.push(patch.weeklySchedule);
          notion = patch.weeklySchedule;
        }
        if (patch.scheduleSource !== undefined) source = patch.scheduleSource;
      },
    },
  };
  return { deps, marks, writes, patches, source: () => source, notion: () => notion, setWriteFails: (v: boolean) => { writeFails = v; } };
}

describe("syncStudentSummary", () => {
  it("skips a student who is not adopted", async () => {
    const h = harness({ summary: null });
    expect(await syncStudentSummary(h.deps, S1)).toBe("skipped");
    expect(h.writes).toEqual([]);
    expect(h.marks).toEqual([]);
  });

  it("AC13: writes only when the text differs from what Notion has", async () => {
    const same = harness({ notion: LEGACY });
    expect(await syncStudentSummary(same.deps, S1)).toBe("synced");
    expect(same.writes).toEqual([]);
    expect(same.marks).toEqual([{ syncState: "synced", lastWrittenText: LEGACY, lastError: null }]);

    const differs = harness({ notion: "Mon 09:00-10:00 | X | Jane Doe", summary: { lastWrittenText: "Mon 09:00-10:00 | X | Jane Doe" }, list: [series(), series({ id: "50000000-0000-4000-8000-000000000002", startDate: "2026-10-16" })] });
    expect(await syncStudentSummary(differs.deps, S1)).toBe("synced");
    expect(differs.writes).toHaveLength(1);
    expect(differs.writes[0]).toBe("Tue 17:30-18:30 | MPM2D Math | Jane Doe\nFri 17:30-18:30 | MPM2D Math | Jane Doe | from 2026-10-16");
  });

  it("AC15: text edited in Notion since the last write is overwritten and kept as drift", async () => {
    const h = harness({ notion: "someone typed this", summary: { lastWrittenText: LEGACY, syncState: "synced" } });
    expect(await syncStudentSummary(h.deps, S1)).toBe("synced");
    expect(h.writes).toEqual([LEGACY]);
    expect(h.marks.at(-1)).toMatchObject({ syncState: "synced", lastWrittenText: LEGACY, lastDriftText: "someone typed this" });
  });

  it("AC15: before the first write the legacy text is the baseline, so an untouched field is not drift", async () => {
    const h = harness({ notion: LEGACY, list: [series({ subject: "Other" })] });
    await syncStudentSummary(h.deps, S1);
    expect(h.marks.at(-1)).not.toHaveProperty("lastDriftText");
  });

  it("AC14: a failed write is recorded as failed with a short error; a retry writes once", async () => {
    const h = harness({ notion: "old", summary: { lastWrittenText: "old" } });
    h.setWriteFails(true);
    expect(await syncStudentSummary(h.deps, S1)).toBe("failed");
    expect(h.marks.at(-1)).toEqual({ syncState: "failed", lastError: "Notion returned 429" });
    h.setWriteFails(false);
    expect(await syncStudentSummary(h.deps, S1)).toBe("synced");
    expect(h.writes).toHaveLength(1);
  });

  it("a Staff lookup failure, a missing student or an unreadable page means failed and no write", async () => {
    for (const o of [{ staffFails: true }, { notion: null }, { getFails: true }]) {
      const h = harness(o);
      expect(await syncStudentSummary(h.deps, S1)).toBe("failed");
      expect(h.writes).toEqual([]);
      expect(h.marks.at(-1)?.syncState).toBe("failed");
    }
  });

  it("review: a failed series read never blanks Notion; the row ends failed", async () => {
    const h = harness({ listFails: true, notion: LEGACY, summary: { lastWrittenText: LEGACY, syncState: "synced" } });
    expect(await syncStudentSummary(h.deps, S1)).toBe("failed");
    expect(h.writes).toEqual([]);
    expect(h.marks.at(-1)).toMatchObject({ syncState: "failed" });
  });

  it("review: a failed summary read writes nothing and does not throw", async () => {
    const h = harness({ summaryFails: true });
    await expect(syncStudentSummary(h.deps, S1)).resolves.toBe("failed");
    expect(h.writes).toEqual([]);
  });

  it("review: no series at all never replaces a non-empty Notion text with an empty one", async () => {
    const h = harness({ list: [], notion: LEGACY });
    expect(await syncStudentSummary(h.deps, S1)).toBe("failed");
    expect(h.writes).toEqual([]);
  });

  it("review: all series genuinely ended does blank the text, and no series with an empty text is fine", async () => {
    const ended = harness({ list: [series({ effectiveUntil: "2026-10-01" })], notion: LEGACY, summary: { lastWrittenText: LEGACY } });
    expect(await syncStudentSummary(ended.deps, S1)).toBe("synced");
    expect(ended.writes).toEqual([""]);
    const empty = harness({ list: [], notion: "" });
    expect(await syncStudentSummary(empty.deps, S1)).toBe("synced");
    expect(empty.writes).toEqual([]);
  });

  it("never throws to the caller, and truncates the stored error", async () => {
    const h = harness({ notion: "old", summary: { lastWrittenText: "old" } });
    h.deps.students.write = async () => { throw new Error("x".repeat(1000)); };
    await expect(syncStudentSummary(h.deps, S1)).resolves.toBe("failed");
    expect((h.marks.at(-1) as { lastError: string }).lastError.length).toBeLessThanOrEqual(300);
  });
});

describe("Schedule Source (REQ-34)", () => {
  it("AC2: an adopted student with an empty Schedule Source gets one write with both keys", async () => {
    const h = harness({ notion: "Mon 09:00-10:00 | X | Jane Doe", summary: { lastWrittenText: "Mon 09:00-10:00 | X | Jane Doe" }, source: "" });
    expect(await syncStudentSummary(h.deps, S1)).toBe("synced");
    expect(h.patches).toEqual([{ weeklySchedule: LEGACY, scheduleSource: LINE }]);
    expect(LINE).toContain("since 2026-10-14.");
    expect(LINE).toContain(`${SITE}/tracker/schedule?staffId=${T1}`);
  });

  it("AC3: a student who is not adopted is skipped with no write", async () => {
    const h = harness({ summary: null, source: "" });
    expect(await syncStudentSummary(h.deps, S1)).toBe("skipped");
    expect(h.patches).toEqual([]);
  });

  it("AC4: only the property that differs is sent, and nothing when neither differs", async () => {
    const onlySource = harness({ notion: LEGACY, source: "" });
    await syncStudentSummary(onlySource.deps, S1);
    expect(onlySource.patches).toEqual([{ scheduleSource: LINE }]);

    const onlyText = harness({ notion: "Mon 09:00-10:00 | X | Jane Doe", summary: { lastWrittenText: "Mon 09:00-10:00 | X | Jane Doe" } });
    await syncStudentSummary(onlyText.deps, S1);
    expect(onlyText.patches).toEqual([{ weeklySchedule: LEGACY }]);

    const neither = harness({ notion: LEGACY });
    expect(await syncStudentSummary(neither.deps, S1)).toBe("synced");
    expect(neither.patches).toEqual([]);
    expect(neither.marks).toEqual([{ syncState: "synced", lastWrittenText: LEGACY, lastError: null }]);
  });

  it("AC4: a retry after a write that committed but reported an error writes nothing", async () => {
    const h = harness({ notion: "old", summary: { lastWrittenText: "old" }, source: "" });
    const real = h.deps.students.write;
    h.deps.students.write = async (id, patch) => { await real(id, patch); throw new Error("Notion returned 502"); };
    expect(await syncStudentSummary(h.deps, S1)).toBe("failed");
    h.deps.students.write = real;
    expect(await syncStudentSummary(h.deps, S1)).toBe("synced");
    expect(h.patches).toHaveLength(1);
  });

  it("AC5: a hand-edited Schedule Source is put back with no drift recorded", async () => {
    const h = harness({ notion: LEGACY, summary: { lastWrittenText: LEGACY, syncState: "synced" }, source: "someone typed here" });
    expect(await syncStudentSummary(h.deps, S1)).toBe("synced");
    expect(h.patches).toEqual([{ scheduleSource: LINE }]);
    expect(h.marks.at(-1)).not.toHaveProperty("lastDriftText");
    expect(h.marks.at(-1)).not.toHaveProperty("lastDriftAt");
  });

  it("AC8: drift sets both the drift text and its time; no drift sets neither", async () => {
    const before = Date.now();
    const h = harness({ notion: "someone typed this", summary: { lastWrittenText: LEGACY, syncState: "synced" } });
    await syncStudentSummary(h.deps, S1);
    const mark = h.marks.at(-1) as SummaryPatch;
    expect(mark.lastDriftText).toBe("someone typed this");
    expect(Date.parse(mark.lastDriftAt!)).toBeGreaterThanOrEqual(before - 1000);

    const failed = harness({ notion: "typed again", summary: { lastWrittenText: LEGACY, syncState: "synced" }, writeFails: true });
    await syncStudentSummary(failed.deps, S1);
    expect(failed.marks.at(-1)).toMatchObject({ syncState: "failed", lastDriftText: "typed again" });
    expect(typeof (failed.marks.at(-1) as SummaryPatch).lastDriftAt).toBe("string");

    const clean = harness({ notion: LEGACY, summary: { lastWrittenText: LEGACY } });
    await syncStudentSummary(clean.deps, S1);
    expect(clean.marks.at(-1)).not.toHaveProperty("lastDriftAt");
  });

  it("links to every teacher's week when the open classes have several teachers, ignoring ended ones", async () => {
    const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const h = harness({ notion: LEGACY, source: "", list: [series(), series({ id: "50000000-0000-4000-8000-000000000003", staffId: T2, effectiveUntil: "2026-10-01" })] });
    h.deps.fetchStaff = async () => [
      { id: T1, name: "Jane Doe", email: null, functions: ["Teacher"], status: "Active", subjects: [] },
      { id: T2, name: "Ryan Roe", email: null, functions: ["Teacher"], status: "Active", subjects: [] },
    ];
    await syncStudentSummary(h.deps, S1);
    expect(h.source()).toBe(LINE);

    const two = harness({ notion: LEGACY, source: "", list: [series(), series({ id: "50000000-0000-4000-8000-000000000003", staffId: T2, startDate: "2026-10-16" })] });
    two.deps.fetchStaff = h.deps.fetchStaff;
    await syncStudentSummary(two.deps, S1);
    expect(two.source()).toMatch(/\/tracker\/schedule\?view=all$/);
  });

  it("the no-series guard writes neither property", async () => {
    const h = harness({ list: [], notion: LEGACY, source: "" });
    expect(await syncStudentSummary(h.deps, S1)).toBe("failed");
    expect(h.patches).toEqual([]);
  });

  it("the payload hash covers the text and the line", async () => {
    const a = await syncStudentSummaryDetail(harness({ notion: LEGACY }).deps, S1);
    const other = harness({ notion: LEGACY });
    other.deps.siteUrl = "https://example.test";
    const b = await syncStudentSummaryDetail(other.deps, S1);
    expect(a.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.payloadHash).not.toBe(b.payloadHash);
  });
});
