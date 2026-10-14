import { describe, expect, it } from "vitest";
import { assertStaffAccess, requireScheduler, toAdminStaff, toTeacherStaff, type SchedulerIdentity } from "./guard";
import type { StaffRecord } from "../notion/staff";

const ORG = "10000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const rec: StaffRecord = { id: A, name: "Mr. Ryan", email: "r@example.com", functions: ["Teacher"], status: "Active", subjects: ["MHF4U"] };

const teacher: SchedulerIdentity = { scope: "teacher", orgId: ORG, staff: rec };
const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };

describe("requireScheduler", () => {
  it("lets an allowed scope through", () => {
    expect(requireScheduler(admin, ["admin"])).toEqual({ ok: true, identity: admin });
    expect(requireScheduler(teacher, ["admin", "teacher"])).toEqual({ ok: true, identity: teacher });
  });
  it("401 for signed out", () => {
    expect(requireScheduler({ scope: "signed_out" }, ["admin"])).toMatchObject({ ok: false, status: 401 });
  });
  it("403 for none and for a teacher on an admin-only route (AC5, AC6)", () => {
    expect(requireScheduler({ scope: "none" }, ["admin", "teacher"])).toMatchObject({ ok: false, status: 403 });
    expect(requireScheduler(teacher, ["admin"])).toMatchObject({ ok: false, status: 403 });
  });
  it("503 when not configured or unavailable (AC10, AC12)", () => {
    expect(requireScheduler({ scope: "unconfigured" }, ["admin"])).toMatchObject({ ok: false, status: 503, body: { error: "scheduler_not_configured" } });
    expect(requireScheduler({ scope: "unavailable" }, ["admin"])).toMatchObject({ ok: false, status: 503, body: { error: "scheduler_unavailable" } });
  });
});

describe("assertStaffAccess", () => {
  it("admin may read any ID", () => {
    expect(assertStaffAccess(admin, B)).toEqual({ ok: true });
  });
  it("teacher may read their own ID only", () => {
    expect(assertStaffAccess(teacher, A)).toEqual({ ok: true });
    expect(assertStaffAccess(teacher, B)).toMatchObject({ ok: false, status: 403 });
  });
});

describe("serialisers", () => {
  it("teacher shape has no email; admin shape adds it", () => {
    const loaded = { ...rec, hourlyRate: 60, phone: "555" } as StaffRecord;
    expect(toTeacherStaff(loaded)).toEqual({ id: A, name: "Mr. Ryan", subjects: ["MHF4U"] });
    expect(toAdminStaff(loaded)).toEqual({ id: A, name: "Mr. Ryan", subjects: ["MHF4U"], email: "r@example.com" });
  });
});
