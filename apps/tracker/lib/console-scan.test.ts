import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-53 AC7, AC8: the console reads through the owner's own client only.
// REQ-54 AC6, AC12: it never writes, never uses the service client, and only providers.ts reaches lib/notion/.
const APP = join(__dirname, "..");
const read = (f: string) => readFileSync(join(APP, f), "utf8");
const walk = (dir: string): string[] =>
  existsSync(join(APP, dir))
    ? readdirSync(join(APP, dir)).flatMap((n) => {
        const p = `${dir}/${n}`;
        return statSync(join(APP, p)).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
      })
    : [];
const FILES = [...walk("app/console"), ...walk("app/api/console"), ...walk("lib/console"), ...walk("components/console")];

describe("console source scan (AC7, AC8)", () => {
  it("covers the console files", () => {
    for (const f of [
      "app/console/layout.tsx", "app/console/page.tsx", "app/console/loading.tsx", "app/api/console/health/route.ts", "lib/console/guard.ts",
      "lib/console/handlers.ts", "components/console/session-expired.tsx", "lib/console/contracts.ts", "lib/console/facade.ts",
      "lib/console/people-read.ts", "lib/console/providers.ts",
    ]) {
      expect(FILES).toContain(f);
    }
  });

  it.each(FILES)("%s uses no service client, scheduler identity or write, and reaches Notion only from providers.ts", (f) => {
    const src = read(f);
    expect(src).not.toMatch(/@ap-academy\/db\/service|getServiceClient/);
    expect(src).not.toMatch(/resolveSchedulerIdentity|requireScheduler/);
    const notion = [...src.matchAll(/from "([^"]*\/notion\/[^"]*)"/g)].map((m) => m[1]);
    if (f === "lib/console/providers.ts") {
      for (const m of notion) expect(["../notion/config", "../notion/leads", "../notion/touches", "../notion/lessons", "../notion/work", "../notion/billing"]).toContain(m);
    } else {
      expect(notion).toEqual([]);
      expect(src).not.toMatch(/lib\/notion\/|\.\.\/notion\//);
    }
    expect(src).not.toContain("claim_staff_link");
    expect(src).not.toMatch(/\.(insert|update|upsert|delete|patch)\(/);
    expect(src).not.toMatch(/pages\.create|"PATCH"|"DELETE"/);
    for (const call of src.matchAll(/rpc\(\s*"([^"]+)"/g)) expect(["is_org_owner", "people_synced_at"]).toContain(call[1]);
    expect(src).not.toContain("—");
  });

  it("the rpcs run on the viewer's own client", () => {
    expect(read("lib/console/handlers.ts")).toMatch(/viewer\.db\.tracker\.rpc\("is_org_owner"/);
    expect(read("lib/console/providers.ts")).toMatch(/createConsolePeopleReader\(viewer\.db\.tracker, viewer\.orgId\)/);
    expect(read("lib/console/people-read.ts")).not.toMatch(/createPeopleStore|lib\/data\/people|"\.\.\/data\/people"/);
  });

  it("there is no console not-found or error boundary", () => {
    expect(existsSync(join(APP, "app/console/not-found.tsx"))).toBe(false);
    expect(existsSync(join(APP, "app/console/error.tsx"))).toBe(false);
  });

  it.each(["app/console/layout.tsx", "app/console/page.tsx"])("%s is dynamic and gated by ownerViewer()", (f) => {
    const src = read(f);
    expect(src).toContain('export const dynamic = "force-dynamic"');
    expect(src).toContain("await ownerViewer()");
  });

  it("ownerViewer holds the owner gate and notFound()", () => {
    const pages = read("lib/pages.ts");
    const body = pages.slice(pages.indexOf("export const ownerViewer"));
    expect(body).toMatch(/viewer\.kind !== "staff" \|\| viewer\.role !== "owner"\) notFound\(\)/);
    expect(body.slice(0, body.indexOf("});"))).not.toMatch(/resolveSchedulerIdentity|claim_staff_link/);
  });

  it("loading.tsx imports nothing from lib/data and reads no viewer", () => {
    const src = read("app/console/loading.tsx");
    expect(src).not.toMatch(/lib\/data|getViewer|ownerViewer/);
  });
});
