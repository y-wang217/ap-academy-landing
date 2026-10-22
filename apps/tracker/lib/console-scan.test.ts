import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// REQ-53 AC7, AC8: the console reads nothing but the owner check, through the owner's own client.
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
    for (const f of ["app/console/layout.tsx", "app/console/page.tsx", "app/console/loading.tsx", "app/api/console/health/route.ts", "lib/console/guard.ts", "lib/console/handlers.ts", "components/console/session-expired.tsx"]) {
      expect(FILES).toContain(f);
    }
  });

  it.each(FILES)("%s uses no service client, scheduler identity, Notion or write", (f) => {
    const src = read(f);
    expect(src).not.toMatch(/@ap-academy\/db\/service|getServiceClient/);
    expect(src).not.toMatch(/resolveSchedulerIdentity|requireScheduler/);
    expect(src).not.toMatch(/lib\/notion\//);
    expect(src).not.toContain("claim_staff_link");
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    for (const call of src.matchAll(/rpc\(\s*"([^"]+)"/g)) expect(call[1]).toBe("is_org_owner");
    expect(src).not.toContain("—");
  });

  it("the only rpc is is_org_owner on the viewer's own client", () => {
    const handlers = read("lib/console/handlers.ts");
    expect(handlers).toMatch(/viewer\.db\.tracker\.rpc\("is_org_owner"/);
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
