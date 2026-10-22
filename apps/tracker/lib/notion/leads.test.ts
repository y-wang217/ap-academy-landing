import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { filterIds, notionFake, onlyReads, v } from "./console-reader.fake";
import { fetchLeads, LEAD_PROPS } from "./leads";

// REQ-54 AC1, AC5, AC6, AC7: the Students & Parents lead read.
const DS = "fe3d651a-70c6-4d1e-8a38-656163d6bc63";
const cfg = { token: "t", dataSourceId: DS };
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const S2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccc0001";
const TEACHER = "cccccccc-cccc-4ccc-8ccc-cccccccc0002";

const DESIGN_PROPS = [
  "Student Name", "Stage", "Owner", "Next Action", "Next Action Due", "Attempts", "Last Contact", "Source", "Lost Reason",
  "Contacted At", "Trial Booked At", "Trial Attended At", "Closed At", "Trial Time", "Trial Teacher", "Level", "Major Gaps",
  "Recommended Plan", "Trial Summary", "Parent Name",
];
// The live schema has more than the reader asks for; the extra ones must never be requested.
const SCHEMA: Record<string, string> = {
  ...Object.fromEntries(DESIGN_PROPS.map((n, i) => [n, `p${i}`])),
  "Parent Phone": "ph", "Parent Email": "em", "Lead ID": "li", Notes: "no", "Sales Notes": "sn", "Hourly Rate (CAD)": "hr", "Billing Family": "bf", "Weekly Schedule": "ws",
};

const page = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  object: "page",
  id,
  created_time: "2026-10-20T14:00:00.000Z",
  properties: {
    "Student Name": v.title(name),
    Stage: v.select("New"),
    Owner: v.rel(OWNER),
    "Next Action": v.select("Call"),
    "Next Action Due": v.date("2026-11-01T04:30:00.000Z"),
    Attempts: v.num(2),
    "Last Contact": v.date("2026-10-19"),
    Source: v.select("Meta form"),
    "Lost Reason": v.select(null),
    "Contacted At": v.date("2026-10-18"),
    "Trial Booked At": v.date(null),
    "Trial Attended At": v.date(null),
    "Closed At": v.date(null),
    "Trial Time": v.date("2026-10-25T21:00:00.000Z"),
    "Trial Teacher": v.rel(TEACHER),
    Level: v.select("Solid (80 to 89)"),
    "Major Gaps": v.text("fractions and factoring"),
    "Recommended Plan": v.select("1-on-1 1x/wk"),
    "Trial Summary": v.text(""),
    "Parent Name": v.text("Pat Lee"),
    "Parent Phone": v.phone("555-0100"),
    "Parent Email": v.email("pat@example.com"),
    "Lead ID": v.text("L-77"),
    Notes: v.text("private notes"),
    ...extra,
  },
});

const LEAD_SOURCE_KEYS = [
  "attempts", "closedAt", "contactedAt", "createdAt", "hasMajorGaps", "hasTrialSummary", "id", "lastContact", "level", "lostReason", "name",
  "nextAction", "nextActionDue", "ownerStaffId", "parentName", "recommendedPlan", "source", "stage", "trialAttendedAt", "trialBookedAt",
  "trialTeacherId", "trialTime",
];

describe("fetchLeads", () => {
  it("LEAD_PROPS is exactly the design list", () => {
    expect([...LEAD_PROPS]).toEqual(DESIGN_PROPS);
  });

  it("asks for exactly the listed property ids, every stage, newest first", async () => {
    const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages: [[page(S1, "Sam Lee")]] });
    await fetchLeads(cfg, { fetcher: f.fetcher, maxPages: 10 });
    const q = f.calls[1];
    expect(filterIds(q)).toEqual(DESIGN_PROPS.map((_, i) => `p${i}`));
    expect(q.body).toEqual({ page_size: 100, sorts: [{ timestamp: "created_time", direction: "descending" }] });
  });

  it("a row carries exactly the lead fields, free text as presence, and none of the private ones", async () => {
    const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages: [[page(S1, " Sam Lee ")]] });
    const r = await fetchLeads(cfg, { fetcher: f.fetcher, maxPages: 10 });
    expect(r.complete).toBe(true);
    expect(r.skipped).toBe(0);
    const row = r.rows[0];
    expect(Object.keys(row).sort()).toEqual(LEAD_SOURCE_KEYS);
    expect(row).toMatchObject({
      id: S1, name: "Sam Lee", stage: "New", ownerStaffId: OWNER, trialTeacherId: TEACHER, attempts: 2,
      nextActionDue: "2026-11-01T04:30:00.000Z", lastContact: "2026-10-19", lostReason: null, hasMajorGaps: true, hasTrialSummary: false,
      parentName: "Pat Lee", createdAt: "2026-10-20T14:00:00.000Z",
    });
    expect(JSON.stringify(r)).not.toMatch(/555-0100|pat@example|L-77|private notes|fractions/);
  });

  it("two pages with the same Student Name stay two rows", async () => {
    const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages: [[page(S1, "Sam Lee"), page(S2, "Sam Lee")]] });
    expect((await fetchLeads(cfg, { fetcher: f.fetcher, maxPages: 10 })).rows.map((r) => r.id)).toEqual([S1, S2]);
  });

  it("a malformed row is skipped and counted", async () => {
    const bad = { object: "page", id: "not-a-guid", properties: {} };
    const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages: [[page(S1, "Sam Lee"), bad]] });
    const r = await fetchLeads(cfg, { fetcher: f.fetcher, maxPages: 10 });
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });

  it("full, paginated and truncated reads make only schema GETs and data source queries", async () => {
    for (const [pages, maxPages, complete] of [[[[page(S1, "A")]], 10, true], [[[page(S1, "A")], [page(S2, "B")]], 10, true], [[[page(S1, "A")], [page(S2, "B")]], 1, false]] as const) {
      const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages: pages as unknown[][] });
      const r = await fetchLeads(cfg, { fetcher: f.fetcher, maxPages });
      expect(r.complete).toBe(complete);
      expect(onlyReads(f.calls, DS)).toBe(true);
    }
  });

  it("a missing property fails the read, naming it", async () => {
    const { Stage: _s, ...rest } = SCHEMA;
    const f = notionFake({ dataSourceId: DS, schema: rest, pages: [] });
    await expect(fetchLeads(cfg, { fetcher: f.fetcher, maxPages: 10 })).rejects.toThrow("Leads is missing Stage");
  });

  it("leads.ts never names the private Students & Parents properties", () => {
    const src = readFileSync(join(__dirname, "leads.ts"), "utf8");
    for (const name of ["Parent Phone", "Parent Email", "Lead ID", "Notes", "Sales Notes", "Hourly Rate (CAD)", "Billing Family"]) {
      expect(src).not.toContain(`"${name}"`);
    }
  });
});
