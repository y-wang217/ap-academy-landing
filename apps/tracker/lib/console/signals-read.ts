import { z } from "zod";
import { expandOccurrences } from "../domain/schedule/recurrence";
import { todayIso } from "../time";
import { messageOf, withTimeout } from "./facade";
import type { OwnerViewer } from "./guard";
import type { OperationsReader } from "./operations-read";
import type { OutboxRead, ProtectedTime } from "./signals";

/**
 * The two reads the console's signals add (REQ-62, tracker ADR 0077):
 * failed Notion exports and whether the owner is teaching now. Select-only,
 * on the owner's own client, so RLS (is_org_owner) decides. Every row is
 * parsed with Zod (ADR 0017) and a query error throws, so a failed read never
 * looks like "nothing failed" or "free". last_error is never selected.
 */
export const NO_STAFF_LINK = "Owner has no staff link";
export const SCHEDULE_UNAVAILABLE = "Schedule unavailable";
export const TEACHING_UNAVAILABLE = "Teaching time unavailable";
const OUTBOX_CAP = 100;

const OutboxRow = z.object({ id: z.guid(), kind: z.string(), finished_at: z.string().nullable() });
const LinkRow = z.object({ notion_staff_id: z.guid() });

export async function readFailedOutbox(viewer: OwnerViewer): Promise<{ id: string; kind: string; finishedAt: string | null }[]> {
  const { data, error } = await viewer.db.tracker.from("notion_outbox").select("id, kind, finished_at").eq("org_id", viewer.orgId).eq("status", "failed")
    .order("finished_at", { ascending: false }).limit(OUTBOX_CAP);
  if (error) throw new Error("unavailable");
  return z.array(OutboxRow).parse(data ?? []).map((r) => ({ id: r.id, kind: r.kind, finishedAt: r.finished_at }));
}

/** The owner's own class in progress now, through their live staff link. A link read error throws; a schedule error is unknown. */
export async function readOwnerTeaching(viewer: OwnerViewer, now: Date, reader: Pick<OperationsReader, "schedule">): Promise<ProtectedTime> {
  const { data, error } = await viewer.db.tracker.from("staff_links").select("notion_staff_id").eq("org_id", viewer.orgId).eq("user_id", viewer.userId)
    .is("revoked_at", null).maybeSingle();
  if (error) throw new Error("unavailable");
  if (data === null) return { state: "unknown", reason: NO_STAFF_LINK };
  const staffId = LinkRow.parse(data).notion_staff_id.toLowerCase();
  const today = todayIso(now);
  let occurrences;
  try {
    const read = await reader.schedule({ from: today, to: today });
    occurrences = expandOccurrences(read.series, read.exceptions, { from: today, to: today });
  } catch {
    return { state: "unknown", reason: SCHEDULE_UNAVAILABLE };
  }
  const at = now.getTime();
  const current = occurrences.find((o) => o.staffId.toLowerCase() === staffId && o.status !== "cancelled" && Date.parse(o.startsAt) <= at && at < Date.parse(o.endsAt));
  return current ? { state: "teaching", until: current.endsAt, title: `${current.subject} class` } : { state: "free" };
}

/** The outbox read as the signals take it: never throws, capped by the console timeout. */
export async function settleOutbox(viewer: OwnerViewer, now: Date, timeoutMs: number): Promise<OutboxRead> {
  const checkedAt = now.toISOString();
  try {
    return { ok: true, checkedAt, rows: await withTimeout(() => readFailedOutbox(viewer), timeoutMs) };
  } catch (e) {
    return { ok: false, checkedAt, message: messageOf(e, timeoutMs) };
  }
}

/** Teaching time as the signals take it: never throws, and a failure is unknown, never free. */
export async function settleTeaching(viewer: OwnerViewer, now: Date, reader: Pick<OperationsReader, "schedule">, timeoutMs: number): Promise<ProtectedTime> {
  try {
    return await withTimeout(() => readOwnerTeaching(viewer, now, reader), timeoutMs);
  } catch {
    return { state: "unknown", reason: TEACHING_UNAVAILABLE };
  }
}
