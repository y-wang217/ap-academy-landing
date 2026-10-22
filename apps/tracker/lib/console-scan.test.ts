import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSOLE_MODES } from "./console/modes";
import { slotsFor } from "./console/panel-slots";

// REQ-53 AC7, AC8: the console reads through the owner's own client only.
// REQ-54 AC6, AC12: it never writes, never uses the service client, and only providers.ts reaches lib/notion/.
const APP = join(__dirname, "..");
const read = (f: string) => readFileSync(join(APP, f), "utf8");
const walk = (dir: string): string[] =>
  existsSync(join(APP, dir))
    ? readdirSync(join(APP, dir)).flatMap((n) => {
        const p = `${dir}/${n}`;
        return statSync(join(APP, p)).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
      })
    : [];
const FILES = [...walk("app/console"), ...walk("app/api/console"), ...walk("lib/console"), ...walk("components/console")];

describe("console source scan (AC7, AC8)", () => {
  it("covers the console files", () => {
    for (const f of [
      "app/console/layout.tsx", "app/console/page.tsx", "app/console/loading.tsx", "app/api/console/health/route.ts", "lib/console/guard.ts",
      "lib/console/handlers.ts", "components/console/session-expired.tsx", "lib/console/contracts.ts", "lib/console/facade.ts",
      "lib/console/people-read.ts", "lib/console/providers.ts",
      "lib/console/operations.ts", "lib/console/operations-read.ts", "components/console/teacher-load.tsx", "components/console/lesson-gaps.tsx",
    ]) {
      expect(FILES).toContain(f);
    }
  });

  it("covers the REQ-55 shell, kit, helpers, stylesheet and preview", () => {
    for (const f of [
      "app/console/console.css", "app/console/preview/page.preview.tsx",
      "lib/console/panel-view.ts", "lib/console/modes.ts", "lib/console/panel-slots.ts", "lib/console/format.ts", "lib/console/sync.ts", "lib/console/sync-poller.ts", "lib/console/preview-flag.ts",
      "components/console/kit/instrument-panel.tsx", "components/console/kit/metric.tsx", "components/console/kit/gauge.tsx", "components/console/kit/radar.tsx", "components/console/kit/queue-row.tsx",
      "components/console/kit/status-badge.tsx", "components/console/kit/failure-state.tsx", "components/console/kit/freshness-line.tsx",
      "components/console/shell/horizon.tsx", "components/console/shell/header-rail.tsx", "components/console/shell/mode-tabs.tsx", "components/console/shell/bridge-clock.tsx",
      "components/console/shell/sync-provider.tsx", "components/console/shell/mode-context.tsx", "components/console/shell/physical-rail.tsx", "components/console/shell/shortcut-help.tsx", "components/console/shell/bridge.tsx",
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

// REQ-55: the bridge shell and instrument kit.
const UI = [...walk("app/console"), ...walk("lib/console"), ...walk("components/console")];
const CSS = read("app/console/console.css");
const rule = (selector: string, css = CSS) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at) + 1);
};
// The reference render's and the offline preview's fiction (design, AC7 scan list).
const FICTION = [
  "Priya Sharma", "James Chen", "Aisha Khan", "Michael Tan", "Sarah Wilson", "Daniel Park", "Emma Liu", "Oliver Grant",
  "48,320", "62,000", "18,400", "2,400", "28 May 2024", "May 2024", "+6.0", "Systems Online", "Comms Nominal", "Payments Online",
  "Integrations Synced", "Growth On Track", "all systems operational", "Territory: Global", "High intent lead surge", "95% capacity",
  "Simulated", "Demo data", "Illustrative",
];

describe("REQ-55 console source scan", () => {
  it.each(UI)("%s has no raster image (AC1)", (f) => {
    const src = read(f);
    expect(src).not.toContain("<img");
    expect(src).not.toContain("next/image");
    expect(src).not.toMatch(/background-image:\s*url\(/);
    expect(src).not.toMatch(/\.(png|jpe?g|webp|gif)\b/i);
  });

  it("the horizon is text-free inline SVG", () => {
    const src = read("components/console/shell/horizon.tsx");
    expect(src).toContain("<svg");
    expect(src).not.toContain("<text");
  });

  it.each(UI)("%s carries none of the reference's fiction (AC7)", (f) => {
    const src = read(f).toLowerCase();
    for (const s of FICTION) expect(src).not.toContain(s.toLowerCase());
    expect(src).not.toMatch(/\bonline\b/);
  });

  it("only the preview page imports from test/ (AC7)", () => {
    const importers = UI.filter((f) => /from\s+["'](@\/|(\.\.\/)+)test\//.test(read(f)));
    expect(importers).toEqual(["app/console/preview/page.preview.tsx"]);
  });

  it.each(UI)("%s uses no type under 12 px (AC11)", (f) => {
    const src = read(f);
    expect(src).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/);
    for (const m of src.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(12);
  });

  it.each(UI)("%s downloads no font (AC11)", (f) => {
    const src = read(f);
    expect(src).not.toContain("@font-face");
    expect(src).not.toMatch(/\.(woff2?|ttf|otf)\b/);
  });

  it("declares the card's tokens on [data-console] (AC11)", () => {
    const tokens = rule("[data-console]");
    const want: Record<string, string> = {
      "--canvas": "#100D18", "--surface": "#1D1422", "--surface-raised": "#281926", "--border": "#754454", "--amber": "#FFC078", "--coral": "#FF6B65",
      "--magenta": "#E14E87", "--cyan": "#6FCDD2", "--green": "#86D7A0", "--muted": "#BB9DAF", "--text": "#FFE8D1",
    };
    for (const [name, value] of Object.entries(want)) expect(tokens.toLowerCase()).toContain(`${name}: ${value.toLowerCase()};`);
    expect(tokens).toMatch(/--shadow-glow:\s*[^;]+;/);
    expect(tokens).toMatch(/--font-display:\s*system-ui\b/);
    expect(tokens).toMatch(/--font-readout:\s*ui-monospace\b/);
  });

  it.each(["components/console/kit/metric.tsx", "components/console/kit/gauge.tsx"])("%s readouts use tabular digits (AC11)", (f) => {
    expect(read(f)).toContain("tabular-nums");
  });

  it("the sweep turns once in 10 s, stops under reduced motion and pauses while hidden (AC6, AC9)", () => {
    expect(CSS).toMatch(/@keyframes console-sweep\s*\{/);
    const sweep = rule(".console-sweep");
    expect(sweep).toMatch(/animation:\s*console-sweep\s+10s\b[^;]*\binfinite\b/);
    const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced.length).toBeLessThan(CSS.length);
    const reducedBlock = reduced.slice(0, reduced.indexOf("\n}") + 2);
    expect(rule(".console-sweep", reducedBlock)).toMatch(/animation:\s*none/);
    expect(rule(".console-motion-on", reducedBlock)).toMatch(/display:\s*none/);
    expect(rule(".console-motion-reduced", reducedBlock)).toMatch(/display:\s*inline/);
    expect(rule("[data-hidden] .console-sweep")).toMatch(/animation-play-state:\s*paused/);
    expect(rule(".console-motion-reduced", CSS.replace(reducedBlock, ""))).toMatch(/display:\s*none/);
  });

  it("focus is stronger than hover (AC13)", () => {
    const focus = rule("[data-console] :focus-visible");
    expect(focus).toMatch(/outline:\s*2px solid var\(--amber\)/);
    expect(focus).toMatch(/outline-offset:\s*\d+px/);
    const hovers = [...CSS.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)];
    expect(hovers.length).toBeGreaterThan(0);
    for (const [, , body] of hovers) {
      expect(body).not.toMatch(/outline|box-shadow/);
      for (const w of body.matchAll(/border(?:-[a-z]+)?-width:\s*([^;]+);/g)) expect(w[1].trim()).toBe("1px");
      expect(body).toMatch(/border-color:\s*var\(--muted\)/);
    }
  });

  // AC5: every slot of each mode is placed at every one of the five widths, and nothing else is.
  const BLOCKS = ["(min-width: 1440px)", "(min-width: 1280px) and (max-width: 1439px)", "(min-width: 901px) and (max-width: 1279px)", "(min-width: 641px) and (max-width: 900px)", "(max-width: 640px)"];
  const mediaBlock = (query: string) => {
    const at = CSS.indexOf(`@media ${query} {`);
    return at < 0 ? "" : CSS.slice(at, CSS.indexOf("\n}", at) + 2);
  };
  it.each(CONSOLE_MODES.flatMap((m) => BLOCKS.map((b) => [m, b] as const)))("%s places every slot at %s", (mode, query) => {
    const grid = rule(`.console-grid-${mode}`, mediaBlock(query));
    const areas = grid.match(/grid-template-areas:([^;]+);/)?.[1] ?? "";
    const names = new Set([...areas.matchAll(/"([^"]+)"/g)].flatMap((m) => m[1].trim().split(/\s+/)));
    expect([...names].sort()).toEqual(slotsFor(mode).map((s) => s.id).sort());
  });

  it("at 640 px and below every mode is one column in slot order", () => {
    for (const mode of CONSOLE_MODES) {
      const grid = rule(`.console-grid-${mode}`, mediaBlock("(max-width: 640px)"));
      const rows = [...(grid.match(/grid-template-areas:([^;]+);/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1].trim());
      expect(rows).toEqual(slotsFor(mode).map((s) => s.id));
    }
  });
});

// REQ-60 AC3, AC4, AC8: Creation mode creates nothing, writes no Work row, and calls no recording or publishing host.
const CREATION_FILES = [
  "lib/console/creation.ts", "components/console/creation/task-facts.tsx", "components/console/creation/next-asset.tsx",
  "components/console/creation/work-queue.tsx", "components/console/creation/weekly-review.tsx",
];
// The files REQ-60 adds or changes. providers.ts is exempt from the fetch( rule only: it hosts the abort-bound
// fetcher the Notion reader ports run on (Open gap 3), and the reader tests prove those ports only read.
const CREATION_TOUCHED = [...CREATION_FILES, "lib/console/contracts.ts", "lib/console/panel-slots.ts", "components/console/shell/bridge.tsx", "app/console/page.tsx", "app/console/console.css"];
const NO_CREATE_OR_WRITE = ['"/pages"', "/v1/pages", "pages.create", "createTaskPage", "createLogEntry", "appendToDo", "appendTeacher", "NOTION_WORK_WRITE_ENABLED", '"PATCH"'];
const HOSTS = /youtube|youtu\.be|tiktok|instagram|facebook|linkedin|vimeo|buffer\.com|hootsuite|\bx\.com|twitter/i;

describe("REQ-60 Creation scan", () => {
  it("covers the Creation files", () => {
    for (const f of [...CREATION_FILES, "lib/console/providers.ts"]) expect(FILES).toContain(f);
  });

  it.each(FILES)("%s creates no Notion page and writes no Work row (AC3, AC4)", (f) => {
    const src = read(f);
    for (const s of NO_CREATE_OR_WRITE) expect(src, s).not.toContain(s);
  });

  it.each(FILES)("%s names no recording or publishing host (AC8)", (f) => {
    expect(read(f)).not.toMatch(HOSTS);
  });

  it.each(CREATION_TOUCHED)("%s makes no fetch call (AC8)", (f) => {
    expect(read(f)).not.toContain("fetch(");
  });

  it("providers.ts reaches the Work reader through fetchWorkItems and fetchTaskTypeNames only", () => {
    const src = read("lib/console/providers.ts");
    expect(src).toMatch(/import \{ fetchTaskTypeNames, fetchWorkItems \} from "\.\.\/notion\/work";/);
  });
});
