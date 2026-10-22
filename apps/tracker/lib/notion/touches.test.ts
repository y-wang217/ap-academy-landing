import { describe, expect, it } from "vitest";
import { filterIds, notionFake, onlyReads, v } from "./console-reader.fake";
import { fetchRecentTouches, lastTouchesByStudent, TOUCH_PROPS } from "./touches";

// REQ-54 AC1, AC5, AC6, AC7: the Touches read.
const DS = "772939bd-bd88-4272-9f1f-20ce75ef2204";
const cfg = { token: "t", dataSourceId: DS };
const SCHEMA = { Touch: "title", Type: "ty", Outcome: "ou", Student: "st", Staff: "sf", Note: "no", When: "wh" };
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const S2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002";
const STAFF = "cccccccc-cccc-4ccc-8ccc-cccccccc0001";
const tid = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;

const touch = (n: number, student: string, when: string, note = "Called, left a message") => ({
  object: "page",
  id: tid(n),
  properties: {
    Touch: v.title("Call"),
    Type: v.select("Call"),
    Outcome: v.select("No answer"),
    Student: v.rel(student),
    Staff: v.rel(STAFF),
    Note: v.text(note),
    When: v.created(when),
  },
});

describe("fetchRecentTouches", () => {
  it("TOUCH_PROPS is exactly the design list, and only those ids are asked for", async () => {
    expect([...TOUCH_PROPS]).toEqual(["Type", "Outcome", "Student", "Staff", "Note", "When"]);
    const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages: [[]] });
    await fetchRecentTouches(cfg, { since: "2026-07-24", fetcher: f.fetcher, maxPages: 10 });
    expect(filterIds(f.calls[1])).toEqual(["ty", "ou", "st", "sf", "no", "wh"]);
  });

  it("filters on created time since the window start and sorts newest first", async () => {
    const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages: [[]] });
    await fetchRecentTouches(cfg, { since: "2026-07-24", fetcher: f.fetcher, maxPages: 10 });
    expect(f.calls[1].body).toEqual({
      page_size: 100,
      filter: { timestamp: "created_time", created_time: { on_or_after: "2026-07-24" } },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
    });
  });

  it("parses a touch, cuts the note to 280 characters and drops the title", async () => {
    const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages: [[touch(1, S1, "2026-10-20T10:00:00.000Z", "x".repeat(400))]] });
    const r = await fetchRecentTouches(cfg, { since: "2026-07-24", fetcher: f.fetcher, maxPages: 10 });
    expect(r.rows).toEqual([{ id: tid(1), when: "2026-10-20T10:00:00.000Z", type: "Call", outcome: "No answer", studentId: S1, staffId: STAFF, note: "x".repeat(280) }]);
  });

  it("full, paginated and truncated reads make only schema GETs and data source queries", async () => {
    for (const [pages, maxPages, complete] of [[[[touch(1, S1, "2026-10-20T10:00:00Z")]], 10, true], [[[touch(1, S1, "2026-10-20T10:00:00Z")], [touch(2, S1, "2026-10-19T10:00:00Z")]], 10, true], [[[touch(1, S1, "2026-10-20T10:00:00Z")], [touch(2, S1, "2026-10-19T10:00:00Z")]], 1, false]] as const) {
      const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages });
      const r = await fetchRecentTouches(cfg, { since: "2026-07-24", fetcher: f.fetcher, maxPages });
      expect(r.complete).toBe(complete);
      expect(onlyReads(f.calls, DS)).toBe(true);
    }
  });
});

describe("lastTouchesByStudent", () => {
  const row = (n: number, studentId: string | null, when: string) => ({ id: tid(n), when, type: "Call", outcome: null, studentId, staffId: null, note: "" });

  it("keeps the newest n per student, grouped by page id whatever the dashes or case", () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => row(i, i % 2 ? S1 : S1.replaceAll("-", "").toUpperCase(), `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`)),
      row(20, S2, "2026-10-01T00:00:00Z"),
      row(21, null, "2026-10-21T00:00:00Z"),
    ];
    const out = lastTouchesByStudent(rows, 5);
    expect(out.filter((t) => t.studentId && t.studentId.replaceAll("-", "").toLowerCase() === S1.replaceAll("-", "")).map((t) => t.id)).toEqual([6, 5, 4, 3, 2].map(tid));
    expect(out.filter((t) => t.studentId === S2).map((t) => t.id)).toEqual([tid(20)]);
    expect(out.some((t) => t.studentId === null)).toBe(false);
  });
});
