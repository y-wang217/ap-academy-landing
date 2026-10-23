import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TUNING } from "../domain/tuning";
import { DEFAULT_CREDITS_DATA_SOURCE_ID, DEFAULT_INVOICES_DATA_SOURCE_ID } from "../notion/config";
import { AUTOMATED_LINE, NEVER_AUTO_SEND } from "./policy";

// REQ-42 AC8, AC25: what the Iris code may name, and who may read parent fields.
const ROOT = join(__dirname, "..", "..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (f === "node_modules" || f === ".next") return [];
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
});
const rel = (f: string) => f.slice(ROOT.length + 1);
const IRIS = files(join(ROOT, "lib", "iris"));
const PARENTS = join(ROOT, "lib", "notion", "parents.ts");
const SCANNED = [...IRIS, PARENTS];
// The Lessons data source (REQ-9 and REQ-39). Not in config.ts on this branch, so pinned here.
const LESSONS_DATA_SOURCE_ID = "6300f58a-8b8c-4789-88c1-e44272079b0f";

describe("Iris source scan", () => {
  it("covers the Iris files", () => {
    expect(IRIS.map(rel)).toEqual(expect.arrayContaining(["lib/iris/gmail.ts", "lib/iris/intake.ts", "lib/iris/policy.ts"]));
  });

  it("names no forbidden Notion property (case-sensitive) and no billing or Lessons data source", () => {
    const names = ["Parent Phone", "Sales Notes", "Notes", "Hourly Rate", "Billing Family", "Weekly Schedule", "Invoices", "Missed Sessions", "Lessons", "Paid to Teacher"];
    const ids = [DEFAULT_INVOICES_DATA_SOURCE_ID, DEFAULT_CREDITS_DATA_SOURCE_ID, LESSONS_DATA_SOURCE_ID];
    for (const f of SCANNED) {
      const src = readFileSync(f, "utf8");
      for (const n of names) expect(src.includes(n), `${rel(f)} names ${n}`).toBe(false);
      for (const i of ids) expect(src.includes(i), `${rel(f)} names ${i}`).toBe(false);
    }
  });

  // REQ-48 AC9: gmail.send joins the read-only scope, in gmail.ts only; sending is its messages/send call only.
  it("names only the read-only and send scopes, the send scope and send call only in gmail.ts, and no other write path", () => {
    for (const f of IRIS) {
      const src = readFileSync(f, "utf8");
      const scopes = src.match(/googleapis\.com\/auth\/[\w.]+/g) ?? [];
      const allowed = rel(f) === "lib/iris/gmail.ts" ? ["googleapis.com/auth/gmail.readonly", "googleapis.com/auth/gmail.send"] : ["googleapis.com/auth/gmail.readonly"];
      for (const s of scopes) expect(allowed, rel(f)).toContain(s);
      if (rel(f) !== "lib/iris/gmail.ts") expect(src, rel(f)).not.toMatch(/messages\/send\b/);
      expect(src, rel(f)).not.toMatch(/\/drafts\b|\/modify\b|batchModify|\btrash\b/);
    }
    const gmail = readFileSync(join(ROOT, "lib", "iris", "gmail.ts"), "utf8");
    expect(gmail).toContain("googleapis.com/auth/gmail.readonly");
    expect(gmail).toContain("googleapis.com/auth/gmail.send");
    expect(gmail.match(/messages\/send\b/g)).toHaveLength(1);
  });

  it("parents.ts is imported only from lib/iris/ and the run route, never cached, and only reads", () => {
    const importers = files(ROOT).filter((f) => f !== PARENTS && /notion\/parents["']/.test(readFileSync(f, "utf8"))).map(rel);
    expect(importers.filter((f) => !f.startsWith("lib/iris/"))).toEqual(["app/api/iris/run/route.ts"]);
    for (const f of [PARENTS, ...IRIS, join(ROOT, "app/api/iris/run/route.ts")]) {
      expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/unstable_cache|"use cache"/);
    }
    expect(readFileSync(join(ROOT, "lib", "notion", "cached.ts"), "utf8")).not.toMatch(/parents/);
    expect(readFileSync(PARENTS, "utf8")).not.toMatch(/"PATCH"|"DELETE"|"PUT"/);
  });
});

// REQ-43 AC10, AC12: no prompt or answer text anywhere in Postgres, and the classify files obey the scans above.
describe("Iris stores no model text", () => {
  const MIGRATION = readFileSync(join(ROOT, "..", "..", "supabase", "migrations", "0024_iris_core.sql"), "utf8");

  it("no iris table has a column named like prompt, answer, summary, completion or response", () => {
    const tables = [...MIGRATION.matchAll(/create table (iris\.\w+) \(([\s\S]*?)\n\);/g)];
    expect(tables.map((t) => t[1])).toEqual(expect.arrayContaining(["iris.messages", "iris.ai_calls", "iris.events", "iris.runs"]));
    for (const [, table, body] of tables) {
      const columns = body.split("\n").map((l) => l.trim()).filter((l) => /^[a-z_]+ /.test(l) && !/^(check|unique|primary|foreign|constraint)\b/.test(l)).map((l) => l.split(" ")[0]);
      for (const c of columns) expect(c, `${table}.${c}`).not.toMatch(/prompt|answer|summary|completion|response/);
    }
  });

  it("the store and the classify step never write a summary or the prompt", () => {
    for (const f of [join(ROOT, "lib", "data", "iris.ts"), join(ROOT, "lib", "iris", "store.ts"), join(ROOT, "lib", "iris", "store.fake.ts"), join(ROOT, "lib", "iris", "classify-step.ts")]) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/\bsummary\b/);
      expect(src, rel(f)).not.toMatch(/\b(system|user)\s*:/);
    }
  });

  it("no 0025 table has such a column either (REQ-44)", () => {
    const m25 = readFileSync(join(ROOT, "..", "..", "supabase", "migrations", "0025_iris_drafts.sql"), "utf8");
    const tables = [...m25.matchAll(/create table (iris\.\w+) \(([\s\S]*?)\n\);/g)];
    expect(tables.map((t) => t[1])).toEqual(["iris.drafts", "iris.reply_types", "iris.eval_labels", "iris.eval_runs", "iris.pushes", "iris.push_days"]);
    for (const [, table, body] of tables) {
      const columns = body.split("\n").map((l) => l.trim()).filter((l) => /^[a-z_]+ /.test(l) && !/^(check|unique|primary|foreign|constraint)\b/.test(l)).map((l) => l.split(" ")[0]);
      for (const c of columns) expect(c, `${table}.${c}`).not.toMatch(/prompt|answer|summary|completion|response|reason_text/);
    }
  });

  it("no 0028 table has such a column either (REQ-48)", () => {
    const m27 = readFileSync(join(ROOT, "..", "..", "supabase", "migrations", "0028_iris_sends.sql"), "utf8");
    const tables = [...m27.matchAll(/create table (iris\.\w+) \(([\s\S]*?)\n\);/g)];
    expect(tables.map((t) => t[1])).toEqual(["iris.sends"]);
    for (const [, table, body] of tables) {
      const columns = body.split("\n").map((l) => l.trim()).filter((l) => /^[a-z_]+ /.test(l) && !/^(check|unique|primary|foreign|constraint)\b/.test(l)).map((l) => l.split(" ")[0]);
      expect(columns, table).toContain("rfc_message_id");
      for (const c of columns) expect(c, `${table}.${c}`).not.toMatch(/prompt|answer|summary|completion|response|body|email/);
    }
  });

  it("the draft step never writes the model's reason or the prompt", () => {
    const src = readFileSync(join(ROOT, "lib", "iris", "draft-step.ts"), "utf8");
    expect(src).not.toMatch(/output\.reason/);
    expect(src).not.toMatch(/\b(system|user)\s*:/);
  });

  it("covers the classify files", () => {
    expect(IRIS.map(rel)).toEqual(expect.arrayContaining(["lib/iris/classify.ts", "lib/iris/classify-prompt.ts", "lib/iris/classify-step.ts", "lib/iris/route.ts", "lib/iris/quote.ts"]));
  });
});

// REQ-47 AC7: Iris never books. The schedule reader and the slot engine never write.
describe("Iris never books", () => {
  it("lib/data/iris-schedule.ts and lib/iris/makeup.ts hold no insert, update, upsert, delete or rpc", () => {
    for (const f of [join(ROOT, "lib", "data", "iris-schedule.ts"), join(ROOT, "lib", "iris", "makeup.ts")]) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
      expect(src, rel(f)).not.toMatch(/\b(insert|update|upsert|delete|rpc)\b/i);
    }
  });
});

// REQ-49 AC3, AC11: the SQL keeps its own copies of the never list and the streak; they match the code.
describe("auto-send constants", () => {
  const sql = readFileSync(join(ROOT, "..", "..", "supabase", "migrations", "0031_iris_auto_send.sql"), "utf8");

  it("every never list in 0031 is NEVER_AUTO_SEND, and every streak threshold is TUNING.irisAutoSendStreak", () => {
    const lists = [...sql.matchAll(/never_list constant text\[\] := array\[([^\]]*)\]/g)].map((m) => m[1].split(",").map((x) => x.trim().replace(/'/g, "")));
    expect(lists.length).toBeGreaterThanOrEqual(2);
    for (const l of lists) expect(l).toEqual([...NEVER_AUTO_SEND]);
    const streaks = [...sql.matchAll(/streak_threshold constant integer := (\d+);/g)].map((m) => Number(m[1]));
    expect(streaks.length).toBeGreaterThanOrEqual(2);
    for (const n of streaks) expect(n).toBe(TUNING.irisAutoSendStreak);
  });

  it("revokes the owner's raw switch, and AUTOMATED_LINE is the decision 13 text", () => {
    expect(sql).toMatch(/revoke update \(auto_send_enabled\) on iris\.reply_types from authenticated;/);
    expect(AUTOMATED_LINE).toBe(
      "This reply was sent automatically from AP Academy's written policy. If anything here is not right, reply to this email and Charlie will pick it up personally.",
    );
  });
});
