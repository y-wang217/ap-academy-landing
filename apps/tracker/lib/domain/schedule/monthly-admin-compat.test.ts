import { describe, expect, it } from "vitest";
import { planImport } from "./import-plan";
import { normaliseScheduleText } from "./legacy-line";
import { SHAPE_FIXTURES, withTeacher } from "./legacy-line.fixtures";
import { renderSummary } from "./summary";
import type { ClassSeries } from "./recurrence";

/**
 * A line-for-line TypeScript port of `parse_slot` in the ap-academy-monthly-admin
 * skill's build_month.py (the skill lives outside this repo; compared against
 * its published source on 2026-10-14):
 *
 *   left, _, course = line.partition("|"); course = course.split("|")[0].strip() or "Tutoring"
 *   re.match(r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})", left.strip())
 *   re.match(r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([\d.]+)\s*h", left.strip())   # "Tue 1h | ENG4U English"
 *   otherwise: raise ValueError (which stops the whole monthly run)
 *
 * If the skill's parser changes, recheck this port: it is what keeps a
 * generated summary from stopping a billing run.
 */
function monthlyAdminParseSlot(text: string) {
  const out: { day: string; start: string | null; end: string | null; hours: number; course: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bar = line.indexOf("|");
    const left = (bar < 0 ? line : line.slice(0, bar)).trim();
    const course = (bar < 0 ? "" : line.slice(bar + 1).split("|")[0].trim()) || "Tutoring";
    const range = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(left);
    if (range) {
      const [, day, h1, m1, h2, m2] = range;
      const hours = (Number(h2) * 60 + Number(m2) - (Number(h1) * 60 + Number(m1))) / 60;
      out.push({ day, start: `${h1.padStart(2, "0")}:${m1}`, end: `${h2.padStart(2, "0")}:${m2}`, hours, course });
      continue;
    }
    const hoursOnly = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([\d.]+)\s*h/.exec(left);
    if (hoursOnly) {
      out.push({ day: hoursOnly[1], start: null, end: null, hours: Number(hoursOnly[2]), course });
      continue;
    }
    throw new Error(`Cannot parse schedule line: ${line}`);
  }
  return out;
}

const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TODAY = "2026-10-14";
const staff = [{ id: T1, name: "Jane Doe", status: "Active", functions: ["Teacher"] }];
const NAMES = new Map([[T1, "Jane Doe"]]);

function seriesFor(text: string): ClassSeries[] {
  const r = planImport({
    students: [{ id: "11111111-1111-4111-8111-111111111111", name: "S", stage: "Active", weeklySchedule: text }],
    staff, today: TODAY, adoptedStudentIds: new Set(),
  });
  return r.adopt.flatMap((a) => a.series.map((s, i) => ({
    id: `5000000${i}-0000-4000-8000-000000000000`, staffId: s.staffId, studentId: a.studentId, subject: s.subject, kind: "weekly" as const,
    startDate: s.startDate, startTime: s.startTime, durationMinutes: s.durationMinutes, effectiveUntil: null,
  })));
}

describe("generated summary vs the monthly admin parser", () => {
  const clean = SHAPE_FIXTURES.map((f) => withTeacher(f.text, "Jane Doe")).filter((t) => !t.includes(" 1h "));

  it("AC11: every rendered line parses and matches its source line", () => {
    for (const text of clean) {
      const rendered = renderSummary(seriesFor(text), NAMES, TODAY);
      const parsedOut = monthlyAdminParseSlot(rendered);
      const parsedIn = monthlyAdminParseSlot(normaliseScheduleText(text).join("\n"));
      const key = (s: { day: string; start: string | null; end: string | null; hours: number; course: string }) => JSON.stringify(s);
      expect(parsedOut.map(key).sort()).toEqual(parsedIn.map(key).sort());
    }
  });

  it("AC11: lines with from and until fields still parse and keep the course", () => {
    const text = "Tue 17:30-18:30 | MPM2D Math | Jane Doe | from 2026-11-03 | until 2026-12-01";
    expect(monthlyAdminParseSlot(text)).toEqual([{ day: "Tue", start: "17:30", end: "18:30", hours: 1, course: "MPM2D Math" }]);
  });

  it("AC12: round trip gives the same set of slots as the legacy text", () => {
    for (const text of clean) {
      const legacy = monthlyAdminParseSlot(text).map((s) => JSON.stringify(s)).sort();
      const roundTrip = monthlyAdminParseSlot(renderSummary(seriesFor(text), NAMES, TODAY)).map((s) => JSON.stringify(s)).sort();
      expect(roundTrip).toEqual(legacy);
    }
  });

  it("the 'Day Nh' form: billing still reads it, the scheduler never generates it, and importing it is refused", () => {
    // Billing accepts it, so a student whose legacy text uses it keeps billing correctly while unadopted.
    expect(monthlyAdminParseSlot("Tue 1h | SBI4U Biology")).toEqual([{ day: "Tue", start: null, end: null, hours: 1, course: "SBI4U Biology" }]);
    // The import rejects it (no_fixed_time), so such a student, and any student with such a line, is not
    // adopted: their Weekly Schedule is never overwritten and billing keeps reading the legacy text.
    const text = "Tue 1h | SBI4U Biology | Jane Doe\nFri 17:30-18:30 | SBI4U Biology | Jane Doe";
    const plan = planImport({
      students: [{ id: "11111111-1111-4111-8111-111111111111", name: "S", stage: "Active", weeklySchedule: text }],
      staff, today: TODAY, adoptedStudentIds: new Set(),
    });
    expect(plan.adopt).toEqual([]);
    expect(plan.repair[0].lines.map((l) => l.status)).toEqual(["no_fixed_time", "ok"]);
    // Every rendered summary is fixed-time only, so it never contains the form.
    for (const t of clean) expect(renderSummary(seriesFor(t), NAMES, TODAY)).not.toMatch(/^\w{3} [\d.]+h\b/m);
  });

  it("the copy raises on a header line, which is why the summary has none", () => {
    expect(() => monthlyAdminParseSlot("Generated by the scheduler\nTue 17:30-18:30 | A | B")).toThrow();
  });
});
