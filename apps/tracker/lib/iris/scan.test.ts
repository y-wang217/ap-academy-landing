import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CREDITS_DATA_SOURCE_ID, DEFAULT_INVOICES_DATA_SOURCE_ID } from "../notion/config";

// REQ-42 AC8, AC25: what the Iris code may name, and who may read parent fields.
const ROOT = join(__dirname, "..", "..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (f === "node_modules" || f === ".next") return [];
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
});
const rel = (f: string) => f.slice(ROOT.length + 1);
const IRIS = files(join(ROOT, "lib", "iris"));
const PARENTS = join(ROOT, "lib", "notion", "parents.ts");
const SCANNED = [...IRIS, PARENTS];
// The Lessons data source (REQ-9 and REQ-39). Not in config.ts on this branch, so pinned here.
const LESSONS_DATA_SOURCE_ID = "6300f58a-8b8c-4789-88c1-e44272079b0f";

describe("Iris source scan", () => {
  it("covers the Iris files", () => {
    expect(IRIS.map(rel)).toEqual(expect.arrayContaining(["lib/iris/gmail.ts", "lib/iris/intake.ts", "lib/iris/policy.ts"]));
  });

  it("names no forbidden Notion property (case-sensitive) and no billing or Lessons data source", () => {
    const names = ["Parent Phone", "Sales Notes", "Notes", "Hourly Rate", "Billing Family", "Weekly Schedule", "Invoices", "Missed Sessions", "Lessons", "Paid to Teacher"];
    const ids = [DEFAULT_INVOICES_DATA_SOURCE_ID, DEFAULT_CREDITS_DATA_SOURCE_ID, LESSONS_DATA_SOURCE_ID];
    for (const f of SCANNED) {
      const src = readFileSync(f, "utf8");
      for (const n of names) expect(src.includes(n), `${rel(f)} names ${n}`).toBe(false);
      for (const i of ids) expect(src.includes(i), `${rel(f)} names ${i}`).toBe(false);
    }
  });

  it("asks Gmail for the read-only scope only and names no write path", () => {
    for (const f of IRIS) {
      const src = readFileSync(f, "utf8");
      const scopes = src.match(/googleapis\.com\/auth\/[\w.]+/g) ?? [];
      for (const s of scopes) expect(s, rel(f)).toBe("googleapis.com/auth/gmail.readonly");
      expect(src, rel(f)).not.toMatch(/\/send\b|\/drafts\b|\/modify\b|batchModify|\btrash\b/);
    }
    expect(readFileSync(join(ROOT, "lib", "iris", "gmail.ts"), "utf8")).toContain("googleapis.com/auth/gmail.readonly");
  });

  it("parents.ts is imported only from lib/iris/ and the run route, never cached, and only reads", () => {
    const importers = files(ROOT).filter((f) => f !== PARENTS && /notion\/parents["']/.test(readFileSync(f, "utf8"))).map(rel);
    expect(importers.filter((f) => !f.startsWith("lib/iris/"))).toEqual(["app/api/iris/run/route.ts"]);
    for (const f of [PARENTS, ...IRIS, join(ROOT, "app/api/iris/run/route.ts")]) {
      expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/unstable_cache|"use cache"/);
    }
    expect(readFileSync(join(ROOT, "lib", "notion", "cached.ts"), "utf8")).not.toMatch(/parents/);
    expect(readFileSync(PARENTS, "utf8")).not.toMatch(/"PATCH"|"DELETE"|"PUT"/);
  });
});
