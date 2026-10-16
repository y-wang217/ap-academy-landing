/** The claim state of a student, in one place (REQ-15). */
export function claimLabel(
  student: { publishedAt: string | null; userId: string | null },
  loginEmail: string | null,
): string | null {
  if (!student.publishedAt) return null;
  if (!student.userId) return "Not claimed yet";
  return loginEmail ? `Signed in as ${loginEmail}` : "Signed in";
}
