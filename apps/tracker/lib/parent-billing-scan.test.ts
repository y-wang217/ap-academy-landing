import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BILLING_FORBIDDEN, PARENT_BILLING_FILES } from "../test/parent-guardrails";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [relative(root, path)] : [];
  });
}

describe("parent billing source scan (AC11, AC12)", () => {
  for (const file of PARENT_BILLING_FILES) {
    it(`${file} names nothing a parent may not see and writes nothing`, () => {
      expect(existsSync(join(root, file)), `${file} exists`).toBe(true);
      const source = read(file);
      for (const pattern of BILLING_FORBIDDEN) expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
    });
  }
  it("every POST in the billing files is a data source query, never a page create", () => {
    for (const file of PARENT_BILLING_FILES) {
      for (const line of read(file).split("\n").filter((l) => /method:\s*"POST"/.test(l))) expect(line, file).toMatch(/\/query/);
    }
  });
  it("the billing view model has no url field", () => {
    expect(read("lib/view/parent-billing.ts")).not.toMatch(/\burl\??:/i);
  });
  it("unstable_cache appears only in lib/notion/cached.ts", () => {
    const users = ["lib", "app", "components"].flatMap((d) => sources(join(root, d))).filter((f) => read(f).includes("unstable_cache"));
    expect(users).toEqual(["lib/notion/cached.ts"]);
  });
});
