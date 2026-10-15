// Acceptance checks 1 to 6 of docs/spec/single-domain-done-state.md, plus 7
// (the tracker proxy skips prefetches) and 8 (security headers), in a real browser, against both apps
// running behind landing's rewrite. The session the auth callback would set is
// injected as a cookie: the magic-link email itself is not tested here. Run
// through ./run.sh.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

// Playwright is not a workspace dependency: use a global install.
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const TOKEN = "header.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMGEifQ.sig";
const session = {
  access_token: TOKEN,
  token_type: "bearer",
  expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
  refresh_token: "refresh",
  user: { id: "00000000-0000-0000-0000-00000000000a", email: "student@example.com", aud: "authenticated" },
};
const cookieValue = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const notFound = [];
page.on("response", (r) => { if (r.status() === 404) notFound.push(r.url()); });

// 1. Landing loads as before.
let r = await page.goto(BASE + "/");
check("1 landing / loads", r.status() === 200);

// 2. Logged out, /tracker redirects to the root-level /login.
r = await page.goto(BASE + "/tracker");
const url2 = new URL(page.url());
check("2 /tracker logged out -> /login?next=/tracker",
  url2.origin === BASE && url2.pathname === "/login" && url2.searchParams.get("next") === "/tracker",
  page.url());
check("2b /login page renders", (await page.textContent("h1"))?.includes("Sign in"));

// Simulate the session the auth callback would set on the shared origin.
await context.addCookies([{ name: "sb-127-auth-token", value: cookieValue, url: BASE }]);

// 3. After login, /tracker shows who is signed in, and the membership decides
// the view (a teacher membership opens the students list).
notFound.length = 0;
r = await page.goto(BASE + "/tracker");
const body3 = await page.textContent("body");
check("3 /tracker shows the signed-in email", page.url() === BASE + "/tracker" && body3.includes("student@example.com"), page.url());
check("3b /tracker shows the view for the membership role", (await page.textContent("h1")) === "Students");

// 6. Tracker assets come from /tracker/_next through landing, no 404s.
const assets = await page.$$eval("script[src],link[rel=stylesheet]", (els) =>
  els.map((e) => e.getAttribute("src") || e.getAttribute("href")));
check("6 tracker assets under /tracker/_next", assets.length > 0 && assets.every((a) => a.startsWith("/tracker/_next/")), assets.slice(0, 2).join(", "));
check("6b no 404s on /tracker", notFound.length === 0, notFound.join(", "));

// 4. Back on /sat, still signed in with no second login.
await page.goto(BASE + "/sat");
await page.waitForSelector("header button:has-text('Sign out'), header a:has-text('Sign in')");
check("4 /sat shows signed in", await page.isVisible("header button:has-text('Sign out')"));

// 5. Sign out on the tracker side, then /sat is signed out too.
await page.goto(BASE + "/tracker");
await page.click("button:has-text('Sign out')");
await page.waitForURL(BASE + "/");
const cookiesAfter = (await context.cookies(BASE)).filter((c) => c.name.startsWith("sb-"));
check("5 tracker sign-out clears the shared cookie", cookiesAfter.length === 0, JSON.stringify(cookiesAfter.map((c) => c.name)));
await page.goto(BASE + "/sat");
await page.waitForSelector("header button:has-text('Sign out'), header a:has-text('Sign in')");
check("5b /sat is signed out after tracker sign-out", await page.isVisible("header a:has-text('Sign in')"));
r = await page.goto(BASE + "/tracker");
check("5c /tracker is protected again", new URL(page.url()).pathname === "/login");

// The other direction: signed in again, sign out from /sat, tracker is signed out.
await fetch("http://127.0.0.1:54321/__reset");
await context.addCookies([{ name: "sb-127-auth-token", value: cookieValue, url: BASE }]);
await page.goto(BASE + "/tracker");
check("5d signed back in on /tracker", page.url() === BASE + "/tracker");
await page.goto(BASE + "/sat");
await page.click("header button:has-text('Sign out')");
await page.waitForSelector("header a:has-text('Sign in')");
await page.goto(BASE + "/tracker");
check("5e /sat sign-out also signs out of /tracker", new URL(page.url()).pathname === "/login", page.url());

// 7. Prefetches skip the tracker proxy (no Supabase call per link in view).
// Signed out here, so the proxy would answer with a redirect to /login.
const prefetch = { RSC: "1", "Next-Router-Prefetch": "1" };
r = await fetch(BASE + "/tracker/students/new", { redirect: "manual" });
check("7 a signed-out navigation is redirected by the proxy", r.status === 307, String(r.status));
r = await fetch(BASE + "/tracker/students/new", { redirect: "manual", headers: prefetch });
// Next 16.3 307s an RSC request without a valid `_rsc` cache-busting param to
// the same path with one (real clients always send it). Follow only that hop,
// so a proxy redirect to /login still fails the check.
const rscHop = r.status === 307 && new URL(r.headers.get("location") ?? "", BASE);
if (rscHop && rscHop.pathname === "/tracker/students/new" && rscHop.searchParams.has("_rsc")) {
  r = await fetch(rscHop, { redirect: "manual", headers: prefetch });
}
check("7b a prefetch is not seen by the proxy", r.status < 300 || r.status >= 400, String(r.status));

// 8. Security headers (REQ-11) reach the browser on every app, with exactly
// these values. Kept as an independent copy of packages/db/src/headers.ts.
const SECURITY_HEADERS = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
const hasSecurityHeaders = (res) =>
  Object.entries(SECURITY_HEADERS).every(([k, v]) => res.headers.get(k) === v);

for (const [id, path] of [["8a", "/"], ["8b", "/login"], ["8c", "/sat"]]) {
  r = await fetch(BASE + path);
  check(`${id} ${path} has the security headers`, r.status === 200 && hasSecurityHeaders(r), String(r.status));
}
r = await fetch(BASE + "/tracker", { redirect: "manual" });
check("8d signed-out /tracker redirect has the security headers", r.status === 307 && hasSecurityHeaders(r), String(r.status));
await fetch("http://127.0.0.1:54321/__reset");
r = await fetch(BASE + "/tracker", { headers: { cookie: `sb-127-auth-token=${cookieValue}` } });
check("8e signed-in /tracker has the security headers", r.status === 200 && hasSecurityHeaders(r), String(r.status));
r = await fetch("http://localhost:3001/tracker", { redirect: "manual" });
check("8f tracker's own host has the security headers", hasSecurityHeaders(r), String(r.status));

const consolePage = await browser.newPage();
const consoleProblems = [];
consolePage.on("console", (m) => {
  if ((m.type() === "error" || m.type() === "warning") && /X-Frame-Options|Permissions-Policy|Refused to/.test(m.text())) {
    consoleProblems.push(m.text());
  }
});
await consolePage.goto(BASE + "/");
const hrefs = () => consolePage.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
const calendlyLinks = await hrefs();
await consolePage.goto(BASE + "/enroll");
const stripeLinks = await hrefs();
await consolePage.goto(BASE + "/info");
check("8g no header-related console errors on / and /info", consoleProblems.length === 0, consoleProblems.join(" | "));
check("8h / keeps its outbound Calendly link and /enroll its Stripe links",
  calendlyLinks.some((h) => h.startsWith("https://calendly.com/")) && stripeLinks.some((h) => h.startsWith("https://buy.stripe.com/")));

await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
