import { describe, expect, it } from "vitest";
import type { LeadRow, TrialLessonRow } from "./contracts";
import { trialFunnel, windowOf, type FunnelCount } from "./trial-funnel";

// REQ-59 AC1, AC2: fixtures T2a to T2l. Window 30 days ending 2026-10-22; now 2026-10-22T16:00Z.
const NOW = new Date("2026-10-22T16:00:00.000Z");
const WINDOW = windowOf(30, "2026-10-22");
const ID = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const lead = (n: number, extra: Partial<LeadRow> = {}): LeadRow => ({
  id: ID(n), pageUrl: `https://www.notion.so/lead${n}`, createdAt: null, name: `Lead ${n}`, stage: null, ownerStaffId: null, ownerName: null,
  nextAction: null, nextActionDue: null, nextActionDueDate: null, attempts: null, lastContact: null, source: null, lostReason: null,
  contactedAt: null, trialBookedAt: null, trialAttendedAt: null, closedAt: null, trialTime: null, trialTimeDate: null, trialTeacherId: null,
  trialTeacherName: null, level: null, hasMajorGaps: false, recommendedPlan: null, hasTrialSummary: false, parentName: null, inPeopleCopy: true, dedupeKey: null, grade: null, subjects: [], majorGaps: null, trialSummary: null, ...extra,
});
const lesson = (n: number, date: string, studentId: string | null): TrialLessonRow => ({
  id: `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, pageUrl: `https://www.notion.so/lesson${n}`, date, studentId, studentName: null,
  teacherId: null, teacherName: null, durationHours: 1, hasTopic: false, hasDiagnosis: false, diagnosis: null, preferredDays: [],
});
const run = (leads: LeadRow[], lessons: TrialLessonRow[] | null = [], paid: Map<string, string> | null = new Map()) =>
  trialFunnel({ window: WINDOW, now: NOW, leads, trialLessons: lessons, paidStudentIds: paid, unusable: { lessons: "Lessons unavailable", invoices: "Payment records unavailable" } });
const counts = (f: ReturnType<typeof run>) => (["booked", "delivered", "closed", "verified", "outcomeUnknown"] as const)
  .map((k) => (f[k].state === "ok" ? (f[k] as Extract<FunnelCount, { state: "ok" }>).count : "unverifiable"));

describe("windowOf", () => {
  it.each([[7, "2026-10-16"], [30, "2026-09-23"], [90, "2026-07-25"]] as const)("%i days ends today and starts %s", (days, from) => {
    expect(windowOf(days, "2026-10-22")).toEqual({ days, from, to: "2026-10-22" });
  });
});

describe("trialFunnel fixtures", () => {
  it("T2a booked only", () => expect(counts(run([lead(1, { trialBookedAt: "2026-10-01", trialTime: "2026-10-30T15:00:00Z" })]))).toEqual([1, 0, 0, 0, 0]));
  it("T2b attended by Lessons row only", () => expect(counts(run([lead(1)], [lesson(1, "2026-10-05", ID(1))]))).toEqual([0, 1, 0, 0, 0]));
  it("T2c attended by milestone only", () => expect(counts(run([lead(1, { trialAttendedAt: "2026-10-06" })]))).toEqual([0, 1, 0, 0, 0]));
  it("T2d milestone and lesson on the same student count once, labelled both", () => {
    const f = run([lead(1, { trialAttendedAt: "2026-10-06" })], [lesson(1, "2026-10-06", ID(1).replaceAll("-", ""))]);
    expect(counts(f)).toEqual([0, 1, 0, 0, 0]);
    expect(f.delivered.state === "ok" && f.delivered.rows[0].label).toBe("milestone and lesson");
  });
  it("T2e closed with only a Sent invoice is closed, not verified", () => expect(counts(run([lead(1, { closedAt: "2026-10-10" })]))).toEqual([0, 0, 1, 0, 0]));
  it("T2f closed with a Paid invoice from August is verified, linked to the invoice", () => {
    const f = run([lead(1, { closedAt: "2026-10-10" })], [], new Map([[ID(1).replaceAll("-", ""), "https://www.notion.so/inv1"]]));
    expect(counts(f)).toEqual([0, 0, 1, 1, 0]);
    expect(f.verified.state === "ok" && f.verified.rows[0]).toMatchObject({ label: "Paid invoice", href: "https://www.notion.so/inv1" });
  });
  it("T2g a passed Trial Time with nothing else is outcome unknown, never delivered", () => {
    expect(counts(run([lead(1, { trialTime: "2026-10-20T15:00:00Z" })]))).toEqual([0, 0, 0, 0, 1]);
  });
  it("T2h a lesson dated before Trial Booked At does not hide a rebooked trial", () => {
    const l = lead(1, { trialBookedAt: "2026-08-01", trialTime: "2026-10-20T15:00:00Z" });
    expect(counts(run([l], [lesson(1, "2026-07-20", ID(1))]))).toEqual([0, 0, 0, 0, 1]);
    expect(counts(run([l], [lesson(1, "2026-08-02", ID(1))]))).toEqual([0, 0, 0, 0, 0]);
  });
  it("T2i Stage Active with no milestones counts nowhere", () => expect(counts(run([lead(1, { stage: "Active" })]))).toEqual([0, 0, 0, 0, 0]));
  it("T2j an evening UTC instant lands on the Toronto date outside the window", () => {
    expect(counts(run([lead(1, { trialBookedAt: "2026-09-22", trialTime: "2026-09-23T03:30:00Z" })]))).toEqual([0, 0, 0, 0, 0]);
  });
  it("T2k lessons unreadable: delivered and outcome unknown are unverifiable, booked and closed stay", () => {
    const f = run([lead(1, { trialBookedAt: "2026-10-01" }), lead(2, { trialTime: "2026-10-20T15:00:00Z" })], null);
    expect(counts(f)).toEqual([1, "unverifiable", 0, 0, "unverifiable"]);
    expect(f.delivered).toEqual({ state: "unverifiable", reason: "Lessons unavailable" });
  });
  it("T2l paid ids unreadable: verified is unverifiable, closed stays", () => {
    expect(counts(run([lead(1, { closedAt: "2026-10-10" })], [], null))).toEqual([0, 0, 1, "unverifiable", 0]);
  });
});

describe("trialFunnel rules", () => {
  it("a closed lead with no booked or attended date counts as closed only", () => expect(counts(run([lead(1, { closedAt: "2026-10-12" })]))).toEqual([0, 0, 1, 0, 0]));
  it("a future Trial Time is in neither list", () => expect(counts(run([lead(1, { trialTime: "2026-10-23T15:00:00Z" })]))).toEqual([0, 0, 0, 0, 0]));
  it("a repeated lead id is counted once", () => {
    expect(counts(run([lead(1, { trialBookedAt: "2026-10-01" }), { ...lead(1, { trialBookedAt: "2026-10-01" }), id: ID(1).toUpperCase() }]))).toEqual([1, 0, 0, 0, 0]);
  });
  it("a lesson with no student is its own delivered entry, labelled", () => {
    const f = run([], [lesson(5, "2026-10-05", null)]);
    expect(f.delivered.state === "ok" && f.delivered.rows).toEqual([{ id: lesson(5, "", null).id, name: "Unknown student", date: "2026-10-05", href: "https://www.notion.so/lesson5", label: "no student linked" }]);
  });
  it("a lesson for a student not in the read uses the lesson's name and page", () => {
    const l = { ...lesson(6, "2026-10-05", ID(9)), studentName: "Sam S." };
    const f = run([], [l]);
    expect(f.delivered.state === "ok" && f.delivered.rows[0]).toMatchObject({ name: "Sam S.", href: "https://www.notion.so/lesson6", label: "lesson" });
  });
  it("rows sort by date descending, then id", () => {
    const f = run([lead(2, { trialBookedAt: "2026-10-01" }), lead(1, { trialBookedAt: "2026-10-01" }), lead(3, { trialBookedAt: "2026-10-05" })]);
    expect(f.booked.state === "ok" && f.booked.rows.map((r) => r.name)).toEqual(["Lead 3", "Lead 1", "Lead 2"]);
  });
});
