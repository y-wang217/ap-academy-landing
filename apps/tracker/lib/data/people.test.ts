import { describe, expect, it } from "vitest";
import { isActiveTeachingStaff } from "../domain/staff";
import type { Db } from "./client";
import { createPeopleStore, toStaffRecord } from "./people";

const ORG = "10000000-0000-4000-8000-000000000001";
const T1 = "5a000000-0000-4000-8000-000000000001";
const T2 = "5a000000-0000-4000-8000-000000000002";
const S1 = "6a000000-0000-4000-8000-000000000001";
const S2 = "6a000000-0000-4000-8000-000000000002";
const S3 = "6a000000-0000-4000-8000-000000000003";

type Call = { table: string; filters: [string, ...unknown[]][] };

/** A Supabase-like client: from(table) answers with that table's rows, and records every filter call. */
function fakeTracker(tables: Record<string, unknown[] | { error: string }>, rpc: Record<string, { data: unknown; error: unknown }> = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const answer = tables[table];
    const result = Array.isArray(answer) ? { data: answer, error: null } : { data: null, error: answer ?? { message: "no table" } };
    const q: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) => resolve(result),
      maybeSingle: () => Promise.resolve({ data: Array.isArray(answer) ? (answer[0] ?? null) : null, error: result.error }),
    };
    for (const m of ["select", "eq", "is", "order", "limit", "in"]) q[m] = (...args: unknown[]) => { call.filters.push([m, ...args]); return q; };
    return q;
  };
  const tracker = { from, rpc: (fn: string) => Promise.resolve(rpc[fn] ?? { data: null, error: { message: "no rpc" } }) } as unknown as Db["tracker"];
  return { tracker, calls };
}

const staffRow = (id: string, name: string, active: boolean, archived: string | null = null) => ({
  notion_staff_id: id, name, subjects: ["Math"], active, archived_at: archived, synced_at: "x", org_id: ORG,
});
const studentRow = (id: string, name: string, active: boolean, archived: string | null = null) => ({
  notion_student_id: id, name, active, archived_at: archived, stage: "Active", org_id: ORG,
});

describe("people store (REQ-38)", () => {
  it("toStaffRecord round-trips through isActiveTeachingStaff; archived is never active (Decision 5)", () => {
    expect(isActiveTeachingStaff(toStaffRecord(staffRow(T1, "A", true), null))).toBe(true);
    expect(isActiveTeachingStaff(toStaffRecord(staffRow(T1, "A", false), null))).toBe(false);
    expect(isActiveTeachingStaff(toStaffRecord(staffRow(T1, "A", true, "2026-10-01T00:00:00Z"), null))).toBe(false);
    expect(toStaffRecord(staffRow(T1, "A", true), "a@example.com")).toEqual({
      id: T1, name: "A", email: "a@example.com", functions: ["Teacher"], status: "Active", subjects: ["Math"],
    });
  });

  it("listStaff takes email from live staff links only (AC16)", async () => {
    const { tracker, calls } = fakeTracker({
      staff: [staffRow(T2, "Zoe", true), staffRow(T1, "Ann", true)],
      staff_links: [{ notion_staff_id: T1, email: "ann@example.com" }],
    });
    const staff = await createPeopleStore(tracker, ORG).listStaff();
    expect(staff.map((s) => [s.name, s.email])).toEqual([["Ann", "ann@example.com"], ["Zoe", null]]);
    const links = calls.find((c) => c.table === "staff_links")!;
    expect(links.filters).toContainEqual(["is", "revoked_at", null]);
    expect(links.filters).toContainEqual(["eq", "org_id", ORG]);
  });

  it("studentNames includes archived rows; activeStudents excludes inactive and archived (AC14)", async () => {
    const { tracker } = fakeTracker({
      student_people: [studentRow(S1, "Ada", true), studentRow(S2, "Bo", false), studentRow(S3, "Cy", false, "2026-10-01T00:00:00Z")],
    });
    const store = createPeopleStore(tracker, ORG);
    expect([...(await store.studentNames())]).toEqual([[S1, "Ada"], [S2, "Bo"], [S3, "Cy"]]);
    expect(await store.activeStudents()).toEqual([{ id: S1, name: "Ada" }]);
  });

  it("getStaff returns null for a missing row and for a bad id", async () => {
    const { tracker } = fakeTracker({ staff: [], staff_links: [] });
    const store = createPeopleStore(tracker, ORG);
    expect(await store.getStaff(T1)).toBeNull();
    expect(await store.getStaff("nope")).toBeNull();
  });

  it("a query error throws instead of looking empty", async () => {
    const { tracker } = fakeTracker({ staff: { error: "boom" }, student_people: { error: "boom" }, staff_links: [] });
    const store = createPeopleStore(tracker, ORG);
    await expect(store.listStaff()).rejects.toThrow("unavailable");
    await expect(store.studentNames()).rejects.toThrow("unavailable");
    await expect(store.syncedAt()).rejects.toThrow("unavailable");
  });

  it("rows that fail the schema throw", async () => {
    const { tracker } = fakeTracker({ staff: [{ notion_staff_id: "x", name: 3 }], staff_links: [] });
    await expect(createPeopleStore(tracker, ORG).listStaff()).rejects.toThrow();
  });

  it("syncedAt reads people_synced_at", async () => {
    const { tracker } = fakeTracker({}, { people_synced_at: { data: "2026-10-19T12:00:00+00:00", error: null } });
    expect(await createPeopleStore(tracker, ORG).syncedAt()).toBe("2026-10-19T12:00:00+00:00");
    const never = fakeTracker({}, { people_synced_at: { data: null, error: null } });
    expect(await createPeopleStore(never.tracker, ORG).syncedAt()).toBeNull();
  });
});
