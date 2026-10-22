import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TUNING } from "../domain/tuning";

// REQ-44 AC11: the streak threshold lives in TUNING and is mirrored as a constant in migration 0025.
const MIGRATION = readFileSync(join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "0025_iris_drafts.sql"), "utf8");

describe("auto-send streak threshold", () => {
  it("TUNING.irisAutoSendStreak equals the constant in 0025_iris_drafts.sql", () => {
    const m = /streak_threshold constant integer := (\d+);/.exec(MIGRATION);
    expect(m, "constant in the migration").not.toBeNull();
    expect(Number(m![1])).toBe(TUNING.irisAutoSendStreak);
    expect(TUNING.irisAutoSendStreak).toBe(20);
  });
});

// REQ-46 AC7: count_review keeps one streak row per (org, reply type), so the two
// schedule-aware types each get their own streak from the draft's reply_type.
describe("streaks per reply type", () => {
  it("count_review inserts and locks the reply_types row by org and type, from the draft's reply_type", () => {
    expect(MIGRATION).toMatch(/insert into iris\.reply_types \(org_id, type\) values \(p_org, p_type\)/);
    expect(MIGRATION).toMatch(/where org_id = p_org and type = p_type for update/);
    expect(MIGRATION).toMatch(/perform iris\.count_review\(d\.org_id, d\.reply_type, 'approve'/);
  });
});
