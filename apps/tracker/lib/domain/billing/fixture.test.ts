import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BillingInputResponse } from "../../scheduler/schemas";
import { schemaKeys } from "../../../test/schema-keys";
import { BILLING_RULES_VERSION } from "./charge-state";
import { BILLING_SCHEMA_VERSION, buildBillingInput } from "./month-input";

// REQ-40 AC6, AC7: the skill's contract is this fixture and the schema, versioned here.
const dir = join(__dirname, "../../../test/fixtures/billing-input");
const fixture = JSON.parse(readFileSync(join(dir, "2026-11.input.json"), "utf8"));
const expected = readFileSync(join(dir, "2026-11.expected.json"), "utf8");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * One row per released (schemaVersion, rulesVersion). Changing the expected
 * JSON or the schema's fields without a version bump fails here: bump the
 * version, then add a row with the new hashes (docs/billing-input.md).
 */
const PINS: Record<string, { fixture: string; keys: string }> = {
  "1:1": { fixture: "PENDING", keys: "PENDING" },
};

describe("the billing input fixture month", () => {
  it("AC6: the fixture input through buildBillingInput equals the expected JSON byte for byte", () => {
    const out = buildBillingInput(fixture.input);
    expect(`${JSON.stringify(out, null, 2)}\n`).toBe(expected);
  });
  it("AC6: the expected JSON parses under the response schema", () => {
    expect(() => BillingInputResponse.parse(JSON.parse(expected))).not.toThrow();
  });
  it("AC6: the fixture covers every case the design lists", () => {
    const occ = JSON.parse(expected).students.flatMap((s: { occurrences: { schedulerState: string; purpose: string | null; chargeState: string; unconfirmed: boolean; outcome: string }[] }) => s.occurrences);
    const has = (f: (o: (typeof occ)[number]) => boolean) => occ.some(f);
    expect(has((o: { schedulerState: string }) => o.schedulerState === "moved")).toBe(true);
    expect(has((o: { chargeState: string }) => o.chargeState === "made_up")).toBe(true);
    expect(has((o: { chargeState: string }) => o.chargeState === "credit_owed")).toBe(true);
    expect(has((o: { chargeState: string }) => o.chargeState === "forfeit_pending")).toBe(true);
    expect(has((o: { purpose: string | null }) => o.purpose === "trial")).toBe(true);
    expect(has((o: { outcome: string; unconfirmed: boolean }) => o.outcome === "none" && o.unconfirmed)).toBe(true);
    expect(has((o: { chargeState: string; outcome: string }) => o.chargeState === "not_charged" && o.outcome === "none")).toBe(true);
  });
  it("AC7: the versions are pinned to the expected JSON and the schema's fields", () => {
    const keys = schemaKeys(BillingInputResponse).join("\n");
    expect(PINS[`${BILLING_SCHEMA_VERSION}:${BILLING_RULES_VERSION}`]).toEqual({ fixture: sha(expected), keys: sha(keys) });
  });
});
