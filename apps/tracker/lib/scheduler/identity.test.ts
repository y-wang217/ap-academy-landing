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
    fetchStaff: async () => [staff(T_ID)],
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
  it("gives no scope when the Staff record is a setter, inactive, or missing from Notion (AC3)", async () => {
    expect(await resolveSchedulerIdentity(deps({ fetchStaff: async () => [staff(T_ID, { functions: ["Setter"] })] }))).toEqual({ scope: "none" });
    expect(await resolveSchedulerIdentity(deps({ fetchStaff: async () => [staff(T_ID, { status: "Inactive" })] }))).toEqual({ scope: "none" });
    expect(await resolveSchedulerIdentity(deps({ fetchStaff: async () => [] }))).toEqual({ scope: "none" });
  });
  it("gives the owner admin scope with their own staff record, or null (AC4)", async () => {
    const own = staff(O_ID, { name: "Mr. Charlie", functions: ["Owner", "Teacher"] });
    const withLink = await resolveSchedulerIdentity(deps({
      isOwnerOf: async () => ORG, getLink: async () => ({ orgId: ORG, notionStaffId: O_ID }), fetchStaff: async () => [own],
    }));
    expect(withLink).toEqual({ scope: "admin", orgId: ORG, staff: own });
    const noLink = await resolveSchedulerIdentity(deps({ isOwnerOf: async () => ORG, getLink: async () => null }));
    expect(noLink).toEqual({ scope: "admin", orgId: ORG, staff: null });
  });
  it("reports signed out and not configured", async () => {
    expect(await resolveSchedulerIdentity(deps({ getUser: async () => null }))).toEqual({ scope: "signed_out" });
    expect(await resolveSchedulerIdentity(deps({ configured: false }))).toEqual({ scope: "unconfigured" });
  });
  it("fails closed when the Notion read throws (AC12)", async () => {
    const boom = async () => { throw new Error("notion down"); };
    expect(await resolveSchedulerIdentity(deps({ fetchStaff: boom }))).toEqual({ scope: "unavailable" });
  });
  it("keeps admin scope with staff null when Notion fails for the owner (AC12)", async () => {
    const r = await resolveSchedulerIdentity(deps({
      isOwnerOf: async () => ORG,
      getLink: async () => ({ orgId: ORG, notionStaffId: O_ID }),
      fetchStaff: async () => { throw new Error("notion down"); },
    }));
    expect(r).toEqual({ scope: "admin", orgId: ORG, staff: null });
  });
  it("does not call Notion for a user with no link", async () => {
    let called = false;
    await resolveSchedulerIdentity(deps({ getLink: async () => null, fetchStaff: async () => { called = true; return []; } }));
    expect(called).toBe(false);
  });
});
