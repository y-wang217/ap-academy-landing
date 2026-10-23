import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WRITABLE } from "../notion/lead-writer";

// REQ-61 AC3, AC12: what the outcome path can write and where the form can send.
const APP = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(APP, f), "utf8");
const BANNED = [
  "Last Payment Date", "Invoices", "Hours Paid", "Hourly Rate", "Lesson Cadence", "Parent Name", "Parent Phone", "Parent Email",
  "Sales Notes", "Notes", "Weekly Schedule",
];

describe("outcome source scan", () => {
  it("the writer's PATCH map names no billing, parent, note or schedule property (AC3)", () => {
    const names = Object.values(WRITABLE).map((w) => w.name);
    for (const b of BANNED) expect(names.some((n) => n.includes(b)), b).toBe(false);
    const src = read("lib/notion/lead-writer.ts");
    const map = src.slice(src.indexOf("export const WRITABLE"), src.indexOf("} as const satisfies"));
    for (const b of BANNED) expect(map).not.toContain(b);
    const builder = src.slice(src.indexOf("export function leadPatchBody"), src.indexOf("const guid ="));
    for (const b of BANNED) expect(builder).not.toContain(b);
  });

  it("the sales components fetch only the console's own routes and hold no tel:, sms: or mailto: (AC12)", () => {
    const dir = "components/console/sales";
    for (const f of readdirSync(join(APP, dir)).filter((n) => /\.tsx?$/.test(n) && !n.endsWith(".test.ts"))) {
      const src = read(`${dir}/${f}`);
      for (const s of ["tel:", "sms:", "mailto:"]) expect(src, f).not.toContain(s);
      for (const m of src.matchAll(/fetch\(\s*([^,)]+)/g)) {
        expect(["\"/tracker/api/console/outcomes\"", "\"/tracker/api/console/sales\""], `${f}: ${m[1]}`).toContain(m[1].trim());
      }
    }
  });

  it("the form posts only to the outcomes route and has no send, call or text button", () => {
    const src = read("components/console/sales/outcome-form.tsx");
    expect([...src.matchAll(/fetch\(\s*"([^"]+)"/g)].map((m) => m[1])).toEqual(["/tracker/api/console/outcomes"]);
    expect(src).not.toMatch(/>\s*(Send|Call|Text)\s*</);
  });

  it("outcomes.ts imports nothing from Next, React or Supabase", () => {
    const imports = [...read("lib/console/outcomes.ts").matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["../domain/tuning", "../time"]);
  });
});
