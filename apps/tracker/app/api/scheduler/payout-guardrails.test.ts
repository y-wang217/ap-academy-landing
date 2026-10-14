import { describe, expect, it } from "vitest";
import type { StudentRecord } from "../../../lib/notion/students";
import { writeWeeklySchedule } from "../../../lib/notion/students";
import type { DailyNotion, DailyTaskDeps } from "../../../lib/scheduler/daily-task";
import type { DailyTaskStore } from "../../../lib/scheduler/daily-task-store";
import { handleCancelOccurrence, handleCreateClass, handleEditOccurrence, type ScheduleDeps } from "../../../lib/scheduler/schedule-handlers";
import type { SeriesRecord } from "../../../lib/scheduler/schedule-store";
import { fixture, REQ, RYAN, S1, S2, staff, TODAY } from "./booking-world.fake";

// REQ-9 AC5: booking, moving and cancelling classes never write to Lessons or payout fields.
const FORBIDDEN = ["Paid to Teacher", "Pay Period", "Duration (hrs)", "Teacher", "Type"];
const LESSONS_DS = "6300f58a";

/** Every object key at any depth. */
export function deepKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => deepKeys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.push(k); deepKeys(x, out); }
  return out;
}

type Recorded = { method: string; url: string; body: unknown };

/** The real Weekly Schedule writer behind a recording fetch, plus a recording Work port (REQ-8). */
function recorders() {
  const requests: Recorded[] = [];
  const workWrites: unknown[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    requests.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const cfg = { token: "secret_x", dataSourceId: "ds-students" };
  const notion = new Map<string, StudentRecord>([S1, S2].map((id) => [id, { id, name: id.slice(0, 2), stage: "Active", weeklySchedule: "" }]));
  const students: NonNullable<ScheduleDeps["students"]> = {
    list: async () => [...notion.values()],
    get: async (id) => notion.get(id) ?? null,
    write: (id, text) => writeWeeklySchedule(cfg, id, text, fetcher),
  };
  const record = (name: string) => async (...args: unknown[]) => { workWrites.push({ name, args }); return name === "create" ? { pageId: "a0000000-0000-4000-8000-000000000001", pageUrl: "https://notion.so/p" } : name === "list" ? { introId: "i", todos: [] } : name === "createLog" ? "a0000000-0000-4000-8000-000000000002" : name === "find" ? null : name === "update" ? "t" : name === "append" ? { blockId: "b", lastEditedTime: "t" } : undefined; };
  const work = { find: record("find"), create: record("create"), list: record("list"), update: record("update"), append: record("append"), updateIntro: record("updateIntro"), createLog: record("createLog"), updateLog: record("updateLog") } as unknown as DailyNotion;
  let row: Awaited<ReturnType<DailyTaskStore["get"]>> = null;
  let leased = false;
  const store: DailyTaskStore = {
    get: async () => row,
    claim: async () => { if (leased) return null; leased = true; row ??= { id: "t1", localDate: TODAY, notionPageId: null, notionPageUrl: null, notionLogId: null, state: "pending", lastError: null, refreshCount: 0, updatedAt: "t" }; return row; },
    save: async (_id, p) => { const { releaseLease, ...rest } = p; row = { ...row!, ...rest }; if (releaseLease) leased = false; },
    listTeachers: async () => [],
    saveTeacher: async () => {},
  };
  const dailyTask: DailyTaskDeps = {
    store, notion: work, fetchStaff: async () => staff, studentNames: async () => new Map(), occurrencesOn: async () => [],
    scheduleUrl: (id, d) => `https://x/schedule?staffId=${id}&date=${d}`, now: () => new Date("2026-10-19T12:15:00Z"), sessionLink: "https://x/schedule",
  };
  return { requests, workWrites, students, dailyTask };
}

const create = (over: Record<string, unknown> = {}) => ({
  requestId: REQ(1), staffId: RYAN, studentId: S2, subject: "MHF4U", kind: "one_off", startDate: "2026-10-20", startTime: "16:00", durationMinutes: 60, effectiveUntil: null, ...over,
});

async function driveEverything() {
  const f = await fixture();
  const r = recorders();
  const deps = (): ScheduleDeps => ({ ...f.deps(), students: r.students, dailyTask: r.dailyTask });
  const statuses: number[] = [];
  const run = async (p: Promise<Response>) => { statuses.push((await p).status); };
  await run(handleCreateClass(deps(), create()));
  await run(handleCreateClass(deps(), create({ requestId: REQ(2), kind: "weekly", startDate: "2026-10-27", startTime: "18:00" })));
  const current = (id: string): SeriesRecord => f.series.get(id)!;
  await run(handleEditOccurrence(deps(), f.s1.id, "2026-10-26", { requestId: REQ(50), expectedUpdatedAt: current(f.s1.id).updatedAt, changes: { date: "2026-10-28", startTime: "16:30" } }));
  await run(handleEditOccurrence(deps(), f.s1.id, "2026-11-09", { requestId: REQ(51), expectedUpdatedAt: current(f.s1.id).updatedAt, scope: "future", changes: { startTime: "17:00" } }));
  await run(handleCancelOccurrence(deps(), f.s2.id, "2026-10-28", { requestId: REQ(70), expectedUpdatedAt: current(f.s2.id).updatedAt, scope: "this" }));
  await run(handleCancelOccurrence(deps(), f.s2.id, "2026-11-11", { requestId: REQ(71), expectedUpdatedAt: current(f.s2.id).updatedAt, scope: "future" }));
  return { ...r, statuses };
}

describe("AC5: handler guardrail", () => {
  it("every driven change succeeds, so the checks below look at real writes", async () => {
    const run = await driveEverything();
    expect(run.statuses.every((s) => s === 200 || s === 201)).toBe(true);
    expect(run.requests.length).toBeGreaterThan(0);
  });

  it("Notion writes are only Weekly Schedule patches to student pages", async () => {
    const { requests } = await driveEverything();
    for (const r of requests) {
      expect(r.method).toBe("PATCH");
      expect(r.url).toMatch(/\/pages\/[0-9a-f-]{36}$/);
      expect(Object.keys((r.body as { properties: object }).properties)).toEqual(["Weekly Schedule"]);
    }
  });

  it("no write body has a payout or lesson key at any depth, and no URL names the Lessons source", async () => {
    const { requests, workWrites } = await driveEverything();
    const keys = [...requests.flatMap((r) => deepKeys(r.body)), ...workWrites.flatMap((w) => deepKeys(w))];
    for (const bad of FORBIDDEN) expect(keys).not.toContain(bad);
    for (const r of requests) expect(r.url).not.toContain(LESSONS_DS);
    expect(JSON.stringify(workWrites)).not.toContain(LESSONS_DS);
  });

  it("the Work port, when it runs, is only asked to refresh or create the daily task", async () => {
    const { workWrites } = await driveEverything();
    const names = new Set(workWrites.map((w) => (w as { name: string }).name));
    for (const n of names) expect(["find", "create", "list", "update", "append", "updateIntro", "createLog", "updateLog"]).toContain(n);
  });
});
