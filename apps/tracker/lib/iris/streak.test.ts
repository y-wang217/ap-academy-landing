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
