import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-38 AC9, AC10, AC12: names come from the local people copy. Source scan only.
const APP = join(__dirname, "..");
const SCANNED = ["lib/scheduler", "lib/data", "app", "components"];
const ALLOWED = new Set(["lib/scheduler/people-sync-wiring.ts"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const sources = SCANNED.flatMap((d) => files(join(APP, d))).map((p) => ({ rel: relative(APP, p).replace(/\\/g, "/"), text: readFileSync(p, "utf8") }));
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("people reads are local (REQ-38)", () => {
  it("cached.ts no longer exports a staff or names cache", () => {
    const cached = read("lib/notion/cached.ts");
    expect(cached).not.toMatch(/getStaffList|getStudentNames|fetchStaff|fetchStudentNames/);
  });

  it("no scanned file uses the old cached reads", () => {
    const hits = sources.filter((s) => /getStaffList|getStudentNames/.test(s.text)).map((s) => s.rel);
    expect(hits).toEqual([]);
  });

  it("only people-sync-wiring.ts imports a Notion people reader", () => {
    const re = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*notion\/(staff|students)["']/g;
    const hits: string[] = [];
    for (const s of sources) {
      for (const m of s.text.matchAll(re)) {
        const names = m[1].split(",").map((n) => n.trim().replace(/^type\s+/, ""));
        if (names.some((n) => /^(fetchStaff|fetchStudentNames|fetchStaffForSync|fetchStudentPeople)$/.test(n)) && !ALLOWED.has(s.rel)) hits.push(s.rel);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the Weekly Schedule and billing reads stay live (AC10)", () => {
    // REQ-34: the Weekly Schedule write goes through writeStudentSchedule, which also sets Schedule Source.
    expect(read("lib/scheduler/deps.ts")).toMatch(/fetchScheduledStudents[\s\S]*fetchStudentSchedule[\s\S]*writeStudentSchedule/);
    expect(read("lib/notion/cached.ts")).toContain("getBillingReader");
  });

  it("the service client has exactly two importers: the daily task and the Iris run (REQ-42 AC24)", () => {
    const all = files(APP).filter((p) => !p.includes("node_modules") && !p.includes(".next"));
    const importers = all.filter((p) => readFileSync(p, "utf8").includes("@ap-academy/db/service")).map((p) => relative(APP, p).replace(/\\/g, "/"));
    expect(importers).toEqual(["app/api/iris/run/route.ts", "app/api/scheduler/daily-task/run/route.ts"]);
  });

  it("every AC12 page renders PeopleFreshness", () => {
    for (const page of [
      "app/schedule/page.tsx",
      "app/schedule/availability/page.tsx",
      "app/schedule/conflicts/page.tsx",
      "app/scheduler/schedules/page.tsx",
      "app/parent/[studentId]/calendar/page.tsx",
      "app/students/[studentId]/page.tsx",
    ]) {
      expect(read(page), page).toContain("<PeopleFreshness");
    }
  });
});
