import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  healthOf, HEALTH_PROVIDER_KEYS, InvoiceRow, LeadRow, notionPageUrl, PANEL_STATUSES, TouchGroup, TouchRow, TrialLessonRow, WorkRow,
  type PanelResult,
} from "./contracts";

// REQ-54 AC2, AC9: strip-mode row schemas with exactly the design's keys, and the health shape.
const DESIGN_KEYS: [string, z.ZodObject, string[]][] = [
  ["LeadRow", LeadRow, ["id", "pageUrl", "createdAt", "name", "stage", "ownerStaffId", "ownerName", "nextAction", "nextActionDue", "nextActionDueDate", "attempts", "lastContact", "source", "lostReason", "contactedAt", "trialBookedAt", "trialAttendedAt", "closedAt", "trialTime", "trialTimeDate", "trialTeacherId", "trialTeacherName", "level", "hasMajorGaps", "recommendedPlan", "hasTrialSummary", "parentName", "inPeopleCopy"]],
  ["TouchRow", TouchRow, ["id", "pageUrl", "when", "whenDate", "type", "outcome", "studentId", "staffId", "staffName", "note"]],
  ["TouchGroup", TouchGroup, ["studentId", "studentName", "touches"]],
  ["TrialLessonRow", TrialLessonRow, ["id", "pageUrl", "date", "studentId", "studentName", "teacherId", "teacherName", "durationHours", "hasTopic", "hasDiagnosis", "preferredDays"]],
  ["WorkRow", WorkRow, ["id", "pageUrl", "name", "area", "state", "type", "dueReview", "dueReviewDate", "owner", "taskTypes", "parentProjectIds", "expectedResult"]],
  ["InvoiceRow", InvoiceRow, ["id", "pageUrl", "status", "paidOn", "amount", "creditApplied", "issued", "due", "month", "studentIds", "studentName"]],
];

describe("row schemas", () => {
  it.each(DESIGN_KEYS)("%s has exactly the design's keys and is strip mode", (_name, schema, keys) => {
    expect(Object.keys(schema.shape).sort()).toEqual([...keys].sort());
    // Zod 4 records the unknown-key mode on the def: undefined is the default strip.
    expect((schema.def as { catchall?: unknown }).catchall).toBeUndefined();
  });

  it("a row with extra keys is kept and leaves without them", () => {
    const work = { id: "a", pageUrl: "https://www.notion.so/a", name: "N", area: null, state: "Next", type: null, dueReview: null, dueReviewDate: null, owner: null, taskTypes: [{ id: "t", name: null }], parentProjectIds: [], expectedResult: null };
    const parsed = WorkRow.parse({ ...work, parentPhone: "555-0100", leadId: "L-1", notes: "private" });
    expect(parsed).toEqual(work);
  });

  it("REQ-60: a WorkRow's Expected result is at most 500 characters", () => {
    const work = { id: "a", pageUrl: "u", name: "N", area: null, state: null, type: null, dueReview: null, dueReviewDate: null, owner: null, taskTypes: [], parentProjectIds: [] };
    expect(WorkRow.safeParse({ ...work, expectedResult: "x".repeat(500) }).success).toBe(true);
    expect(WorkRow.safeParse({ ...work, expectedResult: "x".repeat(501) }).success).toBe(false);
  });
});

describe("contract helpers", () => {
  it("the status vocabulary is the spec's six", () => {
    expect([...PANEL_STATUSES]).toEqual(["ready", "empty", "loading", "stale", "error", "unverifiable"]);
  });

  it("a Notion page url drops the dashes", () => {
    expect(notionPageUrl("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001")).toBe("https://www.notion.so/aaaaaaaaaaaa4aaa8aaaaaaaaaaa0001");
  });

  it("healthOf keeps exactly status, times and reasons", () => {
    const r: PanelResult<unknown[]> = {
      panel: "leads", status: "ready", data: [{ name: "Sam Lee" }], count: 1, lastCheckedAt: "t2", lastSuccessfulFetchAt: "t2", staleReason: null, errorMessage: null,
      sourceEvidence: [{ source: "notion", sourceId: "x", sourceUrl: null, observedAt: "t2" }],
    };
    const h = healthOf(r);
    expect(Object.keys(h).sort()).toEqual([...HEALTH_PROVIDER_KEYS].sort());
    expect(Object.keys(h).sort()).toEqual(["errorMessage", "lastCheckedAt", "lastSuccessfulFetchAt", "staleReason", "status"]);
    expect(JSON.stringify(h)).not.toContain("Sam");
  });
});
