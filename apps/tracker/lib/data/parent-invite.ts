import { failed, type Result } from "../result";

type InviteCheck = { ok: true } | Extract<Result, { ok: false }>;

/**
 * The checks the invite action runs before the insert (REQ-22). Pure, for plain
 * messages; the database trigger and RLS enforce the same rules.
 */
export function checkParentInvite(input: { role: "owner" | "teacher"; email: string; studentEmails: string[] }): InviteCheck {
  if (input.role !== "owner") return failed("You don't have access to that.") as InviteCheck;
  const email = input.email.trim().toLowerCase();
  if (input.studentEmails.some((e) => e.trim().toLowerCase() === email)) {
    return failed("That email belongs to a student. Use the parent's own email.", { email: "Already a student's email" }) as InviteCheck;
  }
  return { ok: true };
}
