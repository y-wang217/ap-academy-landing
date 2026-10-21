import type { FamilyEntry } from "../notion/parents";

/**
 * Sender to family (REQ-42 AC17). Pure. First names stay in memory for the
 * run (Iris 3/9 hands them to the classifier); only page ids are stored.
 */
export type Directory = Map<string, FamilyEntry[]>;
export type Match = { state: "matched"; studentIds: string[]; firstNames: string[] } | { state: "unknown" };

export const normalizeEmail = (s: string) => s.trim().toLowerCase();

export function buildDirectory(entries: FamilyEntry[]): Directory {
  const dir: Directory = new Map();
  for (const e of entries) {
    const key = normalizeEmail(e.parentEmail);
    if (!key) continue;
    dir.set(key, [...(dir.get(key) ?? []), e]);
  }
  return dir;
}

export function matchSender(dir: Directory, email: string): Match {
  const hits = dir.get(normalizeEmail(email));
  if (!hits || hits.length === 0) return { state: "unknown" };
  return { state: "matched", studentIds: hits.map((h) => h.studentId), firstNames: hits.map((h) => h.studentName.split(/\s+/)[0] ?? "") };
}
