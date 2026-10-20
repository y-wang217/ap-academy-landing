import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Workspace ADR 0004 (REQ-36): the people-data decision stays true to the repo.
const ROOT = join(__dirname, "..", "..", "..");
const ADR_PATH = "docs/adr/0004-notion-edits-people-supabase-reads-local.md";
const TRACKER_ADRS = join(ROOT, "apps/tracker/docs/decisions");

const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
const adr = read(join(ROOT, ADR_PATH));

// Text between `## <heading>` and the next `## ` heading.
function section(source: string, heading: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return rest.slice(0, end < 0 ? undefined : end).join("\n");
}

function tableRows(text: string): string[][] {
  return text
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^:?-+:?$/.test(c)))
    .slice(1);
}

const SECTIONS = ["Context", "Decision", "Options rejected", "Field ownership", "Readers and writers", "Lifecycle", "Consequences", "Numbering"];

describe("ADR 0004 structure", () => {
  it("exists with the header fields and every section", () => {
    expect(existsSync(join(ROOT, ADR_PATH)), ADR_PATH).toBe(true);
    expect(adr).toMatch(/\*\*Status:\*\* Accepted/);
    expect(adr).toMatch(/\*\*Date:\*\* 2026-10-16/);
    expect(adr).toMatch(/\*\*Decided by:\*\* Charlie/);
    for (const s of SECTIONS) expect(section(adr, s), `section ${s}`).not.toBe("");
  });

  it("names options A and C with a reason each", () => {
    const options = section(adr, "Options rejected");
    expect(options).toMatch(/\*\*A \([^)]+\):\*\*\s+\S/);
    expect(options).toMatch(/\*\*C \([^)]+\):\*\*\s+\S/);
  });
});

const FIELDS = [
  "Staff name",
  "Staff greeting name",
  "Staff active",
  "Staff subjects",
  "Staff email",
  "Student display name",
  "Student stage",
  "Student Notion page id",
  "Student grade",
  "Parent name",
  "Parent email",
];
const COPIED = ["Staff name", "Staff active", "Staff subjects", "Student display name", "Student stage", "Student Notion page id"];

describe("ADR 0004 field ownership", () => {
  const rows = tableRows(section(adr, "Field ownership"));
  const byField = new Map(rows.map((r) => [r[0], r]));

  it("has one row per field with five columns", () => {
    expect([...byField.keys()].sort()).toEqual([...FIELDS].sort());
    for (const r of rows) expect(r, r[0]).toHaveLength(5);
  });

  it("copies exactly the six scheduler and parent-view fields", () => {
    const yes = rows.filter((r) => /^Yes\b/.test(r[3])).map((r) => r[0]);
    expect(yes.sort()).toEqual([...COPIED].sort());
    for (const f of FIELDS.filter((f) => !COPIED.includes(f))) expect(byField.get(f)?.[3], f).toMatch(/^No\b/);
  });

  it("keeps parent fields out of Supabase, citing Iris decision 28", () => {
    for (const f of ["Parent name", "Parent email"]) expect(byField.get(f)?.join(" "), f).toMatch(/decision 28/);
  });

  it("derives the greeting name at read time", () => {
    expect(byField.get("Staff greeting name")?.join(" ")).toMatch(/read time/);
  });
});

const REQUIRED_PATHS = [
  "apps/tracker/lib/notion/cached.ts",
  "apps/tracker/lib/scheduler/deps.ts",
  "apps/tracker/lib/scheduler/identity.ts",
  "apps/tracker/lib/notion/students.ts",
  "apps/tracker/lib/notion/staff.ts",
  "apps/tracker/lib/notion/billing.ts",
  "apps/tracker/app/api/scheduler/daily-task/run/route.ts",
  "apps/tracker/lib/scheduler/daily-task-wiring.ts",
  "apps/tracker/app/parent/[studentId]/calendar/page.tsx",
  "apps/tracker/lib/data/parent-calendar.ts",
  "apps/tracker/app/actions/teacher.ts",
  "supabase/seed/scheduler-staff-link.sql",
];

describe("ADR 0004 readers and writers", () => {
  const rows = tableRows(section(adr, "Readers and writers"));
  const path = (r: string[]) => r[0].replace(/`/g, "");
  const state = (p: string) => rows.find((r) => path(r) === p)?.[3];

  it("gives every row a known state", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(["exists", "planned", "outside repo"], path(r)).toContain(r[3].replace(/`/g, ""));
  });

  it("names only real files as exists", () => {
    const missing = rows.filter((r) => r[3].replace(/`/g, "") === "exists" && !existsSync(join(ROOT, path(r)))).map(path);
    expect(missing).toEqual([]);
  });

  it("lists the required readers and writers", () => {
    for (const p of REQUIRED_PATHS) expect(state(p), p).toMatch(/exists/);
    expect(state("apps/tracker/lib/notion/parents.ts")).toMatch(/exists/);
    const outside = rows.filter((r) => r[3].includes("outside repo")).map(path).join(" ");
    expect(outside).toMatch(/monthly-admin/);
    expect(outside).toMatch(/onboarding/);
  });
});

describe("ADR 0004 lifecycle", () => {
  const lifecycle = section(adr, "Lifecycle");
  it("has a rule for each event", () => {
    for (const event of [/\*\*Rename/, /\*\*Archive/, /\*\*Staff deactivated/, /\*\*Delete in Notion/]) expect(lifecycle).toMatch(event);
  });
  it("never cascades a delete to series", () => expect(lifecycle).toContain("never cascade to series"));
  it("cuts teacher scope on the next request", () => expect(lifecycle).toContain("next request"));
  it("cuts it even with a live staff link", () => expect(lifecycle).toContain("even if"));
});

const SUPERSEDED: { file: string; decisionSha256: string }[] = [
  { file: "0033-scheduler-staff-identity.md", decisionSha256: "31503a5aa25c8885dbf834721c3249f7f155c6699eecbea25009f623f29f3100" },
  { file: "0037-teachers-see-own-student-names.md", decisionSha256: "b82ccb533c592eccb5cb742ca5878d7389f3ed744ce16083a50ff94593566dd9" },
];

describe("tracker ADRs 0033 and 0037", () => {
  const index = read(join(TRACKER_ADRS, "README.md"));
  for (const { file, decisionSha256 } of SUPERSEDED) {
    const source = read(join(TRACKER_ADRS, file));
    it(`${file} is accepted in part, pointing at 0004`, () => {
      const status = source.split("\n").find((l) => l.startsWith("Status:")) ?? "";
      expect(status).toContain("accepted in part");
      expect(status).toContain("0004");
      const row = index.split("\n").find((l) => l.includes(`(${file})`)) ?? "";
      expect(row).toContain("accepted in part");
      expect(row).toContain("0004");
    });
    it(`${file} keeps its decision text`, () => {
      const decision = section(source, "Decision") + "\n";
      expect(createHash("sha256").update(decision).digest("hex")).toBe(decisionSha256);
    });
  }
});

describe("ADR 0004 pointers and wording", () => {
  it("is linked from both CLAUDE.md files", () => {
    expect(read(join(ROOT, "CLAUDE.md"))).toContain(ADR_PATH);
    expect(read(join(ROOT, "apps/tracker/CLAUDE.md"))).toContain(ADR_PATH);
  });

  it("has no em-dashes", () => {
    expect(adr).not.toBe("");
    const lines = adr.split("\n").flatMap((l, i) => (l.includes("—") ? [i + 1] : []));
    expect(lines, `em-dash on line(s) ${lines.join(", ")}`).toEqual([]);
  });

  it("treats spec numbers as placeholders", () => {
    const numbering = section(adr, "Numbering");
    expect(numbering).toContain("placeholders");
    expect(numbering).toContain("the file on `main` wins");
  });

  it("makes Notion page ids the join key in the Decision", () => {
    const decision = section(adr, "Decision");
    for (const col of ["tracker.class_series.notion_student_id", "tracker.students.notion_student_id", "tracker.staff_links.notion_staff_id", "tracker.schedule_summaries.notion_student_id"]) {
      expect(decision).toContain(col);
    }
    expect(decision).toContain("Supabase row ids are local");
  });
});
