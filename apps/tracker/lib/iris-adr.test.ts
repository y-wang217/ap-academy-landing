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

// REQ-44 AC24: the drafting and phone backup ADRs.
describe("ADRs 0063 and 0064", () => {
  for (const file of ["0063-iris-policy-versions-and-drafts.md", "0064-iris-phone-backup.md"]) {
    it(`${file} has every section, is indexed and has no em dash`, () => {
      const src = read(join(DECISIONS, file));
      expect(src, file).toMatch(/^Status: accepted/m);
      for (const h of ["## Context", "## Decision", "## Alternatives considered", "## Consequences"]) expect(src, `${file} ${h}`).toContain(h);
      expect(read(join(DECISIONS, "README.md"))).toContain(`(${file})`);
      expect(src).not.toMatch(/[—]/);
    });
  }

  it("0063 states the rule check, the signature, the functions and the streak rules", () => {
    const src = read(join(DECISIONS, "0063-iris-policy-versions-and-drafts.md"));
    for (const s of ["draft_rule", "SIGNATURE", "iris.approve_draft", "iris.save_draft_edit", "iris.reject_draft", "unedited_streak", "answered_by_charlie"]) expect(src, s).toContain(s);
  });

  it("0064 states what never goes to Notion and the retention sweep", () => {
    const src = read(join(DECISIONS, "0064-iris-phone-backup.md"));
    for (const s of ["NOTION_CHARLIE_USER_ID", "never", "purge date", "No edits after creation"]) expect(src, s).toContain(s);
  });

  it("the operator guide has Drafting, Review and Phone backup sections", () => {
    const src = read(join(ROOT, "apps/tracker/docs/iris-operations.md"));
    for (const h of ["## Drafting", "## Review", "## Phone backup"]) expect(src, h).toMatch(new RegExp(`^${h}$`, "m"));
  });
});

// REQ-48 AC13: the send ADR and the operator guide.
describe("ADR 0069", () => {
  const file = "0069-iris-send-at-most-once.md";
  it("has every section, is indexed, has no em dash, and records the five send rules", () => {
    const src = read(join(DECISIONS, file));
    expect(src, file).toMatch(/^Status: accepted/m);
    for (const h of ["## Context", "## Decision", "## Alternatives considered", "## Consequences"]) expect(src, `${file} ${h}`).toContain(h);
    expect(read(join(DECISIONS, "README.md"))).toContain(`(${file})`);
    expect(src).not.toMatch(/[—]/);
    for (const rule of [/One send row per draft/i, /X-Iris-Send-Id/, /Verify before every attempt but the first/i, /Two tokens with one scope each/i, /3-attempt limit/i]) expect(src).toMatch(rule);
  });

  it("ADR 0059 says its scope is widened by 0069", () => {
    expect(read(join(DECISIONS, "0059-iris-gmail-read-only.md"))).toMatch(/^Status: accepted, scope widened by 0069/m);
  });

  it("the operator guide names gmail.send, Failed and Retry, and the first-send check", () => {
    const src = read(join(ROOT, "apps/tracker/docs/iris-operations.md"));
    for (const s of ["https://www.googleapis.com/auth/gmail.send", "## Sending", "Retry", "Failed", "First-send check", "Show original"]) expect(src, s).toContain(s);
    expect(src).not.toMatch(/[—]/);
  });
});
