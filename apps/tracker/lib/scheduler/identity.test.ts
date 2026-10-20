import { describe, expect, it } from "vitest";
import { resolveSchedulerIdentity, type IdentityDeps } from "./identity";
import type { StaffRecord } from "../notion/staff";

const ORG = "10000000-0000-4000-8000-000000000001";
const T_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const O_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const staff = (id: string, over: Partial<StaffRecord> = {}): StaffRecord => ({
  id, name: "Mr. Ryan", email: "r@example.com", functions: ["Teacher"], status: "Active", subjects: ["MHF4U"], ...over,
});

function deps(over: Partial<IdentityDeps> = {}): IdentityDeps {
  return {
    configured: true,
    getUser: async () => ({ id: "u1", email: "r@example.com" }),
    claimLink: async () => {},
    isOwnerOf: async () => null,
    getLink: async () => ({ orgId: ORG, notionStaffId: T_ID }),
    getStaff: async (_org, id) => (id === T_ID ? staff(T_ID) : null),
    syncedAt: async () => "2026-10-19T12:00:00Z",
    ...over,
  };
}

describe("resolveSchedulerIdentity", () => {
  it("resolves a mapped teacher to their staff record (AC1)", async () => {
    const r = await resolveSchedulerIdentity(deps());
    expect(r).toEqual({ scope: "teacher", orgId: ORG, staff: staff(T_ID) });
  });
  it("claims the link before reading it (AC1)", async () => {
    const order: string[] = [];
    await resolveSchedulerIdentity(deps({
      claimLink: async () => { order.push("claim"); },
      getLink: async () => { order.push("get"); return null; },
    }));
    expect(order).toEqual(["claim", "get"]);
  });
  it("gives an unmapped user no scope (AC2)", async () => {
    expect(await resolveSchedulerIdentity(deps({ getLink: async () => null }))).toEqual({ scope: "none" });
  });
  it("gives no scope when the local staff row is inactive, archived or missing, though the link is live (AC3, REQ-38 AC13)", async () => {
    expect(await resolveSchedulerIdentity(deps({ getStaff: async () => staff(T_ID, { functions: ["Setter"] }) }))).toEqual({ scope: "none" });
    // An inactive or archived local row maps to status Inactive (lib/data/people.ts toStaffRecord).
    expect(await resolveSchedulerIdentity(deps({ getStaff: async () => staff(T_ID, { status: "Inactive", functions: [] }) }))).toEqual({ scope: "none" });
    expect(await resolveSchedulerIdentity(deps({ getStaff: async () => null }))).toEqual({ scope: "none" });
  });
  it("reads the staff row of the link's org and id (REQ-38)", async () => {
    const seen: string[] = [];
    await resolveSchedulerIdentity(deps({ getStaff: async (org, id) => { seen.push(`${org}:${id}`); return staff(T_ID); } }));
    expect(seen).toEqual([`${ORG}:${T_ID}`]);
  });
  it("gives a teacher unavailable when there has never been a good sync (REQ-38 AC13)", async () => {
    expect(await resolveSchedulerIdentity(deps({ syncedAt: async () => null }))).toEqual({ scope: "unavailable" });
  });
  it("gives the owner admin scope with their own staff record, or null (AC4)", async () => {
    const own = staff(O_ID, { name: "Mr. Charlie", functions: ["Owner", "Teacher"] });
    const withLink = await resolveSchedulerIdentity(deps({
      isOwnerOf: async () => ORG, getLink: async () => ({ orgId: ORG, notionStaffId: O_ID }), getStaff: async () => own,
    }));
    expect(withLink).toEqual({ scope: "admin", orgId: ORG, staff: own });
    const noLink = await resolveSchedulerIdentity(deps({ isOwnerOf: async () => ORG, getLink: async () => null }));
    expect(noLink).toEqual({ scope: "admin", orgId: ORG, staff: null });
  });
  it("reports signed out and not configured", async () => {
    expect(await resolveSchedulerIdentity(deps({ getUser: async () => null }))).toEqual({ scope: "signed_out" });
    expect(await resolveSchedulerIdentity(deps({ configured: false }))).toEqual({ scope: "unconfigured" });
  });
  it("fails closed when the local read throws (AC12, REQ-38 AC13)", async () => {
    const boom = async () => { throw new Error("db down"); };
    expect(await resolveSchedulerIdentity(deps({ getStaff: boom }))).toEqual({ scope: "unavailable" });
    expect(await resolveSchedulerIdentity(deps({ syncedAt: boom }))).toEqual({ scope: "unavailable" });
  });
  it("keeps an owner whose linked staff row is inactive as admin with staff null (REQ-38 AC13)", async () => {
    const r = await resolveSchedulerIdentity(deps({
      isOwnerOf: async () => ORG,
      getLink: async () => ({ orgId: ORG, notionStaffId: O_ID }),
      getStaff: async () => null,
      syncedAt: async () => null,
    }));
    expect(r).toEqual({ scope: "admin", orgId: ORG, staff: null });
  });
  it("keeps admin scope with staff null when Notion fails for the owner (AC12)", async () => {
    const r = await resolveSchedulerIdentity(deps({
      isOwnerOf: async () => ORG,
      getLink: async () => ({ orgId: ORG, notionStaffId: O_ID }),
      getStaff: async () => { throw new Error("db down"); },
    }));
    expect(r).toEqual({ scope: "admin", orgId: ORG, staff: null });
  });
  it("does not read staff for a user with no link", async () => {
    let called = false;
    await resolveSchedulerIdentity(deps({ getLink: async () => null, getStaff: async () => { called = true; return null; } }));
    expect(called).toBe(false);
  });
});
