import { describe, expect, it } from "vitest";
import { todayIso } from "../time";
import { buildSetupStatus, dailyTaskConfig, ROW_ORDER, type SetupInput, type SetupRow } from "./setup-status";

const TODAY = "2026-10-16";
const ok: SetupInput = {
  teachers: { linked: 2, total: 2, signedIn: 1, missing: [] },
  availability: { entered: 1, linked: 1 },
  schedules: { adopted: 2, scheduled: 2, failedSync: 0 },
  parents: { students: 2, claimed: 2, invitedOnly: 0, anyLink: true, missing: [] },
  notionRecords: { students: 2, linked: 2, missing: [] },
  dailyTask: { missingConfig: [], readyDates: [TODAY] },
  guard: { ok: true },
};
const zero: SetupInput = {
  teachers: { linked: 0, total: 0, signedIn: 0, missing: [] },
  availability: { entered: 0, linked: 0 },
  schedules: { adopted: 0, scheduled: 0, failedSync: 0 },
  parents: { students: 0, claimed: 0, invitedOnly: 0, anyLink: false, missing: [] },
  notionRecords: { students: 0, linked: 0, missing: [] },
  dailyTask: { missingConfig: [{ name: "org_id", problem: "not_set" }], readyDates: [] },
  guard: { ok: false },
};
const stateOf = (rows: SetupRow[], key: SetupRow["key"]) => rows.find((r) => r.key === key)!.state;
const states = (rows: SetupRow[]) => Object.fromEntries(rows.map((r) => [r.key, r.state]));

describe("buildSetupStatus counts (AC3)", () => {
  it("returns the seven rows in AC2 order", () => {
    expect(buildSetupStatus(ok, TODAY).map((r) => r.key)).toEqual([...ROW_ORDER]);
    expect(ROW_ORDER).toEqual(["teachers", "availability", "schedules", "parents", "notionRecords", "dailyTask", "guard"]);
  });
  it("everything filled in is Done", () => {
    expect(Object.values(states(buildSetupStatus(ok, TODAY)))).toEqual(Array(7).fill("done"));
  });
  it("all-zero input is Missing on every row (the fresh database case)", () => {
    expect(Object.values(states(buildSetupStatus(zero, TODAY)))).toEqual(Array(7).fill("missing"));
  });
  it.each([
    ["teachers", { teachers: { linked: 0, total: 2, signedIn: 0, missing: ["A", "B"] } }, "missing"],
    ["teachers", { teachers: { linked: 1, total: 2, signedIn: 0, missing: ["B"] } }, "partial"],
    ["availability", { availability: { entered: 0, linked: 2 } }, "missing"],
    ["availability", { availability: { entered: 1, linked: 2 } }, "partial"],
    ["availability", { availability: { entered: 0, linked: 0 } }, "missing"],
    ["schedules", { schedules: { adopted: 0, scheduled: 2, failedSync: 0 } }, "missing"],
    ["schedules", { schedules: { adopted: 1, scheduled: 2, failedSync: 0 } }, "partial"],
    ["notionRecords", { notionRecords: { students: 2, linked: 0, missing: [] } }, "missing"],
    ["notionRecords", { notionRecords: { students: 2, linked: 1, missing: [] } }, "partial"],
  ] as const)("%s: %j is %s", (key, patch, want) => {
    expect(stateOf(buildSetupStatus({ ...ok, ...patch } as SetupInput, TODAY), key)).toBe(want);
  });
  it("schedules all adopted but one failed to sync is Partial", () => {
    expect(stateOf(buildSetupStatus({ ...ok, schedules: { adopted: 2, scheduled: 2, failedSync: 1 } }, TODAY), "schedules")).toBe("partial");
  });
  it("parent links: none at all is Missing, links but none claimed is Partial, some claimed is Partial", () => {
    const p = (v: Partial<Extract<SetupInput["parents"], { students: number }>>) =>
      stateOf(buildSetupStatus({ ...ok, parents: { students: 2, claimed: 0, invitedOnly: 0, anyLink: false, missing: [], ...v } }, TODAY), "parents");
    expect(p({})).toBe("missing");
    expect(p({ anyLink: true, invitedOnly: 2 })).toBe("partial");
    expect(p({ anyLink: true, claimed: 1 })).toBe("partial");
    expect(p({ anyLink: true, claimed: 2 })).toBe("done");
    expect(p({ students: 0, anyLink: false })).toBe("missing");
  });
  it("guard false is Missing", () => {
    expect(stateOf(buildSetupStatus({ ...ok, guard: { ok: false } }, TODAY), "guard")).toBe("missing");
  });
});

describe("failures never read as zero (AC4, AC5)", () => {
  it("a Notion failure on Staff marks only Teachers approved unknown", () => {
    const rows = buildSetupStatus({ ...ok, teachers: { failed: "notion" } }, TODAY);
    expect(states(rows)).toEqual({ ...states(buildSetupStatus(ok, TODAY)), teachers: "unknown" });
    expect(rows.find((r) => r.key === "teachers")!.failed).toBe("notion");
  });
  it("a Notion failure on scheduled students marks only Student schedules adopted unknown", () => {
    const rows = buildSetupStatus({ ...ok, schedules: { failed: "notion" } }, TODAY);
    expect(states(rows)).toEqual({ ...states(buildSetupStatus(ok, TODAY)), schedules: "unknown" });
  });
  it.each(["teachers", "availability", "schedules", "parents", "notionRecords", "dailyTask", "guard"] as const)("a database failure on %s marks only that row", (key) => {
    const rows = buildSetupStatus({ ...ok, [key]: { failed: "db" } }, TODAY);
    expect(states(rows)).toEqual({ ...states(buildSetupStatus(ok, TODAY)), [key]: "unknown" });
    const row = rows.find((r) => r.key === key)!;
    expect(row.failed).toBe("db");
    expect(row.facts).toBeNull();
  });
});

describe("dailyTaskConfig and the Daily task row (AC6)", () => {
  const ORG = "10000000-0000-0000-0000-00000000aaaa";
  const env = { workConfigured: true, cronSecretSet: true, orgIdEnv: ORG };
  it("all set gives no failing check", () => {
    expect(dailyTaskConfig(env, ORG)).toEqual([]);
  });
  it("names each failing check", () => {
    expect(dailyTaskConfig({ ...env, workConfigured: false }, ORG)).toEqual([{ name: "notion_token", problem: "not_set" }]);
    expect(dailyTaskConfig({ ...env, cronSecretSet: false }, ORG)).toEqual([{ name: "cron_secret", problem: "not_set" }]);
    expect(dailyTaskConfig({ ...env, orgIdEnv: undefined }, ORG)).toEqual([{ name: "org_id", problem: "not_set" }]);
    expect(dailyTaskConfig({ ...env, orgIdEnv: "" }, ORG)).toEqual([{ name: "org_id", problem: "not_set" }]);
    expect(dailyTaskConfig({ ...env, orgIdEnv: "10000000-0000-0000-0000-000000000002" }, ORG)).toEqual([{ name: "org_id", problem: "other_org" }]);
  });
  const daily = (v: Extract<SetupInput["dailyTask"], { readyDates: string[] }>, today = TODAY) =>
    stateOf(buildSetupStatus({ ...ok, dailyTask: v }, today), "dailyTask");
  it("any failing check is Missing, even with a ready task", () => {
    expect(daily({ missingConfig: [{ name: "cron_secret", problem: "not_set" }], readyDates: [TODAY] })).toBe("missing");
  });
  it("all set with no ready row is Partial; ready today or yesterday is Done; two days ago is Partial", () => {
    expect(daily({ missingConfig: [], readyDates: [] })).toBe("partial");
    expect(daily({ missingConfig: [], readyDates: ["2026-10-16"] })).toBe("done");
    expect(daily({ missingConfig: [], readyDates: ["2026-10-15"] })).toBe("done");
    expect(daily({ missingConfig: [], readyDates: ["2026-10-14"] })).toBe("partial");
  });
  it("time zone: just after Toronto midnight, yesterday is the 16th (AC14)", () => {
    const today = todayIso(new Date("2026-10-17T04:05:00Z"));
    expect(today).toBe("2026-10-17");
    expect(daily({ missingConfig: [], readyDates: ["2026-10-16"] }, today)).toBe("done");
    expect(daily({ missingConfig: [], readyDates: ["2026-10-15"] }, today)).toBe("partial");
  });
  it("time zone: at 23:30 Toronto, today is still the 16th, not the UTC date", () => {
    expect(todayIso(new Date("2026-10-17T03:30:00Z"))).toBe("2026-10-16");
  });
});
