import { describe, expect, it } from "vitest";
import type { StaffRecord } from "../notion/staff";
import type { Db } from "./client";
import { loadSetupInput, type SetupReaders } from "./setup";

const ORG = "10000000-0000-0000-0000-00000000aaaa";
const RYAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const KUBY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002";
const GONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003";
const S1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
const S2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002";
const S3 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0003";
const ADA = "20000000-0000-0000-0000-000000000001";
const CY = "20000000-0000-0000-0000-000000000002";
const USER = "00000000-0000-0000-0000-0000000000a1";
const SECRET = "very-secret-cron-value";

const staff = (id: string, name: string, status = "Active"): StaffRecord =>
  ({ id, name, email: null, status, functions: ["Teacher"], subjects: [] });

type Result = { data: unknown; error: unknown };
type Tables = Partial<Record<string, Result>>;
const good: Tables = {
  staff_links: { data: [{ notion_staff_id: RYAN, user_id: USER }], error: null },
  availability_windows: { data: [{ notion_staff_id: RYAN }, { notion_staff_id: GONE }], error: null },
  schedule_summaries: { data: [{ notion_student_id: S2, sync_state: "synced" }, { notion_student_id: S3, sync_state: "failed" }], error: null },
  students: { data: [
    { id: ADA, first_name: "Ada", last_initial: "P", notion_student_id: S1 },
    { id: CY, first_name: "Cy", last_initial: "R", notion_student_id: null },
  ], error: null },
  parent_links: { data: [{ student_id: ADA, claimed_at: "2026-10-16T10:00:00Z" }, { student_id: CY, claimed_at: null }], error: null },
  daily_tasks: { data: [{ local_date: "2026-10-16", state: "ready" }], error: null },
  rpc: { data: [{ check_name: "notion_link_guard", ok: true }], error: null },
};

/** Records every call. Any write method on the chain is recorded too, so the "reads only" check can see it. */
function fakeDb(tables: Tables) {
  const calls: string[] = [];
  const from = (table: string) => {
    calls.push(`from:${table}`);
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "is", "in", "or", "gte", "insert", "update", "upsert", "delete"]) {
      chain[m] = (...args: unknown[]) => { calls.push(`${table}.${m}(${JSON.stringify(args)})`); return chain; };
    }
    chain.then = (resolve: (r: Result) => unknown) => resolve(tables[table] ?? { data: [], error: null });
    return chain;
  };
  const rpc = async (name: string, args: unknown) => { calls.push(`rpc:${name}(${JSON.stringify(args)})`); return tables.rpc ?? { data: [], error: null }; };
  return { db: { tracker: { from, rpc } } as unknown as Db, calls };
}
const readers = (over: Partial<SetupReaders> = {}): SetupReaders => ({
  staff: async () => [staff(RYAN, "Ryan Test"), staff(KUBY, "Kuby Test"), staff(GONE, "Old Teacher", "Inactive")],
  scheduledStudents: async () => [[S1, "Sam"], [S2, "Kim"]],
  ...over,
});
const env = { workConfigured: true, cronSecretSet: true, orgIdEnv: ORG };

describe("loadSetupInput", () => {
  it("builds every row from the reads", async () => {
    const { db } = fakeDb(good);
    const input = await loadSetupInput(db, ORG, "2026-10-16", readers(), env);
    expect(input.teachers).toEqual({ linked: 1, total: 2, signedIn: 1, missing: ["Kuby Test"] });
    // GONE has a window but no live link, so only Ryan counts.
    expect(input.availability).toEqual({ entered: 1, linked: 1 });
    // Scheduled [S1, S2] with summaries for [S2, S3]: 1 of 2, and S3's failure is not one of these.
    expect(input.schedules).toEqual({ adopted: 1, scheduled: 2, failedSync: 0 });
    expect(input.parents).toEqual({ students: 2, claimed: 1, invitedOnly: 1, anyLink: true, missing: [{ id: CY, name: "Cy R." }] });
    expect(input.notionRecords).toEqual({ students: 2, linked: 1, missing: [{ id: CY, name: "Cy R." }] });
    expect(input.dailyTask).toEqual({ missingConfig: [], readyDates: ["2026-10-16"] });
    expect(input.guard).toEqual({ ok: true });
  });
  it("a failed sync among the scheduled students is counted", async () => {
    const { db } = fakeDb({ ...good, schedule_summaries: { data: [{ notion_student_id: S1, sync_state: "failed" }, { notion_student_id: S2, sync_state: "synced" }], error: null } });
    expect((await loadSetupInput(db, ORG, "2026-10-16", readers(), env)).schedules).toEqual({ adopted: 2, scheduled: 2, failedSync: 1 });
  });
  it("a throwing Notion reader marks only its row, never 0 (AC4)", async () => {
    const { db } = fakeDb(good);
    const input = await loadSetupInput(db, ORG, "2026-10-16", readers({ staff: async () => { throw new Error("down"); }, scheduledStudents: async () => { throw new Error("down"); } }), env);
    expect(input.teachers).toEqual({ failed: "notion" });
    expect(input.schedules).toEqual({ failed: "notion" });
    expect(input.availability).toEqual({ entered: 1, linked: 1 });
    expect(input.guard).toEqual({ ok: true });
  });
  it("a database error marks only the rows that need that table (AC5)", async () => {
    const { db } = fakeDb({ ...good, parent_links: { data: null, error: { message: "denied" } } });
    const input = await loadSetupInput(db, ORG, "2026-10-16", readers(), env);
    expect(input.parents).toEqual({ failed: "db" });
    expect(input.notionRecords).toEqual({ students: 2, linked: 1, missing: [{ id: CY, name: "Cy R." }] });
    const links = fakeDb({ ...good, staff_links: { data: null, error: { message: "x" } } });
    const i2 = await loadSetupInput(links.db, ORG, "2026-10-16", readers(), env);
    expect(i2.teachers).toEqual({ failed: "db" });
    expect(i2.availability).toEqual({ failed: "db" });
    expect(i2.schedules).toEqual({ adopted: 1, scheduled: 2, failedSync: 0 });
  });
  it("a row that does not parse is a database failure, not an empty list", async () => {
    const { db } = fakeDb({ ...good, daily_tasks: { data: [{ local_date: 5 }], error: null } });
    expect((await loadSetupInput(db, ORG, "2026-10-16", readers(), env)).dailyTask).toEqual({ failed: "db" });
  });
  it("guard: false, missing row and RPC error (AC7)", async () => {
    const run = async (rpc: Result) => (await loadSetupInput(fakeDb({ ...good, rpc }).db, ORG, "2026-10-16", readers(), env)).guard;
    expect(await run({ data: [{ check_name: "notion_link_guard", ok: false }], error: null })).toEqual({ ok: false });
    expect(await run({ data: [], error: null })).toEqual({ failed: "db" });
    expect(await run({ data: null, error: { message: "no function" } })).toEqual({ failed: "db" });
  });
  it("daily task: config checks from env, and env values never reach the input (AC6)", async () => {
    const { db } = fakeDb(good);
    const input = await loadSetupInput(db, ORG, "2026-10-16", readers(), { workConfigured: false, cronSecretSet: false, orgIdEnv: SECRET });
    expect(input.dailyTask).toEqual({
      missingConfig: [{ name: "notion_token", problem: "not_set" }, { name: "cron_secret", problem: "not_set" }, { name: "org_id", problem: "other_org" }],
      readyDates: ["2026-10-16"],
    });
    expect(JSON.stringify(input)).not.toContain(SECRET);
  });
  it("only ready rows count as ready", async () => {
    const { db } = fakeDb({ ...good, daily_tasks: { data: [{ local_date: "2026-10-16", state: "failed" }, { local_date: "2026-10-15", state: "pending" }], error: null } });
    expect((await loadSetupInput(db, ORG, "2026-10-16", readers(), env)).dailyTask).toEqual({ missingConfig: [], readyDates: [] });
  });
  it("reads only: selects and rpc setup_checks, every query scoped to the org (AC8)", async () => {
    const { db, calls } = fakeDb(good);
    await loadSetupInput(db, ORG, "2026-10-16", readers(), env);
    expect(calls.filter((c) => /\.(insert|update|upsert|delete)\(/.test(c))).toEqual([]);
    expect(calls.filter((c) => c.startsWith("rpc:"))).toEqual([`rpc:setup_checks({"target_org":"${ORG}"})`]);
    const tables = calls.filter((c) => c.startsWith("from:")).map((c) => c.slice(5)).sort();
    expect(tables).toEqual(["availability_windows", "daily_tasks", "parent_links", "schedule_summaries", "staff_links", "students"]);
    for (const t of tables) expect(calls).toContain(`${t}.eq(${JSON.stringify(["org_id", ORG])})`);
    expect(calls).toContain(`staff_links.is(${JSON.stringify(["revoked_at", null])})`);
    expect(calls).toContain(`students.neq(${JSON.stringify(["status", "archived"])})`);
  });
  it.each([
    ["2026-10-17T03:30:00Z", "2026-10-16", "2026-10-15"],
    ["2026-10-17T04:05:00Z", "2026-10-17", "2026-10-16"],
  ])("time zone at %s: availability from %s, daily task on (%s, %s) (AC6, AC14)", async (instant, today, yesterday) => {
    const { todayIso } = await import("../time");
    expect(todayIso(new Date(instant))).toBe(today);
    const { db, calls } = fakeDb(good);
    await loadSetupInput(db, ORG, todayIso(new Date(instant)), readers(), env);
    expect(calls).toContain(`availability_windows.or(${JSON.stringify([`effective_until.is.null,effective_until.gte.${today}`])})`);
    expect(calls).toContain(`daily_tasks.in(${JSON.stringify(["local_date", [today, yesterday]])})`);
    expect(calls).toContain(`daily_tasks.eq(${JSON.stringify(["kind", "teacher_texts"])})`);
  });
});
