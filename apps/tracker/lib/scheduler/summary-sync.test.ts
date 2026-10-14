import { describe, expect, it } from "vitest";
import type { StudentRecord } from "../notion/students";
import type { ScheduleStore, SeriesRecord, SummaryPatch, SummaryRecord } from "./schedule-store";
import { syncStudentSummary, type SyncDeps } from "./summary-sync";

const S1 = "11111111-1111-4111-8111-111111111111";
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TODAY = "2026-10-14";
const LEGACY = "Tue 17:30-18:30 | MPM2D Math | Jane Doe";

const series = (over: Partial<SeriesRecord> = {}): SeriesRecord => ({
  id: "50000000-0000-4000-8000-000000000001", staffId: T1, studentId: S1, subject: "MPM2D Math", kind: "weekly", startDate: "2026-10-13",
  startTime: "17:30", durationMinutes: 60, effectiveUntil: null, splitFrom: null, updatedAt: "t", ...over,
});

function harness(opts: { summary?: Partial<SummaryRecord> | null; notion?: string | null; staffFails?: boolean; writeFails?: boolean; getFails?: boolean; list?: SeriesRecord[] } = {}) {
  const row: SummaryRecord | null = opts.summary === null ? null : {
    id: "s1", studentId: S1, adoptedAt: TODAY, adoptedFromText: LEGACY, lastWrittenText: null, lastWrittenAt: null, syncState: "pending",
    lastError: null, lastDriftText: null, ...opts.summary,
  };
  let notion = opts.notion === undefined ? LEGACY : opts.notion;
  const marks: SummaryPatch[] = [];
  const writes: string[] = [];
  let writeFails = opts.writeFails ?? false;
  const store = {
    getSummary: async () => row,
    listSeriesForStudent: async () => ({ series: opts.list ?? [series()], exceptions: [] }),
    markSummary: async (_id: string, patch: SummaryPatch) => { marks.push(patch); return true; },
  } as unknown as ScheduleStore;
  const deps: SyncDeps = {
    store,
    today: () => TODAY,
    fetchStaff: async () => {
      if (opts.staffFails) throw new Error("down");
      return [{ id: T1, name: "Jane Doe", email: null, functions: ["Teacher"], status: "Active", subjects: [] }];
    },
    students: {
      list: async () => [],
      get: async (): Promise<StudentRecord | null> => {
        if (opts.getFails) throw new Error("down");
        return notion === null ? null : { id: S1, name: "Sam", stage: "Active", weeklySchedule: notion };
      },
      write: async (_id, text) => {
        if (writeFails) throw new Error("Notion returned 429");
        writes.push(text);
        notion = text;
      },
    },
  };
  return { deps, marks, writes, setWriteFails: (v: boolean) => { writeFails = v; } };
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

  it("never throws to the caller, and truncates the stored error", async () => {
    const h = harness({ notion: "old", summary: { lastWrittenText: "old" } });
    h.deps.students.write = async () => { throw new Error("x".repeat(1000)); };
    await expect(syncStudentSummary(h.deps, S1)).resolves.toBe("failed");
    expect((h.marks.at(-1) as { lastError: string }).lastError.length).toBeLessThanOrEqual(300);
  });
});
