import { describe, expect, it } from "vitest";
import { planImport, type StaffLike, type StudentInput } from "./import-plan";
import { SHAPE_FIXTURES, withTeacher } from "./legacy-line.fixtures";

const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";
// 2026-10-14 is a Wednesday.
const TODAY = "2026-10-14";

const staff = (over: Partial<StaffLike> & { id: string; name: string }): StaffLike => ({ status: "Active", functions: ["Teacher"], ...over });
const jane = staff({ id: T1, name: "Jane Doe" });
const student = (id: string, text: string, stage = "Active"): StudentInput => ({ id, name: `Student ${id.slice(0, 2)}`, stage, weeklySchedule: text });
const plan = (students: StudentInput[], list: StaffLike[] = [jane], adopted: string[] = []) =>
  planImport({ students, staff: list, today: TODAY, adoptedStudentIds: new Set(adopted) });

describe("planImport", () => {
  it("AC4: matches the full name ignoring case and repeated spaces", () => {
    const r = plan([student(S1, "Tue 17:30-18:30 | Math | jane   DOE")]);
    expect(r.adopt).toHaveLength(1);
    expect(r.adopt[0].series[0]).toMatchObject({ staffId: T1, subject: "Math", weekday: 2, startTime: "17:30", durationMinutes: 60 });
  });

  it("AC4: a first name alone is teacher_not_found, with a hint that is never applied", () => {
    const r = plan([student(S1, "Tue 17:30-18:30 | Math | Jane")]);
    expect(r.adopt).toHaveLength(0);
    const line = r.repair[0].lines[0];
    expect(line.status).toBe("teacher_not_found");
    expect(line.hint).toContain("Jane Doe");
  });

  it("AC4: two active staff with the same name are teacher_ambiguous", () => {
    const r = plan([student(S1, "Tue 17:30-18:30 | Math | Jane Doe")], [jane, staff({ id: T2, name: "Jane Doe" })]);
    expect(r.repair[0].lines[0].status).toBe("teacher_ambiguous");
  });

  it("AC4: a match only to inactive staff is teacher_inactive; one active among two resolves", () => {
    const gone = staff({ id: T2, name: "Jane Doe", status: "Inactive" });
    expect(plan([student(S1, "Tue 17:30-18:30 | Math | Jane Doe")], [gone]).repair[0].lines[0].status).toBe("teacher_inactive");
    const nonTeaching = staff({ id: T2, name: "Jane Doe", functions: ["Closer"] });
    expect(plan([student(S1, "Tue 17:30-18:30 | Math | Jane Doe")], [nonTeaching]).repair[0].lines[0].status).toBe("teacher_inactive");
    expect(plan([student(S1, "Tue 17:30-18:30 | Math | Jane Doe")], [gone, jane]).adopt).toHaveLength(1);
  });

  it("AC5: one bad line holds back the whole student; all lines are listed", () => {
    const r = plan([student(S1, "Tue 17:30-18:30 | Math | Jane Doe\nWed 19:00-20:00 | Math")]);
    expect(r.adopt).toHaveLength(0);
    expect(r.repair).toHaveLength(1);
    expect(r.repair[0].lines.map((l) => l.status)).toEqual(["ok", "missing_teacher"]);
    expect(r.repair[0].lines[0].text).toBe("Tue 17:30-18:30 | Math | Jane Doe");
  });

  it("AC3: the same slot twice for one student is duplicate_line", () => {
    const r = plan([student(S1, "Tue 17:30-18:30 | Math | Jane Doe\nTUE 5:30pm-6:30pm | math | Jane Doe")]);
    expect(r.repair[0].lines.map((l) => l.status)).toEqual(["ok", "duplicate_line"]);
  });

  it("AC6: only Active and Onboarding students with text are considered; adopted ones are skipped", () => {
    const r = plan(
      [
        student(S1, "Tue 17:30-18:30 | Math | Jane Doe", "Paused"),
        student(S2, "", "Active"),
        student(S3, "Tue 17:30-18:30 | Math | Jane Doe", "Onboarding"),
      ],
    );
    expect(r.adopt.map((a) => a.studentId)).toEqual([S3]);
    expect(r.repair).toEqual([]);
    const again = plan([student(S3, "Tue 17:30-18:30 | Math | Jane Doe")], [jane], [S3]);
    expect(again.adopt).toEqual([]);
    expect(again.skipped).toEqual([{ studentId: S3, reason: "adopted" }]);
  });

  it("AC8: start_date is the next matching weekday on or after today, today included", () => {
    const r = plan([student(S1, "Wed 17:30-18:30 | A | Jane Doe\nTue 17:30-18:30 | B | Jane Doe\nThu 17:30-18:30 | C | Jane Doe")]);
    const byDay = Object.fromEntries(r.adopt[0].series.map((s) => [s.subject, s.startDate]));
    expect(byDay).toEqual({ A: "2026-10-14", B: "2026-10-20", C: "2026-10-15" });
    expect(r.adopt[0].sourceText).toContain("Wed 17:30");
  });

  it("AC7: request seeds are stable across runs and differ per line", () => {
    const a = plan([student(S1, "Tue 17:30-18:30 | Math | Jane Doe\nFri 17:30-18:30 | Math | Jane Doe")]);
    const b = plan([student(S1, "Fri 17\\:30-18\\:30 \\| MATH \\| jane doe<br>Tue 17:30-18:30 | Math | Jane Doe")]);
    const seeds = (r: typeof a) => r.adopt[0].series.map((s) => s.requestSeed).sort();
    expect(seeds(a)).toEqual(seeds(b));
    expect(new Set(seeds(a)).size).toBe(2);
    expect(seeds(a)[0]).toContain(S1);
    const other = plan([student(S2, "Tue 17:30-18:30 | Math | Jane Doe")]);
    expect(other.adopt[0].series[0].requestSeed).not.toBe(a.adopt[0].series[0].requestSeed);
  });

  it("shape fixtures: as written nobody is adopted and every line is listed for repair", () => {
    const students = SHAPE_FIXTURES.map((f, i) => student(`${i}0000000-0000-4000-8000-000000000000`, f.text, f.stage));
    const r = plan(students);
    expect(r.adopt).toEqual([]);
    expect(r.repair).toHaveLength(7);
    expect(r.repair.flatMap((x) => x.lines)).toHaveLength(14);
  });

  it("shape fixtures: with a teacher added, only the no-time student stays in repair", () => {
    const students = SHAPE_FIXTURES.map((f, i) => student(`${i}0000000-0000-4000-8000-000000000000`, withTeacher(f.text, "Jane Doe"), f.stage));
    const r = plan(students);
    expect(r.adopt).toHaveLength(6);
    expect(r.repair).toHaveLength(1);
    expect(r.repair[0].lines.map((l) => l.status)).toEqual(["no_fixed_time", "no_fixed_time", "no_fixed_time"]);
  });
});
