import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-32 AC14: docs/permission-matrix.md (for people) and the `expected` block
// of supabase/tests/permission_matrix.sql (what pnpm test:rls proves) must say
// the same thing, cell by cell, at the level of none, read and write. Text
// only: nothing here imports from another app or touches a database.

const doc = readFileSync(join(__dirname, "../docs/permission-matrix.md"), "utf8");
const sql = readFileSync(join(__dirname, "../../../supabase/tests/permission_matrix.sql"), "utf8");

const SINGLE: Record<string, string> = {
  owner: "owner",
  "grade teacher": "grade_teacher",
  "scheduling-only teacher": "scheduling_teacher",
  student: "student",
  parent: "parent",
};
const COMBOS: Record<string, [string, string]> = {
  "owner + staff link": ["owner", "scheduling-only teacher"],
  "grade teacher + staff link": ["grade teacher", "scheduling-only teacher"],
  "staff link + parent link": ["scheduling-only teacher", "parent"],
  "grade teacher + parent link": ["grade teacher", "parent"],
};
const NOTION = ["staff list", "student names", "Weekly Schedule text", "daily task", "parent billing"];

type Access = { read: boolean; write: boolean };

/** Section heading -> role -> access, from the doc's `| role | access |` tables. */
function parseDoc(): Map<string, Map<string, Access & { text: string }>> {
  const sections = new Map<string, Map<string, Access & { text: string }>>();
  let current: Map<string, Access & { text: string }> | null = null;
  for (const line of doc.split("\n")) {
    const heading = line.match(/^### (?:`([a-z_]+)`|Notion: (.+))$/);
    if (heading) {
      current = new Map();
      sections.set(heading[1] ?? `notion:${heading[2]}`, current);
      continue;
    }
    if (line.startsWith("## ")) current = null;
    const row = line.match(/^\| ([^|]+) \| (.+) \|$/);
    if (!current || !row || row[1] === "role" || row[1].startsWith("---")) continue;
    const text = row[2].trim();
    expect(text, `cell grammar: ${row[1]} in ${[...sections.keys()].pop()}`).toMatch(/^(none|read, write|read)\b/);
    current.set(row[1].trim(), { text, read: !text.startsWith("none"), write: text.startsWith("read, write") });
  }
  return sections;
}

/** actor -> table -> access, from the SQL `expected` values. */
function parseSql(): Map<string, Map<string, Access>> {
  const out = new Map<string, Map<string, Access>>();
  const re = /\('(\w+)',\s*'(\w+)',\s*(null|\d+),\s*(true|false),\s*(true|false),\s*(true|false),\s*(null|'[^']*')\)/g;
  for (const m of sql.matchAll(re)) {
    const [, actor, tbl, rows, ins, upd, del, rpc] = m;
    // audit_log counts are null in the literal and filled from the fixture: a read scope.
    const read = rows === "null" || Number(rows) > 0;
    const write = ins === "true" || upd === "true" || del === "true" || rpc !== "null";
    if (!out.has(actor)) out.set(actor, new Map());
    out.get(actor)!.set(tbl, { read, write });
  }
  return out;
}

const docCells = parseDoc();
const sqlCells = parseSql();
const tables = [...sqlCells.get("owner")!.keys()].sort();

describe("permission matrix: doc and SQL agree (REQ-32 AC14)", () => {
  it("the SQL lists every single role and the same tables for each", () => {
    expect([...sqlCells.keys()].sort()).toEqual(Object.values(SINGLE).sort());
    for (const cells of sqlCells.values()) expect([...cells.keys()].sort()).toEqual(tables);
    expect(tables.length).toBeGreaterThanOrEqual(23);
  });

  it("the doc has a section for exactly the SQL's tables, plus the Notion reads", () => {
    const docTables = [...docCells.keys()].filter((k) => !k.startsWith("notion:")).sort();
    expect(docTables).toEqual(tables);
    expect([...docCells.keys()].filter((k) => k.startsWith("notion:")).map((k) => k.slice(7))).toEqual(NOTION);
  });

  it("every section has every role and combination, once", () => {
    for (const [section, cells] of docCells) {
      expect([...cells.keys()], section).toEqual([...Object.keys(SINGLE), ...Object.keys(COMBOS)]);
    }
  });

  for (const tbl of tables) {
    it(`${tbl}: each single role's read and write match the SQL`, () => {
      for (const [role, actor] of Object.entries(SINGLE)) {
        const d = docCells.get(tbl)!.get(role)!;
        const s = sqlCells.get(actor)!.get(tbl)!;
        expect({ read: d.read, write: d.write }, `${role} on ${tbl}: "${d.text}"`).toEqual(s);
      }
    });
  }

  it("each combination's cell is the union of its roles' cells", () => {
    for (const [section, cells] of docCells) {
      for (const [combo, [a, b]] of Object.entries(COMBOS)) {
        const c = cells.get(combo)!;
        const x = cells.get(a)!;
        const y = cells.get(b)!;
        expect({ read: c.read, write: c.write }, `${combo} on ${section}`).toEqual({ read: x.read || y.read, write: x.write || y.write });
      }
    }
  });
});
