import { describe, expect, it } from "vitest";
import { runPeopleSync, syncErrorReason, type ApplyInput, type PeopleSyncDeps, type SyncRun } from "./people-sync";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const T1 = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-19T14:00:00Z");

class NotionError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "NotionError";
  }
}

function deps(over: Partial<PeopleSyncDeps> = {}) {
  const applied: ApplyInput[] = [];
  const d: PeopleSyncDeps = {
    readStaff: async () => [{ id: T1, name: " Ryan Lee ", subjects: ["Math"], active: true }],
    readStudents: async () => [
      { id: S1, name: "Ada L.", stage: "Active" },
      { id: S2, name: "  ", stage: "Onboarding" },
      { id: "44444444-4444-4444-8444-444444444444", name: "Bo", stage: "Lost" },
    ],
    apply: async (input): Promise<SyncRun> => {
      applied.push(input);
      return { id: "r1", result: input.error ? "failed" : "ok", startedAt: input.startedAt, finishedAt: input.startedAt, error: input.error,
        staffUpserted: 1, staffArchived: 2, studentsUpserted: 3, studentsArchived: 4 };
    },
    now: () => NOW,
    ...over,
  };
  return { d, applied };
}

describe("runPeopleSync (REQ-38)", () => {
  it("builds the payload: student active from stage, names trimmed, empty names dropped (AC4)", async () => {
    const { d, applied } = deps();
    const out = await runPeopleSync(d, "owner");
    expect(out).toEqual({ result: "ok", counts: { staffUpserted: 1, staffArchived: 2, studentsUpserted: 3, studentsArchived: 4 } });
    expect(applied[0]).toEqual({
      trigger: "owner",
      startedAt: NOW.toISOString(),
      staff: [{ id: T1, name: "Ryan Lee", subjects: ["Math"], active: true }],
      students: [
        { id: S1, name: "Ada L.", stage: "Active", active: true },
        { id: "44444444-4444-4444-8444-444444444444", name: "Bo", stage: "Lost", active: false },
      ],
      error: null,
    });
  });

  it("a Staff or Students throw calls apply with an error and no payload (AC5, AC6)", async () => {
    for (const over of [
      { readStaff: async () => { throw new NotionError("Notion returned 503", 503); } },
      { readStudents: async () => { throw new NotionError("Notion request failed"); } },
    ] as Partial<PeopleSyncDeps>[]) {
      const { d, applied } = deps(over);
      expect((await runPeopleSync(d, "schedule")).result).toBe("failed");
      expect(applied[0]).toMatchObject({ trigger: "schedule", staff: null, students: null, error: "notion_unavailable" });
    }
  });

  it("the error text never holds a Notion payload", async () => {
    const { d, applied } = deps({ readStaff: async () => { throw new Error("Ada Lovelace, parent@example.com, 555-0100"); } });
    await runPeopleSync(d, "owner");
    expect(applied[0].error).toBe("notion_unexpected");
    expect(JSON.stringify(applied[0])).not.toMatch(/Ada|parent@|555/);
  });

  it("a throwing apply is a failed result with zero counts", async () => {
    const { d } = deps({ apply: async () => { throw new Error("db down"); } });
    expect(await runPeopleSync(d, "owner")).toEqual({ result: "failed", counts: { staffUpserted: 0, staffArchived: 0, studentsUpserted: 0, studentsArchived: 0 } });
  });

  it("classifies Notion errors", () => {
    expect(syncErrorReason(new NotionError("Notion returned 429", 429))).toBe("notion_unavailable");
    expect(syncErrorReason(new NotionError("Notion returned 500", 500))).toBe("notion_unavailable");
    expect(syncErrorReason(new NotionError("Notion request failed"))).toBe("notion_unavailable");
    expect(syncErrorReason(new NotionError("Notion returned 404", 404))).toBe("notion_unexpected");
    expect(syncErrorReason(new NotionError("Students database is missing a needed property"))).toBe("notion_unexpected");
    expect(syncErrorReason("nope")).toBe("notion_unexpected");
  });
});
