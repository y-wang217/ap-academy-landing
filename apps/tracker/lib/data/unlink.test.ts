import { describe, expect, it } from "vitest";
import { checkUnlink } from "./unlink";

const claimed = { email: "sam@example.com", userId: "u1" };

describe("checkUnlink (AC13)", () => {
  it("refuses a teacher", () => {
    const r = checkUnlink({ role: "teacher", student: claimed, newEmail: "x@example.com", loginEmail: "sam@example.com" });
    expect(r).toEqual({ ok: false, error: "You don't have access to that." });
  });
  it("refuses an unclaimed student", () => {
    const r = checkUnlink({ role: "owner", student: { email: "sam@example.com", userId: null }, newEmail: "x@example.com", loginEmail: null });
    expect(r).toEqual({ ok: false, error: "This student isn't linked to a login." });
  });
  it("refuses the address the student already has", () => {
    const r = checkUnlink({ role: "owner", student: claimed, newEmail: "sam@example.com", loginEmail: "sam@example.com" });
    expect(r).toMatchObject({ ok: false, fields: { email: "Enter the correct address" } });
  });
  it("updates the email when it still matches the login", () => {
    expect(checkUnlink({ role: "owner", student: claimed, newEmail: "real@example.com", loginEmail: "sam@example.com" })).toEqual({ ok: true, updateEmail: true });
  });
  it("only retries the unlink when the stored email already differs from the login", () => {
    const student = { email: "real@example.com", userId: "u1" };
    expect(checkUnlink({ role: "owner", student, newEmail: "real@example.com", loginEmail: "sam@example.com" })).toEqual({ ok: true, updateEmail: false });
  });
});
