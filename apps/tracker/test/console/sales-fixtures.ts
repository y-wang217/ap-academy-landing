import type { LeadRow, TrialLessonRow } from "../../lib/console/contracts";

/**
 * The REQ-57 ranking fixtures (design, "Ranking fixtures"). Test data only.
 * Now is 2026-10-22T16:00:00Z, 12:00 Toronto.
 */
export const SALES_NOW = new Date("2026-10-22T16:00:00.000Z");

const id = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const LEAD_IDS = {
  A: id(1), B: id(2), C: id(3), D: id(4), E: id(5), F: id(6), G: id(7), H: id(8), I: id(9), J: id(10), K: id(11),
  U: id(12), L: id(13), M: id(14), N: id(15), O: id(16), P: id(17), Q: id(18), R: id(19), S: id(20), T: id(21),
  W: "00000000-0000-4000-8000-000000000001", X: "00000000-0000-4000-8000-000000000002",
} as const;
export type LeadKey = keyof typeof LEAD_IDS;

export function lead(key: LeadKey, over: Partial<LeadRow> = {}): LeadRow {
  const leadId = LEAD_IDS[key];
  return {
    id: leadId, pageUrl: `https://www.notion.so/${leadId.replaceAll("-", "")}`, createdAt: "2026-10-01T12:00:00.000Z", name: `Lead ${key}`,
    stage: "Working", ownerStaffId: null, ownerName: null, nextAction: "Call", nextActionDue: null, nextActionDueDate: null, attempts: null,
    lastContact: null, source: null, lostReason: null, contactedAt: null, trialBookedAt: null, trialAttendedAt: null, closedAt: null,
    trialTime: null, trialTimeDate: null, trialTeacherId: null, trialTeacherName: null, level: null, hasMajorGaps: false, recommendedPlan: null,
    hasTrialSummary: false, parentName: null, inPeopleCopy: false, dedupeKey: null, grade: null, subjects: [], majorGaps: null, trialSummary: null,
    ...over,
  };
}

export const TRIAL_F: TrialLessonRow = {
  id: "ffffffff-0000-4000-8000-000000000001", pageUrl: "https://www.notion.so/ffffffff000040008000000000000001", date: "2026-10-20",
  studentId: LEAD_IDS.F, studentName: "Lead F", teacherId: null, teacherName: null, durationHours: 1, hasTopic: false, hasDiagnosis: true,
  preferredDays: ["Tue"], diagnosis: "Needs factoring practice",
};

/** The fixture table: queued rows A to K, the duplicates U and A again, and the excluded L to T. */
export function fixtureLeads(): LeadRow[] {
  return [
    lead("A", { stage: "New", nextActionDue: "2026-10-22T15:00:00.000Z", createdAt: "2026-10-21T12:00:00.000Z" }),
    lead("B", { stage: "New", createdAt: "2026-10-20T12:00:00.000Z" }),
    lead("C", { nextActionDue: "2026-10-22T15:30:00.000Z", dedupeKey: "m-1", createdAt: "2026-10-05T12:00:00.000Z" }),
    lead("D", { nextAction: "Book trial", nextActionDue: "2026-10-22T14:00:00.000Z" }),
    lead("E", { stage: "Awaiting Close", nextAction: "Close call", nextActionDue: "2026-10-22T15:10:00.000Z" }),
    lead("F", { stage: "Trial Claimed", nextAction: "Close call" }),
    lead("G", { stage: "Onboarding", nextAction: "Assign teacher", nextActionDue: "2026-10-21" }),
    lead("H", { stage: "Trial Booked", nextAction: "Deliver trial", nextActionDue: "2026-10-22T15:45:00.000Z" }),
    lead("I", { nextAction: "Text", nextActionDue: "2026-10-24T14:00:00.000Z", lastContact: "2026-10-10" }),
    lead("J", { lastContact: "2026-10-15" }),
    lead("K", { stage: "Trial Claimed", nextAction: "Close call", nextActionDue: "2026-10-25T14:00:00.000Z" }),
    lead("U", { nextActionDue: "2026-10-22T15:30:00.000Z", dedupeKey: "m-1", createdAt: "2026-10-06T12:00:00.000Z" }),
    lead("A", { stage: "New", nextActionDue: "2026-10-22T15:00:00.000Z", createdAt: "2026-10-21T12:00:00.000Z" }),
    lead("L", { stage: "Lost", nextActionDue: "2026-10-22T10:00:00.000Z" }),
    lead("M", { lostReason: "Do not contact", nextActionDue: "2026-10-22T10:00:00.000Z" }),
    lead("N", { lostReason: "Duplicate", nextActionDue: "2026-10-22T10:00:00.000Z" }),
    lead("O", { stage: "Active", nextActionDue: "2026-10-22T10:00:00.000Z" }),
    lead("P", { stage: "Paused", nextActionDue: "2026-10-22T10:00:00.000Z" }),
    lead("Q", { stage: "Trial", nextActionDue: "2026-10-22T10:00:00.000Z" }),
    lead("R", { stage: "Churned", nextActionDue: "2026-10-22T10:00:00.000Z" }),
    lead("S", { nextAction: "None", nextActionDue: "2026-10-22T10:00:00.000Z" }),
    lead("T", { stage: null, nextActionDue: "2026-10-22T10:00:00.000Z", createdAt: "2026-10-23T12:00:00.000Z" }),
  ];
}
