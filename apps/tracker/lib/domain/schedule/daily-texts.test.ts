import { describe, expect, it } from "vitest";
import { buildTeacherDays, dailyTaskTitle, isDue, planRefresh, type StoredTeacher, type TeacherDay } from "./daily-texts";
import type { Occurrence } from "./recurrence";

const RYAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KUBY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SARA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OLU = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SAM = "11111111-1111-4111-8111-111111111111";
const KIM = "22222222-2222-4222-8222-222222222222";
const DATE = "2026-10-19";

const staff = [
  { id: RYAN, name: "Ryan Test", active: true },
  { id: KUBY, name: "Kuby Test", active: true },
];
const names = new Map([[SAM, "Sam Student"], [KIM, "Kim"]]);
const link = (id: string, date: string) => `https://www.apacademy.ca/tracker/schedule?staffId=${id}&date=${date}`;
let n = 0;
const occ = (over: Partial<Occurrence>): Occurrence => ({
  occurrenceKey: `k${++n}`, seriesId: "s", originalDate: DATE, date: DATE, startTime: "16:00", endTime: "17:00", durationMinutes: 60,
  startsAt: "", endsAt: "", staffId: RYAN, studentId: SAM, subject: "MHF4U", status: "scheduled", kind: "weekly", ...over,
});
const fixture = [occ({}), occ({ startTime: "18:00", endTime: "19:00", studentId: KIM, subject: "SPH3U", kind: "one_off" })];
const build = (occurrences = fixture, s = staff) => buildTeacherDays({ date: DATE, staff: s, occurrences, studentNames: names, scheduleUrl: link });

describe("buildTeacherDays (AC1)", () => {
  it("lists one block per active teacher, ordered by name, classes in time order", () => {
    const days = build([fixture[1], fixture[0]]);
    expect(days.map((d) => d.name)).toEqual(["Kuby Test", "Ryan Test"]);
    const ryan = days.find((d) => d.staffId === RYAN)!;
    expect(ryan.lines.map((l) => l.text)).toEqual(["16:00-17:00 Sam Student, MHF4U", "18:00-19:00 Kim, SPH3U"]);
    expect(ryan.linkUrl).toBe(link(RYAN, DATE));
  });

  it("says there are no classes for a teacher without any", () => {
    const kuby = build().find((d) => d.staffId === KUBY)!;
    expect(kuby.lines).toEqual([]);
    expect(kuby.summary).toBe("No classes scheduled today");
  });

  it("builds the exact message text", () => {
    const [kuby, ryan] = build();
    expect(ryan.copyText).toBe(
      ["Hi Ryan, your classes today (Mon Oct 19):", "16:00-17:00 Sam Student, MHF4U", "18:00-19:00 Kim, SPH3U", `Your schedule: ${link(RYAN, DATE)}`].join("\n"),
    );
    expect(kuby.copyText).toBe("Hi Kuby, no classes scheduled for you today (Mon Oct 19).");
    expect(ryan.copyText).not.toMatch(/—/);
  });

  it("shows a cancelled class with a Cancelled prefix, in the task and the text", () => {
    const ryan = build([occ({ status: "cancelled" })]).find((d) => d.staffId === RYAN)!;
    expect(ryan.lines[0].text).toBe("Cancelled: 16:00-17:00 Sam Student, MHF4U");
    expect(ryan.copyText).toContain("Cancelled: 16:00-17:00 Sam Student, MHF4U");
  });

  it("ignores occurrences on other dates", () => {
    const days = build([occ({ date: "2026-10-20" })]);
    expect(days.every((d) => d.lines.length === 0)).toBe(true);
  });

  it("keeps a no-longer-active teacher who has a class, marked", () => {
    const days = build([occ({ staffId: OLU })]);
    const olu = days.find((d) => d.staffId === OLU)!;
    expect(olu.name).toBe("Unknown teacher");
    expect(olu.notActive).toBe(true);
    expect(olu.title).toContain("(not active in Staff)");
    expect(days.some((d) => d.staffId === SARA)).toBe(false);
  });

  it("uses the inactive teacher's name when staff lists them as inactive", () => {
    const days = build([occ({ staffId: OLU })], [...staff, { id: OLU, name: "Olu", active: false }]);
    expect(days.find((d) => d.staffId === OLU)).toMatchObject({ name: "Olu", notActive: true });
    expect(days.some((d) => d.name === "Olu" && !d.notActive)).toBe(false);
  });

  it("leaves out an inactive teacher with no class", () => {
    const days = build(fixture, [...staff, { id: OLU, name: "Olu", active: false }]);
    expect(days.map((d) => d.staffId)).toEqual([KUBY, RYAN]);
  });

  it("changes the fingerprint only when the day changes", () => {
    const a = build().find((d) => d.staffId === RYAN)!;
    const same = build().find((d) => d.staffId === RYAN)!;
    const moved = build([occ({ startTime: "17:30", endTime: "18:30" }), fixture[1]]).find((d) => d.staffId === RYAN)!;
    expect(same.fingerprint).toBe(a.fingerprint);
    expect(moved.fingerprint).not.toBe(a.fingerprint);
    expect(moved.copyText).toContain("17:30-18:30");
  });
});

describe("dailyTaskTitle and isDue (AC2, AC4)", () => {
  it("builds the title", () => expect(dailyTaskTitle(DATE)).toBe("Text teachers their schedules — 2026-10-19"));
  it("is due from the configured local time", () => {
    expect(isDue("05:59", "06:00")).toBe(false);
    expect(isDue("06:00", "06:00")).toBe(true);
    expect(isDue("07:10", "07:30")).toBe(false);
    expect(isDue("07:35", "07:30")).toBe(true);
  });
});

const day = (fingerprint: string): TeacherDay => ({ staffId: RYAN, name: "Ryan Test", fingerprint } as TeacherDay);
const stored = (over: Partial<StoredTeacher> = {}): StoredTeacher => ({
  staffId: RYAN, blockId: "b1", writtenFingerprint: "A", writtenAt: "2026-10-19T10:00:00.000Z", acknowledgedFingerprint: null, labelled: false, ...over,
});
const unchecked = new Map([["b1", { checked: false, lastEditedTime: "2026-10-19T10:00:00.000Z" }]]);
const tickedLater = new Map([["b1", { checked: true, lastEditedTime: "2026-10-19T12:00:00.000Z" }]]);

describe("planRefresh (AC5 to AC8)", () => {
  it("labels a checked teacher whose day changed", () => {
    const plan = planRefresh([stored()], [day("B")], tickedLater)[0];
    expect(plan).toMatchObject({ write: true, label: true, acknowledged: "A" });
  });
  it("does not label an unchecked teacher whose day changed", () => {
    const plan = planRefresh([stored()], [day("B")], unchecked)[0];
    expect(plan).toMatchObject({ write: true, label: false, acknowledged: null });
  });
  it("keeps the label while the tick is unchanged since our write", () => {
    const plan = planRefresh([stored({ writtenFingerprint: "B", acknowledgedFingerprint: "A", labelled: true })], [day("B")], new Map([["b1", { checked: true, lastEditedTime: "2026-10-19T10:00:00.000Z" }]]))[0];
    expect(plan).toMatchObject({ write: false, label: true, acknowledged: "A" });
  });
  it("clears the label when Charlie unticks and reticks after our write", () => {
    const plan = planRefresh([stored({ writtenFingerprint: "B", acknowledgedFingerprint: "A", labelled: true })], [day("B")], tickedLater)[0];
    expect(plan).toMatchObject({ write: true, label: false, acknowledged: "B" });
  });
  it("writes nothing when nothing changed", () => {
    expect(planRefresh([stored()], [day("A")], unchecked)[0]).toMatchObject({ write: false, label: false });
  });
  it("appends a teacher who has no block yet", () => {
    const plan = planRefresh([], [day("A")], new Map());
    expect(plan[0]).toMatchObject({ isNew: true, write: true, label: false });
  });
  it("recreates a block that was deleted in Notion", () => {
    expect(planRefresh([stored()], [day("A")], new Map())[0]).toMatchObject({ isNew: true, write: true });
  });
});
