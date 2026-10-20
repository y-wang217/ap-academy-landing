import { describe, expect, it } from "vitest";
import { buildSetupStatus, type SetupInput } from "../domain/setup-status";
import * as text from "./setup-text";

const TODAY = "2026-10-16";
const base: SetupInput = {
  teachers: { linked: 1, total: 2, signedIn: 0, missing: ["Kuby Test"] },
  availability: { entered: 0, linked: 1 },
  schedules: { adopted: 0, scheduled: 0, failedSync: 0 },
  parents: { students: 2, claimed: 0, invitedOnly: 0, anyLink: false, missing: [{ id: "a", name: "Ada L." }, { id: "c", name: "Cy M." }] },
  notionRecords: { students: 2, linked: 0, missing: [{ id: "a", name: "Ada L." }, { id: "c", name: "Cy M." }] },
  dailyTask: { missingConfig: [{ name: "cron_secret", problem: "not_set" }], readyDates: [] },
  guard: { ok: true },
};
const line = (input: SetupInput, key: string) => text.countLine(buildSetupStatus(input, TODAY).find((r) => r.key === key)!);

describe("setup copy (AC2, AC4, AC11)", () => {
  it("row labels in order", () => {
    expect(buildSetupStatus(base, TODAY).map((r) => text.ROW_LABELS[r.key])).toEqual([
      "Teachers approved", "Teacher availability", "Student schedules adopted", "Parent links",
      "Notion records on tracker students", "Daily task", "Notion link guard (migration 0017)",
    ]);
  });
  it("the seven while-missing sentences, verbatim", () => {
    expect(text.WHILE_MISSING).toEqual({
      teachers: "Teachers without a link cannot sign in to see their week.",
      availability: "Classes for a teacher with no hours are never checked for conflicts.",
      schedules: "Students not adopted have no classes here, so their teachers and parents see no calendar.",
      parents: "Parents without a link cannot sign in to see their child.",
      notionRecords: "A student without a Notion record shows their parent no calendar and no billing.",
      dailyTask: "Teachers get no daily text of their schedule.",
      guard: "Any teacher could point a student at another child's record.",
    });
    expect(text.ADOPTION_FOOTNOTE).toBe("Students with no Weekly Schedule are adopted by their first booking.");
  });
  it("count lines", () => {
    expect(line(base, "teachers")).toBe("1 of 2 active teachers linked. 0 signed in.");
    expect(line({ ...base, teachers: { linked: 0, total: 0, signedIn: 0, missing: [] } }, "teachers")).toBe("No active teachers in Notion.");
    expect(line(base, "availability")).toBe("0 of 1 linked teachers entered hours.");
    expect(line({ ...base, availability: { entered: 0, linked: 0 } }, "availability")).toBe("No teachers linked yet.");
    expect(line(base, "schedules")).toBe("No active students have a Weekly Schedule yet.");
    expect(line({ ...base, schedules: { adopted: 2, scheduled: 3, failedSync: 1 } }, "schedules")).toBe("2 of 3 active students adopted. 1 failed to sync.");
    expect(line({ ...base, schedules: { adopted: 1, scheduled: 1, failedSync: 0 } }, "schedules")).toBe("1 of 1 active students adopted.");
    expect(line(base, "parents")).toBe("0 of 2 students have a parent signed in. 0 invited, not signed in yet.");
    expect(line({ ...base, parents: { students: 0, claimed: 0, invitedOnly: 0, anyLink: false, missing: [] } }, "parents")).toBe("No students yet.");
    expect(line(base, "notionRecords")).toBe("0 of 2 students linked to Notion.");
    expect(line({ ...base, notionRecords: { students: 0, linked: 0, missing: [] } }, "notionRecords")).toBe("No students yet.");
    expect(line(base, "dailyTask")).toBe("Not set: SCHEDULER_CRON_SECRET.");
    expect(line({ ...base, dailyTask: { missingConfig: [{ name: "notion_token", problem: "not_set" }, { name: "org_id", problem: "not_set" }], readyDates: [] } }, "dailyTask"))
      .toBe("Not set: NOTION_TOKEN, DAILY_TASK_ORG_ID.");
    expect(line({ ...base, dailyTask: { missingConfig: [{ name: "org_id", problem: "other_org" }], readyDates: [] } }, "dailyTask"))
      .toBe("DAILY_TASK_ORG_ID is set to another org.");
    expect(line({ ...base, dailyTask: { missingConfig: [], readyDates: [] } }, "dailyTask")).toBe("Set up. No task is ready for today or yesterday.");
    expect(line({ ...base, dailyTask: { missingConfig: [], readyDates: [TODAY] } }, "dailyTask")).toBe("Set up. A task is ready.");
    expect(line(base, "guard")).toBe("Present.");
    expect(line({ ...base, guard: { ok: false } }, "guard")).toBe("Not present, or turned off.");
  });
  it("Notion and database failures say so, never a zero", () => {
    expect(line({ ...base, teachers: { failed: "notion" } }, "teachers")).toBe("Could not read Notion");
    expect(line({ ...base, schedules: { failed: "notion" } }, "schedules")).toBe("Could not read Notion");
    expect(line({ ...base, parents: { failed: "db" } }, "parents")).toBe("Could not check");
    expect(line({ ...base, guard: { failed: "db" } }, "guard")).toBe("Could not check");
  });
  it("names list caps at 10 and says how many more", () => {
    expect(text.moreLine(12)).toBe("and 2 more");
    expect(text.moreLine(10)).toBeNull();
    expect(text.MAX_NAMES).toBe(10);
  });
  it("badges", () => {
    expect(text.BADGE).toEqual({ done: "Done", partial: "Partial", missing: "Missing", unknown: "Not checked" });
  });
  it("no exported string contains an em-dash", () => {
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(Object.fromEntries(Object.entries(text).filter(([, v]) => typeof v !== "function")));
    for (const row of buildSetupStatus(base, TODAY)) strings.push(text.countLine(row));
    expect(strings.length).toBeGreaterThan(20);
    expect(strings.join("\n")).not.toContain("—");
  });
});
