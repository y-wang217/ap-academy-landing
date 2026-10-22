import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-59 AC9: the trial funnel and cash pulse decision stays in the repo.
const DOCS = join(__dirname, "..", "docs");
const read = (p: string) => readFileSync(join(DOCS, p), "utf8");

describe("ADR 0073 (REQ-59 AC9)", () => {
  const adr = read("decisions/0073-trial-funnel-and-cash-pulse.md");
  it("is accepted and has every section", () => {
    expect(adr).toMatch(/^# 0073: /m);
    expect(adr).toMatch(/^Status: accepted$/m);
    for (const h of ["## Context", "## Decision", "## Alternatives considered", "## Consequences"]) expect(adr).toContain(h);
  });
  it("records the count definitions, outcome-unknown, collected, paid-date, window and status rules", () => {
    for (const s of ["Five count definitions", "Outcome-unknown rule", "Collected and outstanding rules", "Paid-date fallback", "**Window.**", "Status mapping"]) expect(adr).toContain(s);
    expect(adr).toMatch(/booked.*delivered.*closed.*verified enrolments/s);
    expect(adr).toContain("paid date not recorded");
    expect(adr).toMatch(/unverifiable/);
  });
  it("has no em dash and a README row", () => {
    expect(adr).not.toContain("—");
    expect(read("decisions/README.md")).toMatch(/\[0073\]\(0073-trial-funnel-and-cash-pulse\.md\).*\| accepted \|/);
  });
});
