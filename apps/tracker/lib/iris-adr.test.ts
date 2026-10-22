import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-42 docs: the three Iris ADRs, workspace ADR 0005 and the operator guide.
const ROOT = join(__dirname, "..", "..", "..");
const DECISIONS = join(ROOT, "apps/tracker/docs/decisions");
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const ADRS = ["0057-iris-tracker-module.md", "0058-iris-message-retention.md", "0059-iris-gmail-read-only.md", "0061-iris-escalation-rules.md"];

describe("Iris ADRs", () => {
  for (const file of ADRS) {
    it(`${file} has every section and is indexed`, () => {
      const src = read(join(DECISIONS, file));
      expect(src, file).toMatch(/^Status: accepted/m);
      for (const h of ["## Context", "## Decision", "## Alternatives considered", "## Consequences"]) expect(src, `${file} ${h}`).toContain(h);
      expect(read(join(DECISIONS, "README.md"))).toContain(`(${file})`);
      expect(src).not.toMatch(/[—]/);
    });
  }

  it("workspace ADR 0005 keeps Parent Email and Parent Name out of Supabase", () => {
    const src = read(join(ROOT, "docs/adr/0005-iris-message-data.md"));
    expect(src).toMatch(/Parent Email and Parent Name are never copied/);
    expect(src).not.toMatch(/[—]/);
  });

  it("ADR 0004 is amended in part by ADR 0005", () => {
    expect(read(join(ROOT, "docs/adr/0004-notion-edits-people-supabase-reads-local.md"))).toMatch(/\*\*Status:\*\* Accepted, amended in part by ADR 0005/);
  });

  it("the operator guide names the scope, the secret, the exposed schema and delete_thread", () => {
    const src = read(join(ROOT, "apps/tracker/docs/iris-operations.md"));
    for (const s of ["gmail.readonly", "IRIS_CRON_SECRET", "Exposed schemas", "iris.delete_thread"]) expect(src, s).toContain(s);
  });
});

// REQ-43 AC16: the escalation rules ADR.
describe("ADR 0061", () => {
  it("states the routing order, the reason codes, the keyword backstop and the holding-line promise", () => {
    const src = read(join(DECISIONS, "0061-iris-escalation-rules.md"));
    for (const code of ["flagged", "multi_intent", "low_confidence", "escalate_only", "no_reply_needed", "ambiguous_student"]) expect(src, code).toContain(`\`${code}\``);
    expect(src).toMatch(/keyword backstop/i);
    expect(src).toMatch(/no time promise/i);
    const order = ["flagged", "multi_intent", "low_confidence", "escalate_only", "no_reply_needed", "ambiguous_student"].map((c) => src.indexOf(`\`${c}\``));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("the operator guide has a Classification section", () => {
    expect(read(join(ROOT, "apps/tracker/docs/iris-operations.md"))).toMatch(/^## Classification/m);
  });
});
