import { failed, type Result } from "../result";

type UnlinkCheck = { ok: true; updateEmail: boolean } | Extract<Result, { ok: false }>;

/**
 * The checks the unlink action runs before touching the database (REQ-15). Pure,
 * so it is tested without mocking Next or Supabase. The database function
 * enforces the same rules; this is for plain messages.
 */
export function checkUnlink(input: {
  role: "owner" | "teacher";
  student: { email: string; userId: string | null };
  newEmail: string;
  loginEmail: string | null;
}): UnlinkCheck {
  if (input.role !== "owner") return failed("You don't have access to that.") as UnlinkCheck;
  if (!input.student.userId) return failed("This student isn't linked to a login.") as UnlinkCheck;
  const login = input.loginEmail?.trim().toLowerCase() ?? null;
  const storedDiffers = login !== null && input.student.email !== login;
  // Retrying after a partial failure: the new email is already saved, only the unlink is left.
  if (input.newEmail === input.student.email) {
    if (storedDiffers) return { ok: true, updateEmail: false };
    return failed("Check the highlighted fields.", { email: "Enter the correct address" }) as UnlinkCheck;
  }
  return { ok: true, updateEmail: true };
}
