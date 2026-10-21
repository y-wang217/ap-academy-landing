import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { schemaKeys } from "../test/schema-keys";
import { BillingInputResponse } from "./scheduler/schemas";

// REQ-40 AC11, AC12. The billing input reads classes and outcomes only: it
// names no money database or payout field, never reaches Notion, and writes nothing.
const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

const BILLING_INPUT_FILES = [
  "lib/domain/billing/charge-state.ts",
  "lib/domain/billing/month-input.ts",
  "lib/domain/billing/reconcile.ts",
  "lib/domain/schedule/legacy-count.ts",
  "lib/scheduler/billing-handlers.ts",
  "app/api/scheduler/monthly-billing-input/route.ts",
  "app/scheduler/billing/page.tsx",
  "components/scheduler/billing-reconciliation.tsx",
];

const FORBIDDEN: RegExp[] = [
  /\bInvoices\b/,
  /\bMissed Sessions\b/,
  /\bCredits\b/,
  /\bHourly Rate\b/,
  /\bTeacher Payouts\b/,
  /\bPaid to Teacher\b/,
  /\bPay Period\b/,
  /from\s+["'][^"']*\/notion\//,
  /\b(POST|PATCH|DELETE)\b/,
  /\.(insert|update|upsert|delete|rpc)\(/,
];

describe("billing input source scan (AC11)", () => {
  for (const file of BILLING_INPUT_FILES) {
    it(`${file} names no money database or payout field, imports nothing from lib/notion and writes nothing`, () => {
      expect(existsSync(join(root, file)), `${file} exists`).toBe(true);
      const source = read(file);
      for (const pattern of FORBIDDEN) expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
    });
  }
  it("the pure modules import no React, Next, Supabase or clock", () => {
    for (const file of BILLING_INPUT_FILES.filter((f) => f.startsWith("lib/domain/"))) {
      const source = read(file);
      expect(source, file).not.toMatch(/from\s+["'](react|next|@supabase|@ap-academy\/db)/);
      expect(source, file).not.toMatch(/Date\.now\(|new Date\(\)/);
    }
  });
  it("the parent billing file and the new folder do not import each other", () => {
    expect(read("lib/domain/billing.ts")).not.toMatch(/from\s+["']\.\/billing\//);
    for (const file of BILLING_INPUT_FILES.filter((f) => f.startsWith("lib/domain/billing/"))) {
      expect(read(file), file).not.toMatch(/from\s+["'](\.\.\/billing|@\/lib\/domain\/billing)["']/);
    }
  });
});

describe("billing input docs (AC12)", () => {
  it("every field of BillingInputResponse is documented in docs/billing-input.md", () => {
    const doc = read("docs/billing-input.md");
    const keys = schemaKeys(BillingInputResponse);
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) expect(doc, key).toContain(`\`${key}\``);
  });
});
