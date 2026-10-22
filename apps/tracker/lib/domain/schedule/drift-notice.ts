/** One adopted student's drift fields, as the import preview returns them (REQ-34). */
export type DriftRow = { studentId: string; lastDriftText: string | null; lastDriftAt: string | null; driftSeenAt: string | null };

/**
 * Whether the owner has not yet seen this replaced Notion edit: drift text is
 * set and it was never marked seen, or it was recorded after the last mark.
 * Old drift with no time shows until it is marked once (tracker ADR 0067).
 */
export function isUnseenDrift(r: Omit<DriftRow, "studentId">): boolean {
  if (r.lastDriftText === null) return false;
  if (r.driftSeenAt === null) return true;
  return r.lastDriftAt !== null && Date.parse(r.driftSeenAt) < Date.parse(r.lastDriftAt);
}

/** The rows the "Notion edits replaced" card lists, newest first, those with no drift time last. */
export function unseenDrift<T extends DriftRow>(rows: T[]): T[] {
  const at = (r: T) => (r.lastDriftAt === null ? Number.NEGATIVE_INFINITY : Date.parse(r.lastDriftAt));
  return rows.filter(isUnseenDrift).sort((a, b) => (at(a) === at(b) ? 0 : at(a) < at(b) ? 1 : -1));
}
