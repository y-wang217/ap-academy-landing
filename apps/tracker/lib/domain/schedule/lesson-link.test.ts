import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLinkable, occurrenceRef, parseOccurrenceRef } from "./lesson-link";
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

describe("AC4: extension point only", () => {
  const dir = join(__dirname, "..", "..", "..");
  const source = readFileSync(join(__dirname, "lesson-link.ts"), "utf8");
  it("is pure and names no Lessons data source", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    for (const i of imports) expect(i).not.toMatch(/react|next|supabase|notion/i);
    expect(source).not.toMatch(/6300f58a/);
    expect(source).toMatch(/export type LessonLinkPort/);
  });
  it("is imported by no non-test file", () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|lesson-link\.ts$/.test(name) && /lesson-link/.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    for (const sub of ["app", "lib", "components"]) { try { walk(join(dir, sub)); } catch { /* absent */ } }
    expect(hits).toEqual([]);
  });
});
