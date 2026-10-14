import { describe, expect, it } from "vitest";
import { isActiveTeachingStaff } from "./staff";

const s = (status: string | null, functions: string[]) => ({ status, functions });

describe("isActiveTeachingStaff", () => {
  it("accepts Active or Onboarding staff who teach", () => {
    expect(isActiveTeachingStaff(s("Active", ["Teacher"]))).toBe(true);
    expect(isActiveTeachingStaff(s("Onboarding", ["Trial Teacher"]))).toBe(true);
    expect(isActiveTeachingStaff(s("Active", ["Owner", "Closer", "Teacher"]))).toBe(true);
  });
  it("rejects setters, closers and owners who do not teach", () => {
    expect(isActiveTeachingStaff(s("Active", ["Setter"]))).toBe(false);
    expect(isActiveTeachingStaff(s("Active", ["Closer"]))).toBe(false);
    expect(isActiveTeachingStaff(s("Active", ["Owner"]))).toBe(false);
    expect(isActiveTeachingStaff(s("Active", []))).toBe(false);
  });
  it("rejects inactive, unknown or missing status (fails closed)", () => {
    expect(isActiveTeachingStaff(s("Inactive", ["Teacher"]))).toBe(false);
    expect(isActiveTeachingStaff(s("Paused", ["Teacher"]))).toBe(false);
    expect(isActiveTeachingStaff(s(null, ["Teacher"]))).toBe(false);
  });
  it("ignores Role: it is seniority, not function", () => {
    expect(isActiveTeachingStaff({ ...s("Active", ["Setter"]), role: "Lead Teacher" } as never)).toBe(false);
  });
});
