import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-61 AC15: the decisions and the permission docs for console call outcomes stay in the repo.
const ROOT = join(__dirname, "..", "..", "..", "..");
const APP = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

describe("console call outcome docs (AC15)", () => {
  const workspace = read(join(ROOT, "docs/adr/0007-console-writes-notion-people.md"));
  const tracker = read(join(APP, "docs/decisions/0076-console-call-outcomes.md"));

  it("workspace ADR 0007 has every section and names the eleven writable keys", () => {
    expect(workspace).toMatch(/^# ADR 0007: /m);
    expect(workspace).toMatch(/\*\*Status:\*\* Accepted/);
    expect(workspace).toMatch(/\*\*Amends:\*\* ADR 0004/);
    for (const h of ["## Context", "## Decision", "## Options rejected", "## Consequences"]) expect(workspace).toContain(h);
    for (const key of ["Stage", "Owner", "Next Action", "Next Action Due", "Attempts", "Last Contact", "Lost Reason", "Contacted At", "Trial Booked At", "Closed At", "`Last Txn`"]) {
      expect(workspace).toContain(key);
    }
    expect(workspace).toContain("apps/tracker/lib/notion/lead-writer.ts");
  });

  it("tracker ADR 0076 has every section, and the decisions index lists it", () => {
    expect(tracker).toMatch(/^# 0076: /m);
    expect(tracker).toMatch(/^Status: accepted$/m);
    for (const h of ["## Context", "## Decision", "## Alternatives considered", "## Consequences"]) expect(tracker).toContain(h);
    for (const term of ["console_transitions", "Txn ID", "Last Txn", "notion_not_ready", "SHA-256", "nextCallSlot"]) expect(tracker).toContain(term);
    expect(read(join(APP, "docs/decisions/README.md"))).toMatch(/\| \[0076\]\(0076-console-call-outcomes\.md\) \|.*\| accepted \|/);
  });

  it("ADR 0004 reads amended in part by ADR 0005 and ADR 0007, and lists the writer", () => {
    const adr = read(join(ROOT, "docs/adr/0004-notion-edits-people-supabase-reads-local.md"));
    expect(adr).toMatch(/^- \*\*Status:\*\* Accepted, amended in part by ADR 0005 and ADR 0007$/m);
    expect(adr).toMatch(/\| `apps\/tracker\/lib\/notion\/lead-writer\.ts` \| writer \(ADR 0007\)/);
  });

  it("the root CLAUDE.md links ADR 0007", () => {
    expect(read(join(ROOT, "CLAUDE.md"))).toContain("[`docs/adr/0007-console-writes-notion-people.md`](docs/adr/0007-console-writes-notion-people.md)");
  });

  it("the permission docs carry the new table and route", () => {
    const doc = read(join(APP, "docs/permission-matrix.md"));
    expect(doc).toContain("### `console_transitions`");
    expect(doc).toContain("`POST /tracker/api/console/outcomes`");
    expect(read(join(ROOT, "supabase/tests/permission_matrix.sql"))).toMatch(/\('owner', 'console_transitions',\s+1, true,\s+true,\s+false, 'claim_console_transition'\)/);
  });

  it("none of them has an em dash", () => {
    for (const src of [workspace, tracker]) expect(src).not.toContain("—");
  });
});
