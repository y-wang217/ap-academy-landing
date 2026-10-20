import { describe, expect, it } from "vitest";
import type { StudentRecord } from "../../../lib/notion/students";
import { writeWeeklySchedule } from "../../../lib/notion/students";
import type { DailyNotion, DailyTaskDeps } from "../../../lib/scheduler/daily-task";
import type { DailyTaskStore } from "../../../lib/scheduler/daily-task-store";
import { handleCancelOccurrence, handleCreateClass, handleEditOccurrence, type ScheduleDeps } from "../../../lib/scheduler/schedule-handlers";
import type { SeriesRecord } from "../../../lib/scheduler/schedule-store";
import { admin, fixture, REQ, RYAN, S1, S2, staff, teacher, TODAY } from "./booking-world.fake";
import type { LessonLinkPort } from "../../../lib/domain/schedule/lesson-link";
import { createLessonsPort } from "../../../lib/notion/lessons";
import { handleClearOutcome, handleLinkLesson, handleLogClass, handleNoShow, handleUnlinked } from "../../../lib/scheduler/lesson-handlers";
import { memoryOutcomes } from "./lesson-world.fake";

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

describe("REQ-39: lesson write path (AC13, AC14)", () => {
  const SCHEMA = {
    properties: {
      Lesson: { id: "title" }, Date: { id: "dt" }, Teacher: { id: "te" }, "Related to Students & Parents (Lessons 1)": { id: "st" },
      "Duration (hrs)": { id: "du" }, "Paid to Teacher": { id: "pd" }, "Pay Period": { id: "pp" }, Type: { id: "ty" }, "Class occurrence": { id: "co" },
    },
  };
  const READ_FILTER = "filter_properties[]=dt&filter_properties[]=te&filter_properties[]=st&filter_properties[]=co";
  const CREATE_KEYS = ["Class occurrence", "Date", "Duration (hrs)", "Lesson", "Related to Students & Parents (Lessons 1)", "Teacher"];

  /** A tiny Lessons database behind fetch: pages keyed by ID, with their ref. */
  function notion() {
    const requests: Recorded[] = [];
    const pages = new Map<string, { date: string; staff: string; student: string; ref: string; paid: boolean }>();
    let n = 0;
    let failCreate = false;
    const page = (id: string) => {
      const p = pages.get(id)!;
      return {
        id, properties: {
          Date: { date: { start: p.date } }, Teacher: { relation: [{ id: p.staff }] }, "Related to Students & Parents (Lessons 1)": { relation: [{ id: p.student }] },
          "Class occurrence": { rich_text: p.ref ? [{ plain_text: p.ref }] : [] }, "Paid to Teacher": { checkbox: p.paid },
        },
      };
    };
    const fetcher = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, url, body });
      const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (method === "GET" && url.endsWith("/data_sources/ds-lessons")) return ok(SCHEMA);
      if (method === "POST" && url.includes("/data_sources/ds-lessons/query")) {
        const f = body.filter;
        const hits = [...pages.keys()].filter((id) => (f.rich_text?.equals ? pages.get(id)!.ref === f.rich_text.equals : pages.get(id)!.ref === ""));
        return ok({ results: hits.map(page), has_more: false });
      }
      if (method === "POST" && url.endsWith("/v1/pages")) {
        const id = `e0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
        const props = body.properties;
        pages.set(id, { date: props.Date.date.start, staff: props.Teacher.relation[0].id, student: props["Related to Students & Parents (Lessons 1)"].relation[0].id, ref: props["Class occurrence"].rich_text[0].text.content, paid: false });
        if (failCreate) { failCreate = false; return new Response("{}", { status: 504 }); }
        return ok({ id });
      }
      const m = /\/v1\/pages\/([0-9a-f-]{36})/.exec(url);
      if (m && method === "GET") return pages.has(m[1]) ? ok(page(m[1])) : new Response("{}", { status: 404 });
      if (m && method === "PATCH") {
        const rt = body.properties["Class occurrence"].rich_text;
        pages.get(m[1])!.ref = rt.length ? rt[0].text.content : "";
        return ok({ id: m[1] });
      }
      return new Response("{}", { status: 400 });
    }) as unknown as typeof fetch;
    return { requests, pages, fetcher, failNextCreate: () => { failCreate = true; } };
  }

  async function driveLessons() {
    const f = await fixture();
    const nn = notion();
    let now = Date.parse("2026-10-19T18:00:00Z");
    const outcomes = memoryOutcomes(() => now);
    const p = await f.seed({ startDate: "2026-09-28" });
    const lessons = createLessonsPort({ token: "secret_x", dataSourceId: "ds-lessons" }, nn.fetcher);
    const deps = (identity = admin): ScheduleDeps => ({ ...f.deps(identity), lessons, outcomes: outcomes.store, now: () => now });
    const statuses: number[] = [];
    const run = async (r: Promise<Response>) => { statuses.push((await r).status); };
    // A form-logged row the owner links, and the seeded paid lesson that must never be requested.
    nn.pages.set("f0000000-0000-4000-8000-000000000001", { date: "2026-10-05", staff: RYAN, student: S1, ref: "", paid: false });
    await run(handleLogClass(deps(teacher), { seriesId: p.id, originalDate: "2026-10-12" })); // fresh
    await run(handleLogClass(deps(teacher), { seriesId: p.id, originalDate: "2026-10-12" })); // replay
    nn.failNextCreate();
    await run(handleLogClass(deps(teacher), { seriesId: p.id, originalDate: "2026-09-28" })); // 502, committed
    now += 61_000;
    await run(handleLogClass(deps(teacher), { seriesId: p.id, originalDate: "2026-09-28" })); // found, not repeated
    await run(handleNoShow(deps(teacher), { seriesId: p.id, originalDate: "2026-10-19", outcome: "no_show" }));
    await run(handleUnlinked(deps(), new URLSearchParams({ from: "2026-09-28", to: "2026-10-19" })));
    await run(handleLinkLesson(deps(), { seriesId: p.id, originalDate: "2026-10-05", lessonId: "f0000000-0000-4000-8000-000000000001" }));
    await run(handleClearOutcome(deps(), { seriesId: p.id, originalDate: "2026-10-05" }));
    await run(handleClearOutcome(deps(), { seriesId: p.id, originalDate: "2026-10-19" }));
    return { requests: nn.requests, pages: nn.pages, statuses };
  }

  it("drives every path to its expected answer", async () => {
    const { statuses, pages } = await driveLessons();
    expect(statuses).toEqual([201, 200, 502, 200, 201, 200, 200, 200, 200]);
    expect([...pages.values()].filter((x) => x.date === "2026-09-28")).toHaveLength(1);
  });

  it("every request is one of the allowed shapes", async () => {
    const { requests } = await driveLessons();
    for (const r of requests) {
      const path = r.url.replace(/^https?:\/\/[^/]+/, "");
      if (r.method === "GET" && path === "/v1/data_sources/ds-lessons") continue;
      if (r.method === "GET") {
        expect(path).toMatch(/^\/v1\/pages\/[0-9a-f-]{36}\?/);
        expect(path.split("?")[1]).toBe(READ_FILTER);
      } else if (r.method === "POST" && path.startsWith("/v1/data_sources/ds-lessons/query")) {
        expect(path.split("?")[1]).toBe(READ_FILTER);
      } else if (r.method === "POST") {
        expect(path).toBe("/v1/pages");
        expect(Object.keys((r.body as { properties: object }).properties).sort()).toEqual(CREATE_KEYS);
      } else {
        expect(r.method).toBe("PATCH");
        expect(path).toMatch(/^\/v1\/pages\/[0-9a-f-]{36}$/);
        expect(Object.keys((r.body as { properties: object }).properties)).toEqual(["Class occurrence"]);
      }
    }
  });

  it("no body names a payout field, archives or trashes; no PATCH names Duration or Teacher", async () => {
    const { requests } = await driveLessons();
    for (const r of requests) {
      const keys = deepKeys(r.body);
      for (const bad of ["Paid to Teacher", "Pay Period", "Type", "archived", "in_trash"]) expect(keys).not.toContain(bad);
      if (r.method === "PATCH") for (const bad of ["Duration (hrs)", "Teacher"]) expect(keys).not.toContain(bad);
    }
  });

  it("every create follows a find query for the same ref in the same request", async () => {
    const { requests } = await driveLessons();
    requests.forEach((r, i) => {
      if (r.method !== "POST" || !r.url.endsWith("/v1/pages")) return;
      const ref = (r.body as { properties: Record<string, { rich_text: { text: { content: string } }[] }> }).properties["Class occurrence"].rich_text[0].text.content;
      const before = requests.slice(0, i).reverse().find((x) => x.method === "POST" && x.url.includes("/query"));
      expect((before?.body as { filter: { rich_text: { equals: string } } }).filter.rich_text.equals).toBe(ref);
    });
  });

  it("AC14: booking create, move and cancel never call the lessons port", async () => {
    const calls: string[] = [];
    const lessons = new Proxy({}, { get: (_t, k) => async () => { calls.push(String(k)); throw new Error("must not be called"); } }) as LessonLinkPort;
    const f = await fixture();
    const deps = (): ScheduleDeps => ({ ...f.deps(), lessons });
    expect((await handleCreateClass(deps(), create())).status).toBe(201);
    expect((await handleEditOccurrence(deps(), f.s1.id, "2026-10-26", { requestId: REQ(50), expectedUpdatedAt: f.series.get(f.s1.id)!.updatedAt, changes: { date: "2026-10-28", startTime: "16:30" } })).status).toBe(200);
    expect((await handleCancelOccurrence(deps(), f.s2.id, "2026-10-28", { requestId: REQ(70), expectedUpdatedAt: f.series.get(f.s2.id)!.updatedAt, scope: "this" })).status).toBe(200);
    expect(calls).toEqual([]);
  });
});
