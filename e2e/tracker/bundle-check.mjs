// REQ-63 AC10: a tracker build without CONSOLE_PREVIEW carries no preview route, no demo data and no secret.
// Usage: node bundle-check.mjs <tracker .next> <landing .next>, with the stack env loaded (run.sh).
// The FICTION list is read from apps/tracker/test/console/fiction.ts, so it has one source.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const [trackerNext, landingNext] = process.argv.slice(2);
if (!trackerNext || !landingNext) {
  console.error("usage: node bundle-check.mjs <tracker .next> <landing .next>");
  process.exit(2);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const files = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? files(p) : [p];
      })
    : [];
// Each file once, in a minified chunk or a source map alike. A needle counts only as a whole token, not inside a
// longer word or number: a library's "102,400 bytes" is not the reference render's "2,400".
const escape = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hits = (paths, needles) => {
  const found = new Map();
  const res = needles.map((n) => [n, new RegExp(`(?<![A-Za-z0-9])${escape(n)}(?![A-Za-z0-9])`)]);
  for (const f of paths) {
    const text = readFileSync(f, "latin1");
    for (const [n, re] of res) if (!found.has(n) && text.includes(n) && re.test(text)) found.set(n, f);
  }
  return found;
};
const shown = (found) => [...found].slice(0, 5).map(([n, f]) => `${n.length > 24 ? `${n.slice(0, 12)}...` : n} in ${f}`).join(", ");

const fictionSource = readFileSync(new URL("../../apps/tracker/test/console/fiction.ts", import.meta.url), "utf8");
const FICTION = [...fictionSource.slice(fictionSource.indexOf("[")).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const SENTINELS = JSON.parse(readFileSync(new URL("./console-sentinels.json", import.meta.url), "utf8"));
check("the FICTION list and the sentinels were read", FICTION.length >= 20 && SENTINELS.length >= 5, `${FICTION.length} fiction, ${SENTINELS.length} sentinels`);

// The preview is a route only with CONSOLE_PREVIEW=1 (tracker ADR 0066).
const manifestPath = join(trackerNext, "app-path-routes-manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
check("the tracker build has an app-path routes manifest with /console", manifest !== null && Object.values(manifest).includes("/console"));
check("the manifest has no /console/preview entry", manifest !== null && !Object.entries(manifest).some(([k, v]) => k.includes("/console/preview") || String(v).includes("/console/preview")));
check("there is no server/app/console/preview output", !existsSync(join(trackerNext, "server/app/console/preview")) && !files(join(trackerNext, "server/app/console")).some((f) => f.includes("preview")));

const trackerFiles = [...files(join(trackerNext, "static")), ...files(join(trackerNext, "server"))];
check("the tracker build has static and server output", trackerFiles.length > 50, String(trackerFiles.length));
const fiction = hits(trackerFiles, FICTION);
check("no FICTION entry is in the tracker's .next/static or .next/server", fiction.size === 0, shown(fiction));
const sentinels = hits(trackerFiles, SENTINELS);
check("no fixture sentinel is in the tracker's .next/static or .next/server", sentinels.size === 0, shown(sentinels));

// Secrets from the stack env. The private key is checked by its longest base64 run, as it sits in env with \n escapes.
const env = process.env;
const keyRun = (env.IRIS_GMAIL_PRIVATE_KEY ?? "").split(/\\n|\n/).filter((l) => !l.startsWith("-----")).sort((a, b) => b.length - a.length)[0] ?? "";
const SECRETS = { NOTION_TOKEN: env.NOTION_TOKEN, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY, SCHEDULER_CRON_SECRET: env.SCHEDULER_CRON_SECRET, IRIS_CRON_SECRET: env.IRIS_CRON_SECRET, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, IRIS_GMAIL_PRIVATE_KEY: keyRun };
const missing = Object.entries(SECRETS).filter(([, v]) => !v || v.length < 12).map(([k]) => k);
check("every stack secret is set to check for", missing.length === 0, missing.join(", "));
const statics = [...files(join(trackerNext, "static")), ...files(join(landingNext, "static"))];
check("both apps have .next/static output", files(join(trackerNext, "static")).length > 0 && files(join(landingNext, "static")).length > 0);
const leaked = hits(statics, Object.values(SECRETS).filter(Boolean));
const names = [...leaked].map(([v, f]) => `${Object.keys(SECRETS).find((k) => SECRETS[k] === v)} in ${f}`);
check("no stack secret is in the tracker's or landing's .next/static", leaked.size === 0, names.join(", "));

const failed = results.filter((r) => !r.ok).length;
console.log(`\nbundle check: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
