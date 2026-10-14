import { describe, expect, it } from "vitest";
import { SHAPE_FIXTURES, withTeacher } from "./legacy-line.fixtures";
import { canonicalLine, normaliseScheduleText, parseScheduleLine } from "./legacy-line";

const CANON = "Tue 17:30-18:30 | MPM2D Math | Jane Doe";
const expected = { ok: true, weekday: 2, startTime: "17:30", durationMinutes: 60, subject: "MPM2D Math", teacherName: "Jane Doe" };

describe("parseScheduleLine", () => {
  it("AC1: parses the canonical line", () => {
    expect(parseScheduleLine(CANON)).toEqual(expected);
  });

  it("AC2: every legacy form equals the canonical result", () => {
    const variants = [
      "Tue 17\\:30-18\\:30 \\| MPM2D Math \\| Jane Doe",
      "Tue 17:30–18:30 | MPM2D Math | Jane Doe",
      "Tue 17:30—18:30 | MPM2D Math | Jane Doe",
      "Tue 17:30 to 18:30 | MPM2D Math | Jane Doe",
      "tue 17:30-18:30 | MPM2D Math | Jane Doe",
      "TUESDAY 17:30-18:30 | MPM2D Math | Jane Doe",
      "Tues 17:30-18:30 | MPM2D Math | Jane Doe",
      "  Tue   17:30 - 18:30   |  MPM2D   Math  |  Jane   Doe ",
      "Tue 5:30pm-6:30pm | MPM2D Math | Jane Doe",
      "Tue 5:30 PM - 6:30 PM | MPM2D Math | Jane Doe",
    ];
    for (const v of variants) expect(parseScheduleLine(v), v).toEqual(expected);
  });

  it("AC2: day aliases and single-digit hours", () => {
    const day = (d: string) => parseScheduleLine(`${d} 9:00-10:00 | Math | A B`);
    expect(day("Thur")).toMatchObject({ ok: true, weekday: 4, startTime: "09:00" });
    expect(day("Thurs")).toMatchObject({ weekday: 4 });
    expect(day("Thursday")).toMatchObject({ weekday: 4 });
    expect(day("Mon")).toMatchObject({ weekday: 1 });
    expect(day("Wednesday")).toMatchObject({ weekday: 3 });
    expect(day("Sun")).toMatchObject({ weekday: 7 });
    expect(parseScheduleLine("Sat 12:00am-1:00am | Math | A B")).toMatchObject({ startTime: "00:00", durationMinutes: 60 });
    expect(parseScheduleLine("Sat 12:00pm-1:00pm | Math | A B")).toMatchObject({ startTime: "12:00", durationMinutes: 60 });
  });

  it("AC3: one reason code per rejected line", () => {
    const reason = (l: string) => {
      const r = parseScheduleLine(l);
      return r.ok ? "ok" : r.reason;
    };
    expect(reason("Funday 17:30-18:30 | Math | A B")).toBe("unparseable_day");
    expect(reason("17:30-18:30 | Math | A B")).toBe("unparseable_day");
    expect(reason("Tue evening | Math | A B")).toBe("unparseable_time");
    expect(reason("Tue 25:00-26:00 | Math | A B")).toBe("unparseable_time");
    expect(reason("Tue 1h | SBI4U Biology")).toBe("no_fixed_time");
    expect(reason("Tue 1.5 hours | SBI4U Biology | A B")).toBe("no_fixed_time");
    expect(reason("Tue 18:30-18:30 | Math | A B")).toBe("invalid_duration");
    expect(reason("Tue 19:00-18:00 | Math | A B")).toBe("invalid_duration");
    expect(reason("Tue 18:00-18:07 | Math | A B")).toBe("invalid_duration");
    expect(reason("Tue 18:03-19:03 | Math | A B")).toBe("invalid_duration");
    expect(reason("Tue 18:00-18:10 | Math | A B")).toBe("invalid_duration");
    expect(reason("Tue 08:00-16:05 | Math | A B")).toBe("invalid_duration");
    expect(reason("Tue 08:00-16:00 | Math | A B")).toBe("ok");
    expect(reason("Tue 17:30-18:30")).toBe("missing_course");
    expect(reason("Tue 17:30-18:30 |  | A B")).toBe("missing_course");
    expect(reason("Wed 19:00-20:00 | Math")).toBe("missing_teacher");
    expect(reason("Wed 19:00-20:00 | Math | ")).toBe("missing_teacher");
    expect(reason("Wed 19:00-20:00 | Math | A B | from 2026-11-01")).toBe("extra_fields");
  });

  it("canonicalLine round-trips", () => {
    const p = parseScheduleLine(CANON);
    if (!p.ok) throw new Error("expected ok");
    expect(canonicalLine(p)).toBe(CANON);
  });
});

describe("normaliseScheduleText", () => {
  it("unescapes, splits on <br> and CRLF, and drops blank lines", () => {
    const lines = normaliseScheduleText("Wed 19\\:00-20\\:00 \\| Math<br>Sun 15:00-16:00 | Chem\r\n\r\n  \n<br/>Fri 9:00-10:00 | X");
    expect(lines).toEqual(["Wed 19:00-20:00 | Math", "Sun 15:00-16:00 | Chem", "Fri 9:00-10:00 | X"]);
  });
});

describe("shape fixtures", () => {
  it("with a teacher added every line parses except the no-time form", () => {
    let ok = 0;
    let noTime = 0;
    for (const f of SHAPE_FIXTURES) {
      for (const line of normaliseScheduleText(withTeacher(f.text, "Jane Doe"))) {
        const r = parseScheduleLine(line);
        if (r.ok) ok++;
        else if (r.reason === "no_fixed_time") noTime++;
        else throw new Error(`${line}: ${r.reason}`);
      }
    }
    expect(ok).toBe(11);
    expect(noTime).toBe(3);
  });

  it("as written, none names a teacher so none parses", () => {
    for (const f of SHAPE_FIXTURES) {
      for (const line of normaliseScheduleText(f.text)) expect(parseScheduleLine(line).ok).toBe(false);
    }
  });
});
