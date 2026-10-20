import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-39 AC1, AC2: the lesson-link decision and the operator steps stay in the repo.
const DOCS = join(__dirname, "..", "docs");
const read = (p: string) => readFileSync(join(DOCS, p), "utf8");

describe("ADR 0056 (REQ-39 AC1)", () => {
  const adr = read("decisions/0056-lesson-link-and-outcomes.md");
  it("records option (a) plus reconciliation, names the property and supersedes 0040", () => {
    expect(adr).toMatch(/^Status: accepted$/m);
    expect(adr).toMatch(/Supersedes \[0040\]/);
    expect(adr).toMatch(/`Class occurrence`/);
    expect(adr).toMatch(/Text property/);
    expect(adr).toMatch(/Option \(a\) plus the reconciliation list from \(b\)/);
  });
  it("0040 reads superseded by 0056, and the README lists both", () => {
    expect(read("decisions/0040-lesson-link-extension-point.md")).toMatch(/^Status: superseded by 0056$/m);
    const index = read("decisions/README.md");
    expect(index).toMatch(/\[0040\]\(0040-lesson-link-extension-point\.md\).*\| superseded by 0056 \|/);
    expect(index).toMatch(/\[0056\]\(0056-lesson-link-and-outcomes\.md\).*\| accepted \|/);
  });
});

describe("operator guide (REQ-39 AC2)", () => {
  const guide = read("scheduler-operations.md");
  const section = guide.slice(guide.indexOf("## 8. Lesson logging"));
  it("has the Lesson logging section with the property, its type and the access it needs", () => {
    expect(guide).toContain("## 8. Lesson logging");
    expect(section).toMatch(/\*\*Text\*\* named exactly `Class occurrence`/);
    expect(section).toMatch(/read, insert and update access/);
    expect(section).toMatch(/Never edit `Class occurrence` by hand/);
    expect(section).toMatch(/"Log a Lesson" form keeps working/);
    expect(section).toMatch(/503 `lessons_not_ready`/);
    expect(section).toContain("Lesson logging is not set up yet.");
  });
});
