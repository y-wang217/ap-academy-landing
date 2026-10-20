import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-33 AC8, AC11: the setup page and its helpers read, never write, and use no service client.
const FILES = [
  "lib/domain/setup-status.ts",
  "lib/view/setup-text.ts",
  "lib/data/setup.ts",
  "app/scheduler/setup/page.tsx",
  "components/scheduler/setup-list.tsx",
];
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("setup page source scan (AC8, AC11)", () => {
  it.each(FILES)("%s makes no write and no service-role call", (f) => {
    const src = read(f);
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(src).not.toMatch(/@ap-academy\/db\/service|getServiceClient/);
    for (const call of src.matchAll(/rpc\(\s*"([^"]+)"/g)) expect(call[1]).toBe("setup_checks");
    expect(src).not.toMatch(/fetchScheduledStudents\b|fetchStudentSchedule|writeWeeklySchedule|getStudentNames/);
    expect(src).not.toContain("—");
  });
  it("the only Notion read is fetchScheduledStudentNames; staff come from the REQ-38 copy", () => {
    const all = FILES.map(read).join("\n");
    const notionImports = [...all.matchAll(/import \{([^}]+)\} from "@\/lib\/notion\/[^"]+"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()));
    expect(notionImports.filter((n) => !["readStudentsConfig", "readWorkConfig", "NotionError"].includes(n)).sort()).toEqual(["fetchScheduledStudentNames"]);
    expect(all).toContain("createPeopleStore");
  });
  it("the page is owner-only and dynamic", () => {
    const page = read("app/scheduler/setup/page.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toMatch(/viewer\.kind !== "staff" \|\| viewer\.role !== "owner"/);
    expect(page).toContain("notFound()");
  });
});
