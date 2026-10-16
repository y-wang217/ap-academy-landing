import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

describe("parent grades source scan (AC12)", () => {
  it("nothing a parent sees reads the entry stamp", () => {
    const files: string[] = [];
    const walk = (p: string) => {
      if (!existsSync(p)) return;
      if (!statSync(p).isDirectory()) { files.push(p); return; }
      for (const name of readdirSync(p)) walk(join(p, name));
    };
    walk(join(root, "app/parent"));
    walk(join(root, "components/recent-marks.tsx"));
    walk(join(root, "lib/view/parent-grades.ts"));
    expect(files.some((f) => f.endsWith("recent-marks.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("parent-grades.ts"))).toBe(true);
    const hits = files.filter((f) => /graded_?at/i.test(readFileSync(f, "utf8"))).map((f) => f.slice(root.length + 1));
    expect(hits).toEqual([]);
  });
});
