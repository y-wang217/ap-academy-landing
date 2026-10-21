import { describe, expect, it } from "vitest";
import { buildDirectory, matchSender, normalizeEmail } from "./match";
import type { FamilyEntry } from "../notion/parents";

// REQ-42 AC17: sender to family, lower-cased and trimmed, siblings together.
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";
const entry = (studentId: string, studentName: string, parentEmail: string): FamilyEntry => ({ studentId, studentName, stage: "Active", parentEmail, parentName: "Pat" });

describe("matching", () => {
  const dir = buildDirectory([entry(S1, "Sam Lee", "Ann@X.com"), entry(S2, "Haider Afzal", "fam@y.com"), entry(S3, "Ada Afzal", " FAM@y.com "), entry("44444444-4444-4444-8444-444444444444", "No Email", "")]);

  it("normalises an address", () => expect(normalizeEmail("  Ann@X.com ")).toBe("ann@x.com"));

  it("matches one page", () => {
    expect(matchSender(dir, "  ann@x.COM ")).toEqual({ state: "matched", studentIds: [S1], firstNames: ["Sam"] });
  });

  it("matches siblings to the family", () => {
    expect(matchSender(dir, "fam@y.com")).toEqual({ state: "matched", studentIds: [S2, S3], firstNames: ["Haider", "Ada"] });
  });

  it("gives unknown for no page", () => expect(matchSender(dir, "who@z.com")).toEqual({ state: "unknown" }));

  it("never matches an empty Parent Email", () => {
    expect(matchSender(dir, "")).toEqual({ state: "unknown" });
    expect([...dir.keys()]).not.toContain("");
  });
});
