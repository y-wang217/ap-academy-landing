import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLinkable, lessonHours, occurrenceRef, parseOccurrenceRef, planLog, reconcile, type LessonRow } from "./lesson-link";
import { expandOccurrences, planSplit, type ClassException, type ClassSeries } from "./recurrence";

const ID = "11111111-1111-4111-8111-111111111111";
const NEW_ID = "22222222-2222-4222-8222-222222222222";
const series: ClassSeries = {
  id: ID, staffId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", studentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  subject: "MHF4U", kind: "weekly", startDate: "2026-10-19", startTime: "16:00", durationMinutes: 60, effectiveUntil: null,
};
const range = { from: "2026-10-19", to: "2026-11-30" };

describe("AC1: occurrence reference", () => {
  it("is sched:<seriesId>:<originalDate>", () => {
    expect(occurrenceRef({ seriesId: ID, originalDate: "2026-10-19" })).toBe(`sched:${ID}:2026-10-19`);
  });
  it("round-trips for every expanded occurrence", () => {
    const occs = expandOccurrences([series], [], range);
    expect(occs.length).toBeGreaterThan(5);
    for (const o of occs) expect(parseOccurrenceRef(occurrenceRef(o))).toEqual({ seriesId: o.seriesId, originalDate: o.originalDate });
  });
  it("rejects anything else", () => {
    for (const bad of [`${ID}:2026-10-19`, `x:${ID}:2026-10-19`, `sched:not-a-uuid:2026-10-19`, `sched:${ID}:2026-13-45x`, `sched:${ID}:2026-10-19:extra`, `sched:${ID}`, "", `sched:${ID}:2026-1-9`]) {
      expect(parseOccurrenceRef(bad)).toBeNull();
    }
  });
});

describe("AC2: stable after the fact", () => {
  it("a moved class keeps its ref", () => {
    const moved: ClassException = { seriesId: ID, originalDate: "2026-10-19", kind: "moved", newDate: "2026-10-21", newStartTime: "16:00" };
    const [o] = expandOccurrences([series], [moved], { from: "2026-10-19", to: "2026-10-25" });
    expect(o.date).toBe("2026-10-21");
    expect(occurrenceRef(o)).toBe(`sched:${ID}:2026-10-19`);
  });
  it("a this-and-future split keeps pre-split refs and re-keys only later dates", () => {
    const before = expandOccurrences([series], [], range).filter((o) => o.date < "2026-10-26").map(occurrenceRef);
    const plan = planSplit(series, [], "2026-10-26", { startTime: "17:00" }, NEW_ID);
    const after = expandOccurrences([plan.oldSeries, plan.newSeries], [], range);
    expect(after.filter((o) => o.date < "2026-10-26").map(occurrenceRef)).toEqual(before);
    for (const o of after.filter((o) => o.date >= "2026-10-26")) expect(o.seriesId).toBe(NEW_ID);
  });
});

describe("AC3: linkable", () => {
  const base = { status: "scheduled" as const, date: "2026-10-19" };
  it("true for a class on or before today that was not cancelled", () => {
    expect(isLinkable(base, "2026-10-19")).toBe(true);
    expect(isLinkable(base, "2026-10-20")).toBe(true);
  });
  it("false for cancelled and future classes", () => {
    expect(isLinkable({ ...base, status: "cancelled" }, "2026-10-19")).toBe(false);
    expect(isLinkable({ ...base, status: "cancelled" }, "2026-10-25")).toBe(false);
    expect(isLinkable(base, "2026-10-18")).toBe(false);
  });
  it("true for a moved class whose new date has passed", () => {
    expect(isLinkable({ status: "moved", date: "2026-10-21" }, "2026-10-22")).toBe(true);
    expect(isLinkable({ status: "moved", date: "2026-10-21" }, "2026-10-20")).toBe(false);
  });
});

describe("REQ-39: the link is wired, and still pure (supersedes ADR 0040 AC4)", () => {
  const dir = join(__dirname, "..", "..", "..");
  const source = readFileSync(join(__dirname, "lesson-link.ts"), "utf8");
  it("is pure and names no Lessons data source", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    for (const i of imports) expect(i).not.toMatch(/react|next|supabase|notion/i);
    expect(source).not.toMatch(/6300f58a/);
    expect(source).toMatch(/export type LessonLinkPort/);
  });
  it("is imported only by the lesson handlers, the Notion adapter, the outcome store, the week files and the billing input", () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|\.fake\.|lesson-link\.ts$/.test(name) && /lesson-link/.test(readFileSync(p, "utf8"))) hits.push(p.slice(dir.length + 1));
      }
    };
    for (const sub of ["app", "lib", "components"]) { try { walk(join(dir, sub)); } catch { /* absent */ } }
    const allowed = [
      "lib/scheduler/lesson-handlers.ts", "lib/notion/lessons.ts", "lib/scheduler/outcome-store.ts", "lib/data/outcomes.ts",
      "lib/scheduler/schedule-handlers.ts", "lib/scheduler/deps.ts",
      // REQ-40: the billing input names each class by the same occurrenceRef (pure, no port).
      "lib/domain/billing/month-input.ts",
      // REQ-58: the console's operations aggregation (pure) and its read-only reader (listUnlinkedLessons only).
      "lib/domain/schedule/operations.ts", "lib/console/operations-read.ts",
    ];
    for (const h of hits) expect(allowed, h).toContain(h);
    expect(hits).toContain("lib/scheduler/lesson-handlers.ts");
    expect(hits).toContain("lib/notion/lessons.ts");
  });
});

describe("REQ-39: lessonHours", () => {
  it("rounds minutes / 60 to 2 decimals", () => {
    expect(lessonHours(60)).toBe(1);
    expect(lessonHours(50)).toBe(0.83);
    expect(lessonHours(90)).toBe(1.5);
    expect(lessonHours(55)).toBe(0.92);
  });
});

describe("REQ-39: planLog", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  const pending = (secondsAgo: number) => ({ outcome: "delivered" as const, notionLessonId: null, claimedAt: new Date(now - secondsAgo * 1000).toISOString() });
  it("covers every state", () => {
    expect(planLog(null, now)).toBe("claim");
    expect(planLog(pending(10), now)).toBe("busy");
    expect(planLog(pending(61), now)).toBe("resume");
    expect(planLog({ outcome: "delivered", notionLessonId: NEW_ID, claimedAt: null }, now)).toBe("replay");
    expect(planLog({ outcome: "no_show", notionLessonId: null, claimedAt: null }, now)).toBe("conflict");
  });
  it("a pending row with no claim time is stale", () => {
    expect(planLog({ outcome: "delivered", notionLessonId: null, claimedAt: null }, now)).toBe("resume");
  });
});

describe("REQ-39: reconcile", () => {
  const STAFF = series.staffId;
  const STUDENT = series.studentId;
  const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const occs = expandOccurrences([series], [], { from: "2026-10-19", to: "2026-10-26" });
  const lesson = (id: string, date: string, staff = STAFF, student = STUDENT): LessonRow => ({
    id, date, staffIds: [staff.replaceAll("-", "")], studentIds: [student], ref: "",
  });
  const L1 = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
  const L2 = "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2";
  const L3 = "d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3";
  it("matches only on equal teacher, student and date (dash-insensitive IDs)", () => {
    const r = reconcile(occs, [], [lesson(L1, "2026-10-19"), lesson(L2, "2026-10-19", STAFF, OTHER), lesson(L3, "2026-10-20")]);
    expect(r.unlinked.map((u) => [u.occurrence.date, u.candidates.map((c) => c.id)])).toEqual([["2026-10-19", [L1]], ["2026-10-26", []]]);
    expect(r.doubles).toEqual([]);
  });
  it("lists two candidates and chooses neither", () => {
    const r = reconcile(occs.slice(0, 1), [], [lesson(L1, "2026-10-19"), lesson(L2, "2026-10-19")]);
    expect(r.unlinked[0].candidates.map((c) => c.id)).toEqual([L1, L2]);
  });
  it("a delivered occurrence's same-day row lands in doubles; a no-show's leaves the list", () => {
    const r = reconcile(occs, [
      { seriesId: ID, originalDate: "2026-10-19", outcome: "delivered" },
      { seriesId: ID, originalDate: "2026-10-26", outcome: "no_show" },
    ], [lesson(L1, "2026-10-19")]);
    expect(r.unlinked).toEqual([]);
    expect(r.doubles.map((d) => [d.occurrence.date, d.lesson.id])).toEqual([["2026-10-19", L1]]);
  });
  it("a moved occurrence matches on its new date", () => {
    const moved: ClassException = { seriesId: ID, originalDate: "2026-10-19", kind: "moved", newDate: "2026-10-21", newStartTime: "16:00" };
    const [o] = expandOccurrences([series], [moved], { from: "2026-10-19", to: "2026-10-25" });
    const r = reconcile([o], [], [lesson(L1, "2026-10-19"), lesson(L2, "2026-10-21")]);
    expect(r.unlinked[0].candidates.map((c) => c.id)).toEqual([L2]);
  });
});
