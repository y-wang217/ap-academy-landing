import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { handleMe, handleStaffById, handleStaffList, type HandlerDeps } from "../../../lib/scheduler/handlers";
import { MeResponse } from "../../../lib/scheduler/schemas";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import type { StaffRecord } from "../../../lib/notion/staff";

const ORG = "10000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mk = (id: string, name: string, over: Partial<StaffRecord> = {}): StaffRecord => ({
  id, name, email: `${name}@example.com`, functions: ["Teacher"], status: "Active", subjects: ["MHF4U"], ...over,
});
const ryan = mk(A, "ryan");
const kuby = mk(B, "kuby");
const setter = mk("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "sam", { functions: ["Setter"] });
const ALL = [ryan, kuby, setter];

const deps = (identity: SchedulerIdentity, fetchStaff: HandlerDeps["fetchStaff"] = async () => ALL): HandlerDeps => ({
  identity: async () => identity,
  fetchStaff,
});
const teacher: SchedulerIdentity = { scope: "teacher", orgId: ORG, staff: ryan };
const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const json = async (r: Response) => ({ status: r.status, body: await r.json(), headers: r.headers });

describe("GET /api/scheduler/me", () => {
  it("teacher: 200, strict body without email or other staff (AC1, AC7)", async () => {
    const r = await json(await handleMe(deps(teacher)));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ scope: "teacher", staff: { id: A, name: "ryan", subjects: ["MHF4U"] } });
    expect(MeResponse.safeParse(r.body).success).toBe(true);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(r.body)).not.toMatch(/kuby|example\.com|rate|phone|notes/i);
  });
  it("none: 403 { scope: none } (AC2)", async () => {
    const r = await json(await handleMe(deps({ scope: "none" })));
    expect(r).toMatchObject({ status: 403, body: { scope: "none" } });
  });
  it("admin: 200 with staff null or their own with email (AC4)", async () => {
    expect((await json(await handleMe(deps(admin)))).body).toEqual({ scope: "admin", staff: null });
    const own = (await json(await handleMe(deps({ ...admin, staff: kuby })))).body;
    expect(own).toEqual({ scope: "admin", staff: { id: B, name: "kuby", subjects: ["MHF4U"], email: "kuby@example.com" } });
  });
  it("401, 503 for signed out, unconfigured, unavailable (AC10, AC12)", async () => {
    expect((await json(await handleMe(deps({ scope: "signed_out" })))).status).toBe(401);
    expect(await json(await handleMe(deps({ scope: "unconfigured" })))).toMatchObject({ status: 503, body: { error: "scheduler_not_configured" } });
    expect(await json(await handleMe(deps({ scope: "unavailable" })))).toMatchObject({ status: 503, body: { error: "scheduler_unavailable" } });
  });
});

describe("GET /api/scheduler/staff", () => {
  it("admin gets active teaching staff only, with email (AC6)", async () => {
    const r = await json(await handleStaffList(deps(admin)));
    expect(r.status).toBe(200);
    expect(r.body.staff.map((s: { id: string }) => s.id)).toEqual([A, B]);
    expect(r.body.staff[0]).toEqual({ id: A, name: "ryan", subjects: ["MHF4U"], email: "ryan@example.com" });
  });
  it("teacher gets 403 (AC6)", async () => {
    expect((await json(await handleStaffList(deps(teacher)))).status).toBe(403);
  });
  it("503 if Notion fails for the admin (AC12)", async () => {
    const r = await json(await handleStaffList(deps(admin, async () => { throw new Error("x"); })));
    expect(r).toMatchObject({ status: 503, body: { error: "scheduler_unavailable" } });
  });
});

describe("GET /api/scheduler/staff/{id}", () => {
  it("teacher reads own profile without email (AC5, AC7)", async () => {
    const r = await json(await handleStaffById(deps(teacher), A));
    expect(r).toMatchObject({ status: 200, body: { staff: { id: A, name: "ryan", subjects: ["MHF4U"] } } });
    expect(r.body.staff).not.toHaveProperty("email");
  });
  it("teacher targeting another teacher gets 403 and no data (AC5)", async () => {
    const r = await json(await handleStaffById(deps(teacher), B));
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toMatch(/kuby/);
  });
  it("admin reads any active teaching staff; 404 for a setter or unknown ID", async () => {
    expect((await json(await handleStaffById(deps(admin), B))).body.staff).toMatchObject({ id: B, email: "kuby@example.com" });
    expect((await json(await handleStaffById(deps(admin), setter.id))).status).toBe(404);
    expect((await json(await handleStaffById(deps(admin), "dddddddd-dddd-4ddd-8ddd-dddddddddddd"))).status).toBe(404);
  });
  it("400 for a malformed ID, 401 signed out (AC5)", async () => {
    expect((await json(await handleStaffById(deps(admin), "nope"))).status).toBe(400);
    expect((await json(await handleStaffById(deps(teacher), "nope"))).status).toBe(400);
    expect((await json(await handleStaffById(deps({ scope: "signed_out" }), A))).status).toBe(401);
  });
});

describe("route files and Notion isolation (AC10)", () => {
  const root = resolve(__dirname, "../../..");
  for (const [file, exp] of [
    ["app/api/scheduler/me/route.ts", "GET"],
    ["app/api/scheduler/staff/route.ts", "GET"],
    ["app/api/scheduler/staff/[staffId]/route.ts", "GET"],
  ] as const) {
    it(`${file} exports ${exp} and force-dynamic`, () => {
      const src = readFileSync(join(root, file), "utf8");
      expect(src).toMatch(new RegExp(`export (async function|const) ${exp}\\b`));
      expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    });
  }
  it("NOTION_TOKEN is only read under lib/notion and no client file imports lib/notion", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next") continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.ts$/.test(name)) continue;
        const src = readFileSync(p, "utf8");
        const rel = p.slice(root.length + 1);
        if (/NOTION_TOKEN/.test(src) && !rel.startsWith("lib/notion/")) hits.push(`token:${rel}`);
        if (/^\s*["']use client["']/m.test(src) && /lib\/notion|\.\/notion\//.test(src)) hits.push(`client:${rel}`);
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});
