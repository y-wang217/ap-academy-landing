import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const base = "app/api/scheduler";
const routes = [
  "me", "staff", "staff/[staffId]", "week", "classes/occurrences",
  "conflicts", "availability", "import", "monthly-review",
];

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
