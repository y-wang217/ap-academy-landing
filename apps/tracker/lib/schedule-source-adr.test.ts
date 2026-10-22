import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-34 AC13: the Schedule Source decision stays in the repo.
const DOCS = join(__dirname, "..", "docs");
const read = (p: string) => readFileSync(join(DOCS, p), "utf8");

describe("tracker ADR 0067 (REQ-34 AC13)", () => {
  const adr = read("decisions/0067-schedule-source-and-drift-notice.md");
  it("is accepted and has every section", () => {
    expect(adr).toMatch(/^# 0067: /);
    expect(adr).toMatch(/^Status: accepted$/m);
    for (const h of ["## Context", "## Decision", "## Alternatives considered", "## Consequences"]) expect(adr).toContain(h);
  });
  it("records that Schedule Source is write-only for the scheduler", () => {
    expect(adr).toMatch(/never parsed/);
    expect(adr).toMatch(/never a drift input/);
    expect(adr).toMatch(/never read by billing or the daily task/);
  });
  it("has no em dash and is in the index", () => {
    expect(adr).not.toContain("—");
    expect(read("decisions/README.md")).toContain("(0067-schedule-source-and-drift-notice.md)");
  });
});
