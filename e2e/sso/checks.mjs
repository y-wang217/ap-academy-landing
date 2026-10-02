// Acceptance checks 1 to 6 of docs/spec/single-domain-done-state.md, in a real
// browser, against both apps running behind landing's rewrite. The session the
// auth callback would set is injected as a cookie: the magic-link email itself
// is not tested here. Run through ./run.sh.
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

// 3. After login, /tracker shows email and membership role.
notFound.length = 0;
r = await page.goto(BASE + "/tracker");
const body3 = await page.textContent("main");
check("3 /tracker shows email", page.url() === BASE + "/tracker" && body3.includes("student@example.com"), page.url());
check("3b /tracker shows membership role", body3.includes("teacher"));

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

await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
