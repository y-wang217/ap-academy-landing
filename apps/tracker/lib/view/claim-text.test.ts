import { describe, expect, it } from "vitest";
import { claimLabel } from "./claim-text";

describe("claimLabel (AC11, AC12)", () => {
  it("shows nothing for a student still in setup", () => {
    expect(claimLabel({ publishedAt: null, userId: null }, null)).toBeNull();
  });
  it("says a published unclaimed student is not claimed yet", () => {
    expect(claimLabel({ publishedAt: "2026-10-01T00:00:00Z", userId: null }, null)).toBe("Not claimed yet");
  });
  it("names the login for an owner", () => {
    expect(claimLabel({ publishedAt: "2026-10-01T00:00:00Z", userId: "u" }, "a@b.c")).toBe("Signed in as a@b.c");
  });
  it("omits the address for a teacher", () => {
    expect(claimLabel({ publishedAt: "2026-10-01T00:00:00Z", userId: "u" }, null)).toBe("Signed in");
  });
});
