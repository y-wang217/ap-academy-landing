import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-63 AC15, AC16: the console's readiness rows, the founder gate, the release receipt and ADR 0079.
const ROOT = join(__dirname, "../../../..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const exists = (f: string) => existsSync(join(ROOT, f));

const CARDS = Array.from({ length: 12 }, (_, i) => `REQ-${52 + i}`);
const STAGES = ["Merged", "Migration", "Deployed", "Verified", "Data"];
// docs/readiness.md, Vocabulary. Evidence never holds ";" or ")".
const DATE = String.raw`\d{4}-\d{2}-\d{2}`;
const VALUE = new RegExp(String.raw`^(yes \(${DATE}, [^;)]+\)|failed \(${DATE}, [^;)]+\)|reported \([^,;)]+, ${DATE}\)|no|not recorded|n/a)$`);

/** The rows of the first table after `heading`, as arrays of trimmed cells. */
function tableAfter(md: string, heading: string): string[][] {
  const at = md.indexOf(`\n${heading}\n`);
  if (at < 0) return [];
  const lines = md.slice(at + heading.length + 2).split("\n");
  const start = lines.findIndex((l) => l.startsWith("|"));
  if (start < 0) return [];
  const rows: string[][] = [];
  for (const l of lines.slice(start + 2)) {
    if (!l.startsWith("|")) break;
    rows.push(l.slice(1, -1).split("|").map((c) => c.trim()));
  }
  return rows;
}

/** "Merged: yes (...); Migration: n/a; ..." as [stage, value] pairs, in order. */
const stagesOf = (cell: string) => cell.split("; ").map((part) => {
  const colon = part.indexOf(": ");
  return [part.slice(0, colon), part.slice(colon + 2)] as const;
});

describe("docs/readiness.md Founder Console section (AC15)", () => {
  const md = read("docs/readiness.md");
  const rows = tableAfter(md, "## Founder Console");
  const header = md.slice(md.indexOf("\n## Founder Console\n")).split("\n").find((l) => l.startsWith("|")) ?? "";

  it("has the section with Card, Title, PRs, Production status and Evidence columns", () => {
    expect(header.slice(1, -1).split("|").map((c) => c.trim())).toEqual(["Card", "Title", "PRs", "Production status", "Evidence"]);
  });

  it("has one row per card, REQ-52 to REQ-63, in order", () => {
    expect(rows.map((r) => r[0])).toEqual(CARDS);
  });

  it.each(CARDS)("%s states the five stages in order, each in the register's vocabulary", (card) => {
    const row = rows.find((r) => r[0] === card);
    expect(row).toBeDefined();
    const stages = stagesOf(row![3]);
    expect(stages.map(([s]) => s)).toEqual(STAGES);
    for (const [stage, value] of stages) expect(value, `${card} ${stage}`).toMatch(VALUE);
    expect(row![4].length).toBeGreaterThan(0);
  });

  it("REQ-63's own row says Merged: no", () => {
    const row = rows.find((r) => r[0] === "REQ-63")!;
    expect(stagesOf(row[3])[0]).toEqual(["Merged", "no"]);
  });

  it("only REQ-61 has a migration, 0029_console_transitions.sql", () => {
    for (const row of rows) {
      const migration = stagesOf(row[3])[1][1];
      if (row[0] === "REQ-61") expect(migration).toMatch(/^yes \(\d{4}-\d{2}-\d{2}, 0029_console_transitions\.sql per root CLAUDE\.md\)$/);
      else expect(migration).toBe("n/a");
    }
  });

  it("has a Founder console audience gate that Charlie signs off, still Closed", () => {
    const gate = tableAfter(md, "## Audience gates").find((r) => r[0] === "Founder console");
    expect(gate).toBeDefined();
    expect(gate![3]).toBe("Charlie");
    expect(gate![4]).toBe("Closed");
    expect(gate![1]).toContain("03-release-receipt.md");
  });
});

describe("the founder release receipt (AC15, T3)", () => {
  const file = "docs/spec/founder-console/03-release-receipt.md";
  const md = exists(file) ? read(file) : "";

  it.each(["Founder Sales", "Founder exception", "Founder capacity", "Provider outage", "Visual check"])("holds the %s script with empty Result and Date fields", (name) => {
    const at = md.indexOf(`## ${name}\n`);
    expect(at).toBeGreaterThanOrEqual(0);
    const next = md.indexOf("\n## ", at + 1);
    const body = md.slice(at, next < 0 ? undefined : next);
    expect(body).toMatch(/^- Result:\s*$/m);
    expect(body).toMatch(/^- Date:\s*$/m);
  });

  it("ends with an empty Charlie sign-off line and says the builder never fills it in", () => {
    expect(md).toMatch(/^Charlie sign-off:\s*$/m);
    expect(md).toContain("The builder never fills this in.");
  });
});

describe("tracker ADR 0079 (AC16)", () => {
  const adr = "apps/tracker/docs/decisions/0079-console-release-acceptance.md";

  it("exists and is indexed", () => {
    expect(exists(adr)).toBe(true);
    expect(read("apps/tracker/docs/decisions/README.md")).toContain("| [0079](0079-console-release-acceptance.md) |");
  });

  it("names the pinned axe-core version, which is the tracker's exact devDependency, and the bundle check", () => {
    const pkg = JSON.parse(read("apps/tracker/package.json")) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies["axe-core"]).toMatch(/^\d+\.\d+\.\d+$/);
    const text = read(adr);
    expect(text).toContain(`axe-core ${pkg.devDependencies["axe-core"]}`);
    expect(text).toContain("e2e/tracker/bundle-check.mjs");
  });
});
