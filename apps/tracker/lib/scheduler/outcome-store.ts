/**
 * What a class occurrence turned into (REQ-39, migration 0023): delivered
 * (linked to a Notion Lessons row, or pending while the log is in flight) or
 * no_show. The real store (lib/data/outcomes.ts) runs as the signed-in user,
 * so RLS decides; the unique (series, original date) key is the idempotency key.
 */
export type OutcomeRecord = {
  id: string;
  seriesId: string;
  originalDate: string;
  outcome: "delivered" | "no_show";
  linkSource: "logged" | "reconciled" | null;
  notionLessonId: string | null;
  lessonDate: string | null;
  claimedAt: string | null;
};
export type OccurrenceKey = { seriesId: string; originalDate: string };
export type NewOutcome = OccurrenceKey & { outcome: "delivered" | "no_show"; linkSource: "logged" | "reconciled" | null };
export type Inserted = { ok: true; row: OutcomeRecord } | { ok: false; error: "exists" };

export type OutcomeStore = {
  listForOccurrences(keys: OccurrenceKey[]): Promise<OutcomeRecord[]>;
  get(seriesId: string, originalDate: string): Promise<OutcomeRecord | null>;
  /** A pending delivered row claimed now. `exists` when the occurrence already has a row. */
  claim(input: OccurrenceKey & { linkSource: "logged" | "reconciled" }): Promise<Inserted>;
  /** Compare-and-set on the claim time a stale pending row was read with. Null: someone else took it (busy). */
  takeOver(id: string, seenClaimedAt: string | null): Promise<OutcomeRecord | null>;
  complete(id: string, lessonId: string, lessonDate: string): Promise<OutcomeRecord>;
  insertNoShow(input: OccurrenceKey): Promise<Inserted>;
  /** Owner only (RLS). The audit trigger keeps the old row. */
  remove(id: string): Promise<boolean>;
};
