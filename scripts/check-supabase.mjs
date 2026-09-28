#!/usr/bin/env node
/**
 * Checks the /sat Supabase connection end to end, without the app running.
 *
 *   node scripts/check-supabase.mjs
 *   node scripts/check-supabase.mjs --create-user you@example.com
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from the
 * shell, falling back to .env.local. Uses only fetch, so it runs before
 * `npm install`.
 *
 * --create-user needs SUPABASE_SERVICE_ROLE_KEY (the sb_secret_... key) in the
 * shell for that one run. Never put it in .env.local or any NEXT_PUBLIC_ var.
 * It creates a confirmed user and confirms the handle_new_user trigger built
 * the profile row. Signing in still goes through /sat/login, which sends the
 * magic link, so the callback path gets exercised the way a student would.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
    return true;
  } catch {
    return false;
  }
}

const hadDotEnv = loadDotEnvLocal();
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const args = process.argv.slice(2);
const createIdx = args.indexOf("--create-user");
const createEmail = createIdx >= 0 ? args[createIdx + 1] : null;

let failures = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg, hint) => {
  failures += 1;
  console.log(`  FAIL  ${msg}`);
  if (hint) console.log(`        ${hint}`);
};
const info = (msg) => console.log(`  info  ${msg}`);

console.log(`\nSupabase check (${hadDotEnv ? ".env.local found" : "no .env.local, using shell env"})\n`);

// 1. Variables --------------------------------------------------------------
if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is empty", "Project Settings > API > Project URL");
else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) fail(`URL looks wrong: ${url}`, "Expected https://<ref>.supabase.co");
else ok(`URL ${url}`);

if (!anon) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY is empty", "Project Settings > API Keys > publishable (sb_publishable_...) or legacy anon key");
else if (anon.startsWith("sb_secret_") || /"role":"service_role"/.test(safeJwtPayload(anon))) fail("ANON_KEY holds a SECRET key", "This ships to every browser. Replace it with the publishable/anon key now.");
else ok(`anon key ${anon.slice(0, 14)}… (${anon.startsWith("sb_publishable_") ? "publishable" : "legacy anon JWT"})`);

if (failures) {
  console.log("\nFix the variables above, then run again.\n");
  process.exit(1);
}

function safeJwtPayload(token) {
  try {
    return Buffer.from(token.split(".")[1], "base64url").toString("utf8");
  } catch {
    return "";
  }
}

const headers = { apikey: anon, Authorization: `Bearer ${anon}` };

async function get(path, extra = {}) {
  const res = await fetch(`${url}${path}`, { headers: { ...headers, ...extra.headers }, method: extra.method ?? "GET", body: extra.body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, text, json };
}

// 2. Reachability -----------------------------------------------------------
try {
  const r = await get("/auth/v1/health");
  if (r.status === 200) ok("auth service reachable");
  else fail(`auth health returned ${r.status}`, r.text.slice(0, 200));
} catch (e) {
  fail(`cannot reach ${url}`, e.message);
  console.log("\nCheck the URL and your network, then run again.\n");
  process.exit(1);
}

// 3. Key accepted -----------------------------------------------------------
{
  const r = await get("/rest/v1/");
  if (r.status === 200) ok("anon key accepted by PostgREST");
  else if (r.status === 401) fail("anon key rejected (401)", "Key and URL are from different projects, or the key was rotated.");
  else fail(`PostgREST root returned ${r.status}`, r.text.slice(0, 200));
}

// 4. Tables from migration 0001 ----------------------------------------------
for (const table of ["profiles", "attempts"]) {
  const r = await get(`/rest/v1/${table}?select=id&limit=1`);
  if (r.status === 200 && Array.isArray(r.json)) {
    if (r.json.length === 0) ok(`table ${table} exists, RLS hides rows from anon`);
    else fail(`table ${table} returned rows to an ANONYMOUS request`, "RLS is off or a policy is wrong. Re-apply supabase/migrations/0001_sat_accounts.sql.");
  } else if (r.status === 404 || r.json?.code === "42P01" || r.json?.code === "PGRST205") {
    fail(`table ${table} not found`, "Run supabase/migrations/0001_sat_accounts.sql in the SQL editor.");
  } else {
    fail(`table ${table} check returned ${r.status}`, r.text.slice(0, 200));
  }
}

// 5. Function from migration 0002 --------------------------------------------
{
  const r = await get("/rest/v1/rpc/unsubscribe_by_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "00000000-0000-4000-8000-000000000000" }),
  });
  if (r.status === 200 && r.json === false) ok("unsubscribe_by_token exists and rejects unknown tokens");
  else if (r.status === 404 || r.json?.code === "PGRST202") fail("unsubscribe_by_token not found", "Run supabase/migrations/0002_unsubscribe.sql.");
  else fail(`unsubscribe_by_token returned ${r.status}: ${r.text.slice(0, 120)}`);
}

// 6. Signups / magic link enabled ---------------------------------------------
{
  const r = await get("/auth/v1/settings");
  if (r.status === 200 && r.json) {
    if (r.json.disable_signup) fail("sign-ups are disabled", "Authentication > Sign In / Providers > Allow new users to sign up.");
    else ok("sign-ups enabled");
    if (r.json.external?.email === false) fail("email provider disabled", "Authentication > Sign In / Providers > Email.");
    else ok("email provider enabled");
    if (r.json.mailer_autoconfirm) info("mailer autoconfirm is on: magic links skip email (fine for a local dev project, not production)");
  } else {
    fail(`auth settings returned ${r.status}`);
  }
}

info("Redirect URLs cannot be read with the anon key. Confirm by hand under");
info("Authentication > URL Configuration that these are in the allow list:");
info("  http://localhost:3000/auth/callback");
info("  https://ap-academy-landing.vercel.app/auth/callback");

// 7. Optional: create a test user ---------------------------------------------
if (createIdx >= 0) {
  console.log("");
  if (!createEmail || !createEmail.includes("@")) {
    fail("--create-user needs an email");
  } else if (!service) {
    fail("--create-user needs SUPABASE_SERVICE_ROLE_KEY in the shell", "Project Settings > API Keys > secret. Pass it inline for one run: SUPABASE_SERVICE_ROLE_KEY=sb_secret_... node scripts/check-supabase.mjs --create-user you@example.com");
  } else {
    const admin = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ email: createEmail, email_confirm: true, user_metadata: { marketing_consent: false } }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 200 || res.status === 201) {
      ok(`user created: ${body.id} (${createEmail})`);
      const p = await fetch(`${url}/rest/v1/profiles?select=id,email,marketing_consent&id=eq.${body.id}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
      const rows = await p.json().catch(() => []);
      if (Array.isArray(rows) && rows.length === 1) ok("handle_new_user trigger created the profile row");
      else fail("no profile row for the new user", "The on_auth_user_created trigger from migration 0001 is missing.");
    } else if (res.status === 422 && /already/i.test(body.msg ?? body.message ?? "")) {
      info(`${createEmail} already exists; nothing to do`);
    } else {
      fail(`create user returned ${res.status}`, JSON.stringify(body).slice(0, 200));
    }
  }
}

console.log(failures ? `\n${failures} problem(s) found.\n` : "\nAll checks passed. Start `npm run dev` and sign in at http://localhost:3000/sat/login\n");
process.exit(failures ? 1 : 0);
