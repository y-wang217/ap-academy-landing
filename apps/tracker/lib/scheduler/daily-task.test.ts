import { describe, expect, it } from "vitest";
import type { StoredTeacher } from "../domain/schedule/daily-texts";
import type { Occurrence } from "../domain/schedule/recurrence";
import { NotionError, type StaffRecord } from "../notion/staff";
import type { TaskPage, TeacherRender } from "../notion/work";
import { ensureDailyTask, type DailyNotion } from "./daily-task";
import type { DailyTaskPatch, DailyTaskRow, DailyTaskStore } from "./daily-task-store";

const RYAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KUBY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SARA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OLU = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SAM = "11111111-1111-4111-8111-111111111111";
const KIM = "22222222-2222-4222-8222-222222222222";
const DATE = "2026-10-19";
const mk = (id: string, name: string, over: Partial<StaffRecord> = {}): StaffRecord => ({ id, name, email: null, functions: ["Teacher"], status: "Active", subjects: [], ...over });
const STAFF = [mk(RYAN, "Ryan Test"), mk(KUBY, "Kuby Test"), mk(SARA, "Sara", { functions: ["Setter"] }), mk(OLU, "Olu", { status: "Inactive" })];
const occ = (over: Partial<Occurrence>): Occurrence => ({
  occurrenceKey: Math.random().toString(), seriesId: "s", originalDate: DATE, date: DATE, startTime: "16:00", endTime: "17:00", durationMinutes: 60, startsAt: "", endsAt: "",
  staffId: RYAN, studentId: SAM, subject: "MHF4U", status: "scheduled", kind: "weekly", ...over,
});

function harness(opts: { notionFails?: () => boolean; saveFails?: boolean; busy?: boolean } = {}) {
  // --- store
  let row: DailyTaskRow | null = null;
  let leased = !!opts.busy;
  const teachers = new Map<string, StoredTeacher>();
  let saveFails = opts.saveFails ?? false;
  const store: DailyTaskStore = {
    get: async () => row,
    claim: async () => {
      if (leased) return null;
      leased = true;
      row ??= { id: "t1", localDate: DATE, notionPageId: null, notionPageUrl: null, notionLogId: null, state: "pending", lastError: null, refreshCount: 0, updatedAt: "" };
      return row;
    },
    save: async (_id: string, patch: DailyTaskPatch) => {
      if (saveFails && patch.notionPageId) throw new Error("db down");
      const { releaseLease, ...rest } = patch;
      row = { ...row!, ...rest };
      if (releaseLease) leased = false;
    },
    listTeachers: async () => [...teachers.values()],
    saveTeacher: async (_id, t) => { teachers.set(t.staffId, t); },
  };
  // --- notion
  const pages = new Map<string, { title: string; blocks: { id: string; staffName: string; checked: boolean; text: string; edited: number; render: TeacherRender }[]; introId: string; intro: string }>();
  const logs = new Map<string, string>();
  const calls: string[] = [];
  let clock = 1000;
  let n = 0;
  const fail = () => {
    if (opts.notionFails?.()) throw new NotionError("Notion returned 500", 500);
  };
  const stamp = () => new Date(++clock * 60_000).toISOString();
  const notion: DailyNotion = {
    find: async (title) => {
      calls.push("find"); fail();
      const hit = [...pages].find(([, p]) => p.title === title);
      return hit ? { pageId: hit[0], pageUrl: `https://notion.so/${hit[0]}` } : null;
    },
    create: async (input) => {
      calls.push("create"); fail();
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      pages.set(id, {
        title: input.title, introId: `intro-${id}`, intro: input.intro,
        blocks: input.teachers.map((t, i) => ({ id: `blk-${id}-${i}`, staffName: t.todoText, checked: false, text: t.todoText, edited: clock, render: t })),
      });
      return { pageId: id, pageUrl: `https://notion.so/${id}` } satisfies TaskPage;
    },
    list: async (pageId) => {
      calls.push("list"); fail();
      const p = pages.get(pageId)!;
      return { introId: p.introId, todos: p.blocks.map((b) => ({ id: b.id, checked: b.checked, lastEditedTime: new Date(b.edited * 60_000).toISOString() })) };
    },
    update: async (blockId, render, label) => {
      calls.push("update"); fail();
      for (const p of pages.values()) for (const b of p.blocks) if (b.id === blockId) { b.text = `${label ? `${label} ` : ""}${render.todoText}`; b.render = render; b.edited = ++clock; return new Date(b.edited * 60_000).toISOString(); }
      throw new Error("no block");
    },
    append: async (pageId, render, label) => {
      calls.push("append"); fail();
      const p = pages.get(pageId)!;
      const b = { id: `blk-${pageId}-${p.blocks.length}`, staffName: render.todoText, checked: false, text: `${label ? `${label} ` : ""}${render.todoText}`, edited: ++clock, render };
      p.blocks.push(b);
      return { blockId: b.id, lastEditedTime: new Date(b.edited * 60_000).toISOString() };
    },
    updateIntro: async (blockId, text) => { calls.push("intro"); fail(); for (const p of pages.values()) if (p.introId === blockId) p.intro = text; },
    createLog: async (input) => { calls.push("createLog"); fail(); const id = `log-${logs.size + 1}`; logs.set(id, input.decisions); return id; },
    updateLog: async (id, decisions) => { calls.push("updateLog"); fail(); logs.set(id, decisions); },
  };
  // --- schedule
  let occurrences: Occurrence[] = [occ({}), occ({ startTime: "18:00", endTime: "19:00", studentId: KIM, subject: "SPH3U", kind: "one_off" })];
  const deps = () => ({
    store, notion,
    fetchStaff: async () => STAFF,
    studentNames: async () => new Map([[SAM, "Sam Student"], [KIM, "Kim"]]),
    occurrencesOn: async () => occurrences,
    scheduleUrl: (id: string, d: string) => `https://www.apacademy.ca/tracker/schedule?staffId=${id}&date=${d}`,
    now: () => new Date("2026-10-19T12:15:00Z"),
    sessionLink: "https://www.apacademy.ca/tracker/schedule",
  });
  return {
    run: (mode: "create" | "refresh_only" = "create") => ensureDailyTask(deps(), { date: DATE, mode }),
    get row() { return row; }, pages, logs, calls, teachers,
    tick: (name: string, checked: boolean) => { for (const p of pages.values()) for (const b of p.blocks) if (b.staffName.startsWith(name)) { b.checked = checked; b.edited = ++clock; } },
    setOccurrences: (o: Occurrence[]) => { occurrences = o; },
    release: () => { leased = false; },
    setSaveFails: (v: boolean) => { saveFails = v; },
    occ,
  };
}
const only = <T>(m: Map<string, T>) => [...m.values()][0];
const count = (calls: string[], what: string) => calls.filter((c) => c === what).length;

describe("ensureDailyTask", () => {
  it("AC1/AC2/AC14: creates one page with a block per active teacher, a Work Log entry, and saves state", async () => {
    const h = harness();
    expect(await h.run()).toBe("created");
    const page = only(h.pages)!;
    expect(page.title).toBe("Text teachers their schedules \u2014 2026-10-19");
    expect(page.blocks.map((b) => b.text)).toEqual(["Kuby Test: No classes scheduled today", "Ryan Test: 2 classes"]);
    expect(page.intro).toContain("Nothing is sent automatically. Tick a teacher after you text them.");
    expect(h.logs.size).toBe(1);
    expect(h.row).toMatchObject({ state: "ready", lastError: null, notionPageId: expect.any(String), notionLogId: "log-1" });
    expect(h.teachers.size).toBe(2);
  });

  it("AC3: two runs for the same date make one page-create call", async () => {
    const h = harness();
    await h.run();
    expect(await h.run()).toBe("unchanged");
    expect(count(h.calls, "create")).toBe(1);
    expect(h.pages.size).toBe(1);
    expect(h.logs.size).toBe(1);
  });

  it("AC3: a held lease returns busy and writes nothing", async () => {
    const h = harness({ busy: true });
    expect(await h.run()).toBe("busy");
    expect(h.calls).toEqual([]);
    expect(h.row).toBeNull();
  });

  it("AC3: page created but saving its ID failed, so the retry adopts it by title", async () => {
    const h = harness({ saveFails: true });
    expect(await h.run()).toBe("failed");
    expect(h.pages.size).toBe(1);
    expect(h.row?.state).toBe("failed");
    h.setSaveFails(false);
    await h.run();
    expect(count(h.calls, "create")).toBe(1);
    expect(h.pages.size).toBe(1);
    expect(h.row).toMatchObject({ state: "ready" });
    expect(h.teachers.size).toBe(2);
  });

  it("AC10: a Notion failure leaves a short error without a body, and the retry makes exactly one page", async () => {
    let down = true;
    const h = harness({ notionFails: () => down });
    expect(await h.run()).toBe("failed");
    expect(h.row?.state).toBe("failed");
    expect(h.row?.lastError).toBe("Notion returned 500");
    expect(h.row!.lastError!.length).toBeLessThanOrEqual(300);
    down = false;
    await h.run();
    expect(h.pages.size).toBe(1);
    expect(h.row?.state).toBe("ready");
  });

  it("AC10: an unexpected error text is replaced by a generic one", async () => {
    const saved: DailyTaskPatch[] = [];
    const row: DailyTaskRow = { id: "t", localDate: DATE, notionPageId: null, notionPageUrl: null, notionLogId: null, state: "pending", lastError: null, refreshCount: 0, updatedAt: "" };
    const result = await ensureDailyTask({
      store: { get: async () => null, claim: async () => row, save: async (_i, p) => { saved.push(p); }, listTeachers: async () => [], saveTeacher: async () => {} },
      notion: {} as DailyNotion,
      fetchStaff: async () => { throw new Error("Sam Student is a secret"); },
      studentNames: async () => new Map(), occurrencesOn: async () => [], scheduleUrl: () => "", now: () => new Date(), sessionLink: "",
    }, { date: DATE, mode: "create" });
    expect(result).toBe("failed");
    expect(saved.at(-1)).toMatchObject({ state: "failed", lastError: "Could not update the Notion task", releaseLease: true });
  });

  it("AC11: refresh_only skips when there is no task yet, and touches nothing", async () => {
    const h = harness();
    expect(await h.run("refresh_only")).toBe("skipped");
    expect(h.calls).toEqual([]);
  });

  it("AC5: a checked teacher whose class moves gets the Resend label and keeps the tick", async () => {
    const h = harness();
    await h.run();
    h.tick("Ryan", true);
    await h.run(); // observes the tick
    h.setOccurrences([h.occ({ startTime: "17:30", endTime: "18:30" }), h.occ({ startTime: "18:00", endTime: "19:00", studentId: KIM, subject: "SPH3U", kind: "one_off" })]);
    h.calls.length = 0;
    expect(await h.run("refresh_only")).toBe("updated");
    const page = only(h.pages)!;
    const ryan = page.blocks.find((b) => b.staffName.startsWith("Ryan"))!;
    expect(ryan.text.startsWith("Resend: schedule changed after you texted.")).toBe(true);
    expect(ryan.render.bullets[0]).toBe("17:30-18:30 Sam Student, MHF4U");
    expect(ryan.render.copyText).toContain("17:30-18:30");
    expect(ryan.checked).toBe(true);
    expect(count(h.calls, "update")).toBe(1); // Kuby gets no request
    expect(h.logs.get("log-1")).toMatch(/^Refreshed 1 times?, last at \d\d:\d\d$/);
    expect(h.logs.size).toBe(1);
  });

  it("AC6: the same change for an unchecked teacher updates content with no label", async () => {
    const h = harness();
    await h.run();
    h.setOccurrences([h.occ({ startTime: "17:30", endTime: "18:30" })]);
    expect(await h.run("refresh_only")).toBe("updated");
    const ryan = only(h.pages)!.blocks.find((b) => b.staffName.startsWith("Ryan"))!;
    expect(ryan.text).not.toContain("Resend");
    expect(ryan.render.bullets[0]).toBe("17:30-18:30 Sam Student, MHF4U");
  });

  it("AC7: after Charlie unticks and reticks, the next refresh clears the label and keeps the tick", async () => {
    const h = harness();
    await h.run();
    h.tick("Ryan", true);
    h.setOccurrences([h.occ({ startTime: "17:30", endTime: "18:30" })]);
    await h.run("refresh_only");
    const ryan = () => only(h.pages)!.blocks.find((b) => b.staffName.startsWith("Ryan"))!;
    expect(ryan().text).toContain("Resend");
    h.tick("Ryan", false);
    h.tick("Ryan", true);
    expect(await h.run("refresh_only")).toBe("updated");
    expect(ryan().text).not.toContain("Resend");
    expect(ryan().checked).toBe(true);
  });

  it("AC8: nothing changed and nothing labelled makes zero Notion calls", async () => {
    const h = harness();
    await h.run();
    h.calls.length = 0;
    expect(await h.run("refresh_only")).toBe("unchanged");
    expect(h.calls).toEqual([]);
  });

  it("AC1: a teacher who has a class but is not active is listed and marked", async () => {
    const h = harness();
    h.setOccurrences([h.occ({ staffId: OLU })]);
    await h.run();
    expect(only(h.pages)!.blocks.map((b) => b.text)).toContain("Olu (not active in Staff): 1 class");
  });

  it("AC10: a failed refresh is recorded and a later run recovers", async () => {
    let down = false;
    const h = harness({ notionFails: () => down });
    await h.run();
    h.setOccurrences([h.occ({ startTime: "17:30", endTime: "18:30" })]);
    down = true;
    expect(await h.run("refresh_only")).toBe("failed");
    expect(h.row?.state).toBe("failed");
    down = false;
    expect(await h.run("refresh_only")).toBe("updated");
    expect(h.row).toMatchObject({ state: "ready", lastError: null });
  });
});
