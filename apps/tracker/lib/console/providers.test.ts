import { describe, expect, it, vi } from "vitest";
import { notionFake, v } from "../notion/console-reader.fake";
import type { Db } from "../data/client";
import type { OwnerViewer } from "./guard";
import { consoleFreshness, createConsoleDeps, sharePeopleRead } from "./providers";

// REQ-54 AC2: one module-level freshness record, shared by every request on this server instance.
const viewer = (orgId: string): OwnerViewer => ({ kind: "staff", userId: "u", email: "o@example.com", orgId, role: "owner", db: { tracker: {} } as unknown as Db });

describe("createConsoleDeps", () => {
  it("two calls with different viewers share the one consoleFreshness Map", () => {
    const a = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000aaaa"));
    const b = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000bbbb"));
    expect(a.freshness).toBe(consoleFreshness);
    expect(b.freshness).toBe(consoleFreshness);
    expect(a.orgId).not.toBe(b.orgId);
  });

  it("uses the TUNING limits and the configured data source ids", () => {
    const d = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000aaaa"));
    expect({ timeoutMs: d.timeoutMs, maxPages: d.maxPages, perStudent: d.touchesPerStudent, days: d.touchesWindowDays }).toEqual({ timeoutMs: 8_000, maxPages: 10, perStudent: 5, days: 90 });
    expect(d.sources.touches).toBe("772939bd-bd88-4272-9f1f-20ce75ef2204");
    expect(d.sources.leads).toBe("fe3d651a-70c6-4d1e-8a38-656163d6bc63");
  });
});

// REQ-56 AC11: the console page reads the people copy once, shared by the facade and the north star.
describe("sharePeopleRead", () => {
  const snapshot = { students: [], staff: [], syncedAt: null };
  it("calls the underlying reader once and returns the same value to every caller", async () => {
    const base = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000aaaa"));
    let calls = 0;
    const shared = sharePeopleRead({ ...base, people: async () => (calls++, snapshot) });
    const [a, b] = await Promise.all([shared.people(), shared.people()]);
    expect(await shared.people()).toBe(a);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });
  it("shares a rejection instead of retrying", async () => {
    const base = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000aaaa"));
    let calls = 0;
    const shared = sharePeopleRead({ ...base, people: async () => { calls++; throw new Error("unavailable"); } });
    await expect(shared.people()).rejects.toThrow("unavailable");
    await expect(shared.people()).rejects.toThrow("unavailable");
    expect(calls).toBe(1);
  });
  it("passes every other dep through unchanged", () => {
    const base = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000aaaa"));
    const shared = sharePeopleRead(base);
    const withoutPeople = (d: typeof base) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "people"));
    expect(withoutPeople(shared)).toEqual(withoutPeople(base));
    expect(shared.people).not.toBe(base.people);
    expect(shared.freshness).toBe(base.freshness);
  });
});

// REQ-58 AC10: the facade and the operations builder share the one people read.
describe("the operations builder and the facade", () => {
  it("invoke deps.people once between them", async () => {
    const { loadConsolePanels } = await import("./facade");
    const { loadOperationsPanels } = await import("./operations");
    const base = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000aaaa"));
    let calls = 0;
    const deps = sharePeopleRead({ ...base, notion: null, people: async () => (calls++, { students: [], staff: [], syncedAt: null }) });
    const empty = async () => [];
    await Promise.all([
      loadConsolePanels(deps),
      loadOperationsPanels({
        reader: { schedule: async () => ({ series: [], exceptions: [] }), availability: empty, outcomes: empty, unlinkedLessons: async () => ({ ok: false, code: "not_configured" }) },
        people: deps.people, now: new Date("2026-10-22T20:00:00Z"), gapDays: 14, orgId: deps.orgId, lessonsSourceId: deps.sources.trialLessons,
        query: {}, freshness: new Map(), timeoutMs: 1_000,
      }),
    ]);
    expect(calls).toBe(1);
  });

  it("createOperationsLessons is null without a Notion token", async () => {
    const { createOperationsLessons } = await import("./providers");
    const saved = process.env.NOTION_TOKEN;
    delete process.env.NOTION_TOKEN;
    try {
      expect(createOperationsLessons()).toBeNull();
    } finally {
      if (saved !== undefined) process.env.NOTION_TOKEN = saved;
    }
  });
});

// REQ-60 AC9: the work port joins Task Type names in the same provider; a failed name read leaves them null.
describe("the work port's Task Type names", () => {
  const WORK = "3031b455-9be0-4f8d-b200-70fcfcf1a0b8";
  const TYPES = "80e411f2-eb5b-4055-b560-55061669d9f7";
  const TYPE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const WORK_SCHEMA = { Name: "title", Area: "ar", State: "sa", Type: "ty", "Due / Review": "du", Owner: "ow", "Task Type": "tt", "Parent Project": "pp", "Expected result": "er" };
  const task = (types: string[]) => ({
    object: "page", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", properties: {
      Name: v.title("Script 01"), Area: v.select("Marketing"), State: v.select("Next"), Type: v.select("Task"), "Task Type": v.rel(...types),
    },
  });
  async function readWork(types: string[], typesStatus?: number) {
    const work = notionFake({ dataSourceId: WORK, schema: WORK_SCHEMA, pages: [[task(types)]] });
    const names = notionFake({ dataSourceId: TYPES, schema: { "Task type": "title" }, pages: [[{ object: "page", id: TYPE_ID, properties: { "Task type": v.title("Script") } }]], queryStatus: typesStatus });
    const urls: string[] = [];
    vi.stubGlobal("fetch", (async (url: string, init?: RequestInit) => {
      urls.push(url);
      return (url.includes(TYPES) ? names.fetcher : work.fetcher)(url, init);
    }) as typeof fetch);
    const saved = process.env.NOTION_TOKEN;
    process.env.NOTION_TOKEN = "t";
    try {
      const deps = createConsoleDeps(viewer("10000000-0000-0000-0000-00000000aaaa"));
      const read = await deps.notion!.work({ signal: new AbortController().signal, maxPages: 10 });
      return { read, urls };
    } finally {
      if (saved === undefined) delete process.env.NOTION_TOKEN;
      else process.env.NOTION_TOKEN = saved;
      vi.unstubAllGlobals();
    }
  }

  it("fills each Task Type's name", async () => {
    const { read, urls } = await readWork([TYPE_ID]);
    expect(read.rows[0].taskTypes).toEqual([{ id: TYPE_ID, name: "Script" }]);
    expect(urls.some((u) => u.includes(TYPES))).toBe(true);
  });

  it("makes no name request when no row has a Task Type", async () => {
    const { read, urls } = await readWork([]);
    expect(read.rows[0].taskTypes).toEqual([]);
    expect(urls.some((u) => u.includes(TYPES))).toBe(false);
  });

  it("a failing name read leaves names null and the port resolves", async () => {
    const { read } = await readWork([TYPE_ID], 500);
    expect(read.rows[0].taskTypes).toEqual([{ id: TYPE_ID, name: null }]);
    expect(read.complete).toBe(true);
  });
});
