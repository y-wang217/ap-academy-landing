import { describe, expect, it } from "vitest";
import { checkParentInvite } from "./parent-invite";

const students = ["sam@example.com", "bea@example.com"];

describe("checkParentInvite (AC7, AC14)", () => {
  it("refuses a teacher", () => {
    expect(checkParentInvite({ role: "teacher", email: "mum@example.com", studentEmails: students })).toEqual({
      ok: false, error: "You don't have access to that.",
    });
  });
  it("refuses a student's email", () => {
    expect(checkParentInvite({ role: "owner", email: "sam@example.com", studentEmails: students })).toEqual({
      ok: false, error: "That email belongs to a student. Use the parent's own email.", fields: { email: "Already a student's email" },
    });
  });
  it("accepts a valid email, ignoring case", () => {
    expect(checkParentInvite({ role: "owner", email: "Mum@Example.com", studentEmails: students })).toEqual({ ok: true });
  });
});
