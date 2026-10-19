import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Occurrence } from "../../../lib/domain/schedule/recurrence";
import { config as proxyConfig } from "../../../proxy";
import type { StaffRecord } from "../../../lib/notion/staff";
import type { DailyNotion, DailyTaskDeps } from "../../../lib/scheduler/daily-task";
import { handleDailyTaskCreate, handleDailyTaskRun, handleDailyTaskStatus } from "../../../lib/scheduler/daily-task-handlers";
import type { DailyTaskRow, DailyTaskStore } from "../../../lib/scheduler/daily-task-store";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import { handleCancelOccurrence, handleCreateClass, type ScheduleDeps } from "../../../lib/scheduler/schedule-handlers";
import { lockedWrites } from "./series-writes.fake";
import type { ScheduleStore, SeriesRecord, WindowRecord } from "../../../lib/scheduler/schedule-store";

const ORG = "10000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REQ = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ryan: StaffRecord = { id: A, name: "Ryan Test", email: "r@example.com", functions: ["Teacher"], status: "Active", subjects: [] };
const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const teacher: SchedulerIdentity = { scope: "teacher", orgId: ORG, staff: ryan };
const TODAY = "2026-10-19";

const open: WindowRecord[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ id: REQ(900 + weekday), staffId: A, weekday, startTime: "00:00", endTime: "23:55", effectiveFrom: "2026-01-01", effectiveUntil: null, updatedAt: "t" }));

/** Just enough store for create and cancel: everything else answers "empty" or is never called. */
function scheduleStore() {
  const series = new Map<string, SeriesRecord>();
  let n = 100;
  const store = {
    listWindows: async () => open,
    listAvailabilityExceptions: async () => [],
    listSeries: async () => ({ series: [...series.values()], exceptions: [] }),
    getSeries: async (id: string) => series.get(id) ?? null,
    ...lockedWrites({ series, exceptions: [], newId: () => REQ(++n), stampOf: () => "2026-10-19T12:00:00.000Z" }).methods,
    listSeriesForStudent: async (id: string) => ({ series: [...series.values()].filter((x) => x.studentId === id), exceptions: [] }),
    getSummary: async () => null,
  } as unknown as ScheduleStore;
  return { store, series };
}

function dailyWorld(opts: { page?: boolean; notionDown?: boolean } = {}) {
  let row: DailyTaskRow | null = opts.page
    ? { id: "t1", localDate: TODAY, notionPageId: "a0000000-0000-4000-8000-000000000001", notionPageUrl: "https://notion.so/p", notionLogId: "a0000000-0000-4000-8000-000000000002", state: "ready", lastError: null, refreshCount: 0, updatedAt: "t" }
    : null;
  let leased = false;
  const reads: string[] = [];
  const store: DailyTaskStore = {
    get: async () => { reads.push("get"); return row; },
    claim: async () => { reads.push("claim"); if (leased) return null; leased = true; row ??= { id: "t1", localDate: TODAY, notionPageId: null, notionPageUrl: null, notionLogId: null, state: "pending", lastError: null, refreshCount: 0, updatedAt: "t" }; return row; },
    save: async (_id, p) => { const { releaseLease, ...rest } = p; row = { ...row!, ...rest }; if (releaseLease) leased = false; },
    listTeachers: async () => [],
    saveTeacher: async () => {},
  };
  const notionCalls: string[] = [];
  let todoCount = 0;
  const guard = (name: string) => { notionCalls.push(name); if (opts.notionDown) throw Object.assign(new Error("Notion returned 500"), { name: "NotionError" }); };
  const notion: DailyNotion = {
    find: async () => { guard("find"); return null; },
    create: async (input) => { guard("create"); todoCount = input.teachers.length; return { pageId: "a0000000-0000-4000-8000-000000000001", pageUrl: "https://notion.so/p" }; },
    list: async () => { guard("list"); return { introId: "i", todos: Array.from({ length: todoCount }, (_, i) => ({ id: `b${i}`, checked: false, lastEditedTime: "t" })) }; },
    update: async () => { guard("update"); return "t"; },
    append: async () => { guard("append"); return { blockId: "b", lastEditedTime: "t" }; },
    updateIntro: async () => { guard("intro"); },
    createLog: async () => { guard("createLog"); return "a0000000-0000-4000-8000-000000000002"; },
    updateLog: async () => { guard("updateLog"); },
  };
  const occurrences: Occurrence[] = [];
  const daily: DailyTaskDeps = {
    store, notion, fetchStaff: async () => [ryan], studentNames: async () => new Map(), occurrencesOn: async () => occurrences,
    scheduleUrl: (id, d) => `https://x/schedule?staffId=${id}&date=${d}`, now: () => new Date("2026-10-19T12:15:00Z"), sessionLink: "https://x/schedule",
  };
  return { daily, reads, notionCalls, get row() { return row; } };
}

const deps = (identity: SchedulerIdentity, store: ScheduleStore, dailyTask?: DailyTaskDeps): ScheduleDeps => ({
  identity: async () => identity, fetchStaff: async () => [ryan], store, today: () => TODAY, dailyTask,
});
const newClass = (over: Record<string, unknown> = {}) => ({
  requestId: REQ(1), staffId: A, studentId: STUDENT, subject: "MHF4U", kind: "weekly", startDate: "2026-10-26", startTime: "17:00", durationMinutes: 60, effectiveUntil: null, ...over,
});

describe("AC12: permissions", () => {
  it("a teacher gets 403 on GET and POST and nothing is read", async () => {
    const w = dailyWorld({ page: true });
    const { store } = scheduleStore();
    const get = await handleDailyTaskStatus(deps(teacher, store, w.daily), new URLSearchParams());
    const post = await handleDailyTaskCreate(deps(teacher, store, w.daily), { date: TODAY });
    expect([get.status, post.status]).toEqual([403, 403]);
    expect(w.reads).toEqual([]);
    expect(w.notionCalls).toEqual([]);
  });

  it("admin reads the status and creates today's task, never another date", async () => {
    const w = dailyWorld();
    const { store } = scheduleStore();
    expect(await (await handleDailyTaskStatus(deps(admin, store, w.daily), new URLSearchParams())).json()).toMatchObject({ state: "none" });
    const made = await handleDailyTaskCreate(deps(admin, store, w.daily), { date: TODAY });
    expect(made.status).toBe(200);
    expect(await made.json()).toMatchObject({ result: "created", status: { state: "ready", pageUrl: "https://notion.so/p" } });
    expect((await handleDailyTaskCreate(deps(admin, store, w.daily), { date: "2026-10-20" })).status).toBe(400);
    expect((await handleDailyTaskCreate(deps(admin, store, w.daily), { date: TODAY, extra: 1 })).status).toBe(400);
  });

  const SECRET = "s3cret-value";
  const runDeps = (w: ReturnType<typeof dailyWorld>, now = "2026-10-19T12:15:00Z") => {
    let built = 0;
    return {
      built: () => built,
      input: (authorization: string | null, env: { secret?: string; time?: string } = { secret: SECRET }) => ({
        authorization, env: { secret: env.secret, orgId: ORG, time: env.time }, build: () => { built++; return w.daily; }, now: () => new Date(now),
      }),
    };
  };
  it("the run route is 503 with the secret unset and 401 without or with a wrong bearer, before any call", async () => {
    const w = dailyWorld();
    const r = runDeps(w);
    expect((await handleDailyTaskRun(r.input(`Bearer ${SECRET}`, { secret: undefined }))).status).toBe(503);
    for (const auth of [null, "", "Bearer ", "Bearer wrong", `Basic ${SECRET}`, SECRET]) {
      expect((await handleDailyTaskRun(r.input(auth))).status, String(auth)).toBe(401);
    }
    expect(r.built()).toBe(0);
    expect(w.reads).toEqual([]);
    expect(w.notionCalls).toEqual([]);
  });
});

describe("AC4: time of day, with an injected clock", () => {
  const SECRET = "s3cret-value";
  const run = (w: ReturnType<typeof dailyWorld>, now: string, time?: string) =>
    handleDailyTaskRun({ authorization: `Bearer ${SECRET}`, env: { secret: SECRET, orgId: ORG, time }, build: () => w.daily, now: () => new Date(now) });
  it("before 06:00 local it returns not_yet and touches nothing", async () => {
    const w = dailyWorld();
    const res = await run(w, "2026-10-19T09:30:00Z"); // 05:30 EDT
    expect(await res.json()).toEqual({ result: "not_yet" });
    expect(w.reads).toEqual([]);
    expect(w.notionCalls).toEqual([]);
  });
  it("from 06:00 local it creates the task", async () => {
    const w = dailyWorld();
    expect(await (await run(w, "2026-10-19T10:05:00Z")).json()).toMatchObject({ result: "created" });
  });
  it("DAILY_TASK_TIME=07:30: 07:10 creates nothing, 07:35 creates", async () => {
    const w = dailyWorld();
    expect(await (await run(w, "2026-10-19T11:10:00Z", "07:30")).json()).toEqual({ result: "not_yet" });
    expect(await (await run(w, "2026-10-19T11:35:00Z", "07:30")).json()).toMatchObject({ result: "created" });
  });
  it("across DST (EST on 2026-11-02): 10:05 UTC is 05:05 local and not_yet; 11:05 UTC creates", async () => {
    const w = dailyWorld();
    expect(await (await run(w, "2026-11-02T10:05:00Z")).json()).toEqual({ result: "not_yet" });
    const res = await run(w, "2026-11-02T11:05:00Z");
    expect(await res.json()).toMatchObject({ result: "created" });
  });
  it("uses the local date for the task, not the UTC date", async () => {
    const dates: string[] = [];
    const w = dailyWorld();
    w.daily.occurrencesOn = async (d) => { dates.push(d); return []; };
    await run(w, "2026-11-03T05:30:00Z"); // 00:30 EST on Nov 3: before 06:00, nothing happens
    expect(dates).toEqual([]);
    await run(w, "2026-11-03T04:30:00Z"); // 23:30 EST on Nov 2: UTC says Nov 3, the task is for Nov 2
    expect(dates).toEqual(["2026-11-02"]);
  });
  it("a failed run is a 502 so the workflow shows red", async () => {
    const w = dailyWorld({ notionDown: true });
    expect((await run(w, "2026-10-19T12:15:00Z")).status).toBe(502);
  });
  it("a bad configured time falls back to 06:00", async () => {
    const w = dailyWorld();
    expect(await (await run(w, "2026-10-19T09:30:00Z", "banana")).json()).toEqual({ result: "not_yet" });
  });
});

describe("AC10, AC11: class writes refresh today's task", () => {
  it("skips when today's task does not exist, and does not create it", async () => {
    const w = dailyWorld();
    const { store } = scheduleStore();
    const res = await handleCreateClass(deps(admin, store, w.daily), newClass());
    expect(res.status).toBe(201);
    expect((await res.json()).dailyTask).toBe("skipped");
    expect(w.notionCalls).toEqual([]);
  });
  it("reports unchanged when the day did not change (no Notion calls for the schedule)", async () => {
    const w = dailyWorld({ page: true });
    const { store } = scheduleStore();
    const res = await handleCreateClass(deps(admin, store, w.daily), newClass());
    expect((await res.json()).dailyTask).toMatch(/^(unchanged|updated)$/);
  });
  it("a Notion failure keeps the class write at 2xx with dailyTask failed and a short error on the row", async () => {
    const w = dailyWorld({ page: true, notionDown: true });
    const { store, series } = scheduleStore();
    // Today's class so the fingerprint differs and a Notion call is needed.
    w.daily.occurrencesOn = async () => [{
      occurrenceKey: "k", seriesId: "s", originalDate: TODAY, date: TODAY, startTime: "16:00", endTime: "17:00", durationMinutes: 60, startsAt: "", endsAt: "",
      staffId: A, studentId: STUDENT, subject: "MHF4U", status: "scheduled", kind: "weekly", purpose: null,
    }];
    const res = await handleCreateClass(deps(admin, store, w.daily), newClass());
    expect(res.status).toBe(201);
    expect((await res.json()).dailyTask).toBe("failed");
    expect(series.size).toBe(1);
    expect(w.row?.state).toBe("failed");
    expect(w.row?.lastError).toBe("Notion returned 500");
  });
  it("without the Work database wired in there is no dailyTask field", async () => {
    const { store } = scheduleStore();
    const body = await (await handleCreateClass(deps(admin, store), newClass())).json();
    expect("dailyTask" in body).toBe(false);
  });
  it("a cancel carries dailyTask too", async () => {
    const w = dailyWorld({ page: true });
    const { store } = scheduleStore();
    const made = await (await handleCreateClass(deps(admin, store, w.daily), newClass())).json();
    const res = await handleCancelOccurrence(deps(admin, store, w.daily), made.series.id, "2026-10-26", {
      requestId: REQ(2), expectedUpdatedAt: made.series.updatedAt, scope: "this", expectedDate: "2026-10-26", expectedStartTime: "17:00",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).dailyTask).toMatch(/^(unchanged|updated)$/);
  });
});

describe("AC12: the proxy exempts exactly the run endpoint", () => {
  it("the catch-all matcher excludes it and nothing else under api/", () => {
    const sources = proxyConfig.matcher.map((m) => m.source);
    expect(sources.some((s) => s.includes("api/scheduler/daily-task/run"))).toBe(true);
    expect(sources.filter((s) => s.includes("api/")).length).toBe(1);
  });
});

describe("AC9, AC13: source scans of the new files", () => {
  const root = resolve(__dirname, "../../..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  const NEW = [
    "lib/domain/schedule/daily-texts.ts", "lib/notion/work.ts", "lib/scheduler/daily-task.ts", "lib/scheduler/daily-task-store.ts",
    "lib/scheduler/daily-task-handlers.ts", "lib/scheduler/daily-task-wiring.ts", "lib/data/daily-task.ts",
    "app/api/scheduler/daily-task/route.ts", "app/api/scheduler/daily-task/run/route.ts", "components/scheduler/daily-task-status.tsx",
  ];
  it("never calls a messaging service or Notion comments", () => {
    for (const f of NEW) expect(read(f), f).not.toMatch(/whatsapp|twilio|wa\.me|api\.notion\.com\/v1\/comments|\/comments/i);
  });
  it("writes only to Work and Work Log, never lessons, payouts, students or class tables", () => {
    for (const f of NEW) {
      const src = read(f);
      expect(src, f).not.toMatch(/payout|paid to teacher|pay period|lessons|\.from\(["'](class_series|class_exceptions|students|schedule_summaries)["']\)/i);
    }
  });
  it("only the run route imports the service-role client", () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (f === "node_modules" || f === ".next") return [];
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) && !p.endsWith(".test.ts") ? [p] : [];
    });
    const importers = files(root).filter((f) => /@ap-academy\/db\/service/.test(readFileSync(f, "utf8"))).map((f) => f.slice(root.length + 1));
    expect(importers).toEqual(["app/api/scheduler/daily-task/run/route.ts"]);
  });
});

describe("REQ-38 AC7: the run route syncs people first, every hour", () => {
  const SECRET = "s3cret-value";
  const run = (w: ReturnType<typeof dailyWorld>, now: string, syncPeople?: (orgId: string) => Promise<"ok" | "failed" | "not_configured">, auth = `Bearer ${SECRET}`) =>
    handleDailyTaskRun({ authorization: auth, env: { secret: SECRET, orgId: ORG, time: undefined }, build: () => w.daily, now: () => new Date(now), syncPeople });
  it("syncs before the isDue check and reports it on a not_yet reply", async () => {
    const w = dailyWorld();
    const orgs: string[] = [];
    const res = await run(w, "2026-10-19T09:30:00Z", async (org) => { orgs.push(org); return "ok"; });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "not_yet", people: "ok" });
    expect(orgs).toEqual([ORG]);
    expect(w.notionCalls).toEqual([]);
  });
  it("a failed or throwing sync does not stop the daily task, and status codes are unchanged", async () => {
    for (const sync of [async () => "failed" as const, async () => { throw new Error("boom"); }]) {
      const w = dailyWorld();
      const res = await run(w, "2026-10-19T10:05:00Z", sync);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ result: "created", people: "failed" });
    }
  });
  it("not configured is reported, and a bad bearer never syncs", async () => {
    const w = dailyWorld();
    expect(await (await run(w, "2026-10-19T09:30:00Z", async () => "not_configured")).json()).toEqual({ result: "not_yet", people: "not_configured" });
    let called = 0;
    const denied = await run(w, "2026-10-19T10:05:00Z", async () => { called++; return "ok"; }, "Bearer wrong");
    expect(denied.status).toBe(401);
    expect(called).toBe(0);
  });
});
