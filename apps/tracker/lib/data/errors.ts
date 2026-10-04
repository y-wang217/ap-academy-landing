/** Database errors in plain words. Never shown as success (non-negotiable 6). */
type DbError = { code?: string | null; message?: string | null } | null | undefined;

export function dbMessage(error: DbError): string {
  if (!error) return "Could not save. Try again.";
  const message = error.message ?? "";
  if (/weights must sum to 100/.test(message)) {
    const got = message.match(/got ([\d.]+)/)?.[1];
    return got ? `Category weights must add up to 100. They add up to ${Number(got)}.` : "Category weights must add up to 100.";
  }
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
    case "P0002":
    case "PGRST116":
      return "Not found. It may have been removed.";
    default:
      return "Could not save. Try again.";
  }
}
