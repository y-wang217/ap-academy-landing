import { describe, expect, it } from "vitest";
import { dbMessage } from "./errors";

describe("dbMessage (AC13)", () => {
  it("explains the email-first guard", () => {
    expect(dbMessage({ code: "23514", message: "change the student email before unlinking" })).toBe(
      "Change the email first, or the same person is linked again on their next sign-in.",
    );
  });
  it("explains an unclaimed student", () => {
    expect(dbMessage({ code: "P0002", message: "student is not linked to a login" })).toBe("This student isn't linked to a login.");
  });
  it("maps 42501 to no access", () => {
    expect(dbMessage({ code: "42501", message: "only an owner of this student's org can unlink" })).toBe("You don't have access to that.");
  });
});
