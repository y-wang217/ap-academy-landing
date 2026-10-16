import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PARENT_CALENDAR_FILES, PARENT_FORBIDDEN } from "../test/parent-guardrails";

const root = resolve(__dirname, "..");

describe("parent calendar source scan (AC10, AC14)", () => {
  for (const file of PARENT_CALENDAR_FILES) {
    it(`${file} reads nothing a parent may not see and writes nothing`, () => {
      const path = join(root, file);
      expect(existsSync(path), `${file} exists`).toBe(true);
      const source = readFileSync(path, "utf8");
      for (const pattern of PARENT_FORBIDDEN) expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
    });
  }
  it("every store call in the calendar files is listSeriesForStudent", () => {
    const calls = PARENT_CALENDAR_FILES.flatMap((f) => [...readFileSync(join(root, f), "utf8").matchAll(/\bstore\.(\w+)\(/g)].map((m) => m[1]));
    expect(calls.length).toBeGreaterThan(0);
    expect(new Set(calls)).toEqual(new Set(["listSeriesForStudent"]));
  });
});
