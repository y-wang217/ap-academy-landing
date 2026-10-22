import { describe, expect, it } from "vitest";
import { handleMonthlyBillingInput } from "../../../lib/scheduler/billing-handlers";
import { handleDailyTaskCreate, handleDailyTaskStatus } from "../../../lib/scheduler/daily-task-handlers";
import { handleMe, handleStaffById, handleStaffList } from "../../../lib/scheduler/handlers";
import { resolveSchedulerIdentity } from "../../../lib/scheduler/identity";
import { handleDriftSeen, handleImportPreview, handleImportRun, handleMonthlyReview, handleSyncSummaries } from "../../../lib/scheduler/import-handlers";
import {
  handleAvailability, handleCancelOccurrence, handleConflicts, handleCreateAvailabilityException, handleCreateClass, handleCreateWindow,
  handleDeleteAvailabilityException, handleDeleteWindow, handleEditOccurrence, handleOccurrences, handlePatchWindow, handleStudentCancellations,
  handleWeek, loadWeek, type ScheduleDeps,
} from "../../../lib/scheduler/schedule-handlers";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import { admin, fixture, KUBY, REQ, RYAN, S1, S2, staff, teacher } from "./booking-world.fake";

// REQ-32 AC12: the server checks behind the Notion-backed columns of
// docs/permission-matrix.md, and the scheduler routes beside them. Each row
// names the scopes that get past the guard; every other scope gets 403.
// Matrix roles map to scopes as resolveSchedulerIdentity does: owner (with or
// without a staff link) is admin; a live staff link is teacher; a grade
// teacher, student or parent with no link is none.
type Scope = "admin" | "teacher" | "none";
type Row = { route: string; column: string; allowed: Scope[]; call: (d: ScheduleDeps) => Promise<Response> };

const q = (s = "") => new URLSearchParams(s);
const ROWS: Row[] = [
  { route: "GET /me", column: "staff list", allowed: ["admin", "teacher"], call: (d) => handleMe(d) },
  { route: "GET /staff", column: "staff list", allowed: ["admin"], call: (d) => handleStaffList(d) },
  { route: "GET /staff/[own id]", column: "staff list", allowed: ["admin", "teacher"], call: (d) => handleStaffById(d, RYAN) },
  { route: "GET /week", column: "student names", allowed: ["admin", "teacher"], call: (d) => handleWeek(d, q()) },
  { route: "GET /import", column: "Weekly Schedule text", allowed: ["admin"], call: (d) => handleImportPreview(d) },
  { route: "POST /import", column: "Weekly Schedule text", allowed: ["admin"], call: (d) => handleImportRun(d, {}) },
  { route: "POST /summaries/sync", column: "Weekly Schedule text", allowed: ["admin"], call: (d) => handleSyncSummaries(d, {}) },
  { route: "POST /summaries/drift-seen", column: "Weekly Schedule text", allowed: ["admin"], call: (d) => handleDriftSeen(d, {}) },
  { route: "GET /monthly-review", column: "Weekly Schedule text", allowed: ["admin"], call: (d) => handleMonthlyReview(d, q()) },
  { route: "GET /monthly-billing-input", column: "billing input", allowed: ["admin"], call: (d) => handleMonthlyBillingInput(d, q("month=2026-10")) },
  { route: "GET /daily-task", column: "daily task", allowed: ["admin"], call: (d) => handleDailyTaskStatus(d, q()) },
  { route: "POST /daily-task", column: "daily task", allowed: ["admin"], call: (d) => handleDailyTaskCreate(d, {}) },
  { route: "GET /availability", column: "availability", allowed: ["admin", "teacher"], call: (d) => handleAvailability(d, q()) },
  { route: "POST /availability/windows", column: "availability", allowed: ["admin", "teacher"], call: (d) => handleCreateWindow(d, {}) },
  { route: "PATCH /availability/windows/[id]", column: "availability", allowed: ["admin", "teacher"], call: (d) => handlePatchWindow(d, REQ(1), {}) },
  { route: "DELETE /availability/windows/[id]", column: "availability", allowed: ["admin", "teacher"], call: (d) => handleDeleteWindow(d, REQ(1)) },
  { route: "POST /availability/exceptions", column: "availability", allowed: ["admin", "teacher"], call: (d) => handleCreateAvailabilityException(d, {}) },
  { route: "DELETE /availability/exceptions/[id]", column: "availability", allowed: ["admin", "teacher"], call: (d) => handleDeleteAvailabilityException(d, REQ(1)) },
  { route: "GET /conflicts", column: "classes", allowed: ["admin", "teacher"], call: (d) => handleConflicts(d, q()) },
  { route: "GET /classes/occurrences", column: "classes", allowed: ["admin", "teacher"], call: (d) => handleOccurrences(d, q()) },
  { route: "GET /classes/cancellations", column: "classes", allowed: ["admin"], call: (d) => handleStudentCancellations(d, q()) },
  { route: "POST /classes", column: "classes", allowed: ["admin"], call: (d) => handleCreateClass(d, {}) },
  { route: "PATCH /classes/[id]/occurrences/[date]", column: "classes", allowed: ["admin"], call: (d) => handleEditOccurrence(d, REQ(1), "2026-10-19", {}) },
  { route: "DELETE /classes/[id]/occurrences/[date]", column: "classes", allowed: ["admin"], call: (d) => handleCancelOccurrence(d, REQ(1), "2026-10-19", {}) },
];

const IDENTITY: Record<Scope, SchedulerIdentity> = { admin, teacher, none: { scope: "none" } };

describe("scheduler routes by scope (REQ-32 AC12)", () => {
  for (const row of ROWS) {
    for (const scope of ["admin", "teacher", "none"] as const) {
      const allowed = row.allowed.includes(scope);
      it(`${row.route} (${row.column}): ${scope} is ${allowed ? "let through" : "refused"}`, async () => {
        const w = await fixture();
        w.begin();
        const r = await row.call(w.deps(IDENTITY[scope]));
        if (allowed) {
          expect([401, 403]).not.toContain(r.status);
        } else {
          expect(r.status).toBe(403);
          // Refused before any read: the guard runs first.
          expect(w.calls).toEqual([]);
        }
      });
    }
  }
});

describe("matrix roles resolve to scheduler scopes (REQ-32 AC12)", () => {
  const ORG = admin.scope === "admin" ? admin.orgId : "";
  const base = {
    configured: true,
    getUser: async () => ({ id: "u", email: "u@example.com" }),
    claimLink: async () => {},
    getStaff: async (_org: string, id: string) => staff.find((s) => s.id === id) ?? null,
    syncedAt: async () => "2026-10-19T12:00:00Z",
  };
  const link = { orgId: ORG, notionStaffId: RYAN };
  it.each([
    ["owner", ORG, null, "admin"],
    ["owner + staff link", ORG, link, "admin"],
    ["grade teacher (membership, no link)", null, null, "none"],
    ["scheduling-only teacher", null, link, "teacher"],
    ["grade teacher + staff link", null, link, "teacher"],
    ["staff link + parent link", null, link, "teacher"],
    ["student", null, null, "none"],
    ["parent", null, null, "none"],
    ["grade teacher + parent link", null, null, "none"],
  ] as const)("%s resolves to %s", async (_role, ownerOrg, live, scope) => {
    const id = await resolveSchedulerIdentity({ ...base, isOwnerOf: async () => ownerOrg, getLink: async () => live });
    expect(id.scope).toBe(scope);
  });
});

describe("a teacher's week carries only their own students' names (REQ-32 AC12)", () => {
  it("names the map holds for other teachers' students never reach the teacher", async () => {
    const w = await fixture();
    const names = new Map([[S1, "Ana R."], [S2, "Ben K."], ["99999999-9999-4999-8999-999999999999", "Cy L."]]);
    const d: ScheduleDeps = { ...w.deps(teacher), studentNames: async () => names };
    const r = await loadWeek(d, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = JSON.stringify(r.body);
    expect(text).toContain("Ana R.");
    expect(text).not.toContain("Ben K.");
    expect(text).not.toContain("Cy L.");
    expect(text).not.toContain(KUBY);
    expect(text).not.toContain(S2);
  });
  it("the owner's all-teachers week names both", async () => {
    const w = await fixture();
    const names = new Map([[S1, "Ana R."], [S2, "Ben K."]]);
    const r = await loadWeek({ ...w.deps(admin), studentNames: async () => names }, { view: "all" });
    expect(r.ok && JSON.stringify(r.body)).toMatch(/Ana R\..*Ben K\.|Ben K\..*Ana R\./);
  });
});
