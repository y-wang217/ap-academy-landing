import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-60 AC10: the Creation mode decision stays in the repo.
const DOCS = join(__dirname, "..", "docs");
const read = (p: string) => readFileSync(join(DOCS, p), "utf8");

describe("ADR 0070 (REQ-60 AC10)", () => {
  const adr = read("decisions/0070-creation-mode-work-queue.md");
  it("is accepted and has every section", () => {
    expect(adr).toMatch(/^# 0070: /m);
    expect(adr).toMatch(/^Status: accepted$/m);
    for (const h of ["## Context", "## Decision", "## Alternatives considered", "## Consequences"]) expect(adr).toContain(h);
  });
  it("records the Area filter, order and grouping, next-asset rule, weekly pin, Task Type names, extra properties and no Done action", () => {
    expect(adr).toMatch(/Area = Marketing|Area is Marketing/);
    expect(adr).toMatch(/Doing, Next, Defined, Inbox/);
    expect(adr).toMatch(/Waiting \/ Blocked last/);
    expect(adr).toContain("Parent Project");
    expect(adr).toMatch(/[Nn]ext asset/);
    expect(adr).toContain("3ead6ae7-3dd7-811e-b525-e3626520b805");
    expect(adr).toContain("Task Type");
    expect(adr).toContain("Expected result");
    expect(adr).toMatch(/amends? .*REQ-54|REQ-54.*amend/);
    expect(adr).toMatch(/set State to Done.*not built|not built.*set State to Done/is);
  });
  it("has no em dash and a README row", () => {
    expect(adr).not.toContain("—");
    expect(read("decisions/README.md")).toMatch(/\[0070\]\(0070-creation-mode-work-queue\.md\).*\| accepted \|/);
  });
});
