import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-57 AC13: the sales queue ranking decision stays in the repo.
const DOCS = join(__dirname, "..", "docs");
const read = (p: string) => readFileSync(join(DOCS, p), "utf8");

describe("ADR 0071 (REQ-57 AC13)", () => {
  const adr = read("decisions/0071-sales-queue-ranking.md");

  it("has every section and no em dash", () => {
    expect(adr).toMatch(/^# 0071: /m);
    expect(adr).toMatch(/^Status: accepted$/m);
    for (const h of ["## Context", "## Decision", "## Alternatives considered", "## Consequences"]) expect(adr).toContain(h);
    expect(adr).not.toContain("—");
  });

  it("records the six rules", () => {
    expect(adr).toMatch(/published order/i);
    expect(adr).toContain("(moved up: due earlier)");
    expect(adr).toMatch(/Do not contact/);
    expect(adr).toMatch(/Lead ID/);
    expect(adr).toMatch(/browser memory/i);
    expect(adr).toMatch(/no `tel:`/);
    expect(adr).toMatch(/amends \[0065\]/i);
  });

  it("is listed in the README", () => {
    expect(read("decisions/README.md")).toMatch(/\| \[0071\]\(0071-sales-queue-ranking\.md\) \|.*\| accepted \|/);
  });
});
