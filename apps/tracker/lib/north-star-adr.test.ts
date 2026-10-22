import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-56 AC12: the north-star decision stays in the repo.
const DOCS = join(__dirname, "..", "docs");
const read = (p: string) => readFileSync(join(DOCS, p), "utf8");

describe("ADR 0068 (REQ-56 AC12)", () => {
  const adr = read("decisions/0068-north-star-net-new-hours.md");
  it("is accepted and has every section", () => {
    expect(adr).toMatch(/^# 0068: /m);
    expect(adr).toMatch(/^Status: accepted$/m);
    for (const h of ["## Context", "## Decision", "## Alternatives considered", "## Consequences"]) expect(adr).toContain(h);
  });
  it("records the adoption, not-in-scheduler, status and precedence, opening and percentage rules", () => {
    expect(adr).toMatch(/created_at.*adopted_at/);
    expect(adr).toContain("`not_in_scheduler`");
    expect(adr).toMatch(/error, then unverifiable, then stale/);
    expect(adr).toMatch(/[Oo]pening baseline/);
    expect(adr).toMatch(/[Pp]ercentage/);
  });
  it("has no em dash and a README row", () => {
    expect(adr).not.toContain("—");
    expect(read("decisions/README.md")).toMatch(/\[0068\]\(0068-north-star-net-new-hours\.md\).*\| accepted \|/);
  });
});
