import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const base = "app/api/scheduler";
const routes = [
  "me", "staff", "staff/[staffId]", "week", "classes/occurrences",
  "conflicts", "availability", "import", "monthly-review", "monthly-billing-input",
];

// REQ-30 AC12a: the class write routes too.
const writes: [string, string][] = [["classes", "POST"], ["classes/[seriesId]/occurrences/[date]", "PATCH"], ["classes/[seriesId]/occurrences/[date]", "DELETE"]];

describe("Server-Timing on scheduler class write routes", () => {
  for (const [r, method] of writes) {
    it(`${r} ${method} goes through withServerTiming`, () => {
      const src = readFileSync(`${base}/${r}/route.ts`, "utf8");
      expect(src).toMatch(new RegExp(`export const ${method} = withServerTiming\\(`));
      expect(src).not.toMatch(new RegExp(`export (async )?function ${method}`));
    });
  }
});

describe("Server-Timing on scheduler GET routes", () => {
  for (const r of routes) {
    it(`${r} GET goes through withServerTiming`, () => {
      const src = readFileSync(`${base}/${r}/route.ts`, "utf8");
      expect(src).toMatch(/export const GET = withServerTiming\(/);
      expect(src).not.toMatch(/export (async )?function GET/);
    });
  }
  it("daily-task is untouched", () => {
    expect(readFileSync(`${base}/daily-task/route.ts`, "utf8")).not.toContain("server-timing");
  });
});
