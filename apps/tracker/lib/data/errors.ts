/** Database errors in plain words. Never shown as success (non-negotiable 6). */
type DbError = { code?: string | null; message?: string | null } | null | undefined;

export function dbMessage(error: DbError): string {
  if (!error) return "Could not save. Try again.";
  const message = error.message ?? "";
  if (/weights must sum to 100/.test(message)) {
    const got = message.match(/got ([\d.]+)/)?.[1];
    return got ? `Category weights must add up to 100. They add up to ${Number(got)}.` : "Category weights must add up to 100.";
  }
  const stranded = message.match(/say where the work in (.+) goes/);
  if (stranded) return `Say where the work in ${stranded[1]} goes. It has marks.`;
  if (/only a confirmed syllabus gets a new version/.test(message)) return "This syllabus is not confirmed yet. Change its categories directly.";
  if (/category to carry over|carried over twice/.test(message)) return "The new syllabus does not match the current one. Draft it again.";
  if (/confirmed syllabus version is read-only|categories of a confirmed/.test(message)) {
    return "This syllabus is confirmed and can't be changed.";
  }
  switch (error.code) {
    case "42501":
      return "You don't have access to that.";
    case "23505":
      return "That already exists. Use a different value.";
    case "23503":
      return "That is still in use, so it can't be removed.";
    case "23514":
      return "One of the values is out of range.";
    case "PGRST202":
      // A database function the app calls is not deployed yet (a migration not applied).
      return "This change needs a database update that is not live yet. Nothing was saved.";
    case "P0002":
    case "PGRST116":
      return "Not found. It may have been removed.";
    default:
      return "Could not save. Try again.";
  }
}
