import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import { GmailError, MAX_LIST_IDS, type GmailMessage } from "./gmail";
import { charlieManualRow, historyInboundRow, readMessage, shortError, type GmailPort } from "./intake";
import { buildDirectory, matchSender, normalizeEmail } from "./match";
import { isAutomated } from "./mime";
import { mergeThread, type IrisSettings, type IrisStore } from "./store";

/**
 * The eval history import (REQ-45 AC1 to AC4, tracker ADR 0069). It runs
 * inside the bearer poll run, only while the owner's eval_import_requested
 * event is pending. It reads a year of mail from the family directory's
 * addresses, older than the live poll window, and stores each matched
 * message once as a handled history_import escalation, plus Charlie's replies
 * in those threads. At most irisMaxImportPerRun messages.get calls per run;
 * the request finishes when nothing storable remains. Unknown senders and
 * automated mail are never stored: their ids go in the batch event so later
 * runs skip them. Never throws.
 */
export type HistoryImportDeps = {
  store: IrisStore;
  gmail: GmailPort;
  directory: () => Promise<FamilyEntry[]>;
  now: () => Date;
  settings: IrisSettings;
};

export type HistoryImportOutcome = { ran: boolean; storedInbound: number; storedReplies: number; skipped: number; finished: boolean; error: string | null };

const DAY_MS = 86_400_000;
/** Addresses per Gmail query, so one query string stays short. */
export const ADDRESS_CHUNK = 15;

const window = () => `newer_than:${TUNING.irisHistoryDays}d older_than:${TUNING.irisPollWindowDays}d`;
export const inboundQuery = (addresses: string[]) => `${window()} from:(${addresses.join(" OR ")})`;
export const sentQuery = (addresses: string[]) => `in:sent ${window()} to:(${addresses.join(" OR ")})`;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function runHistoryImport(deps: HistoryImportDeps): Promise<HistoryImportOutcome> {
  const out: HistoryImportOutcome = { ran: false, storedInbound: 0, storedReplies: 0, skipped: 0, finished: false, error: null };
  const { store, gmail } = deps;
  try {
    const request = await store.pendingRequest("eval_import_requested");
    if (!request) return out;
    out.ran = true;

    let entries: FamilyEntry[];
    try {
      entries = await deps.directory();
    } catch (e) {
      return { ...out, error: shortError(e, "Could not read the family directory") };
    }
    const dir = buildDirectory(entries);
    const addresses = [...dir.keys()].filter(Boolean);
    const batches = await store.requestBatches(request.id);
    const skippedBefore = new Set(batches.flatMap((b) => b.skipped));

    let token: string;
    const inboundRefs: { id: string; threadId: string }[] = [];
    const sentRefs: { id: string; threadId: string }[] = [];
    let capped = false;
    try {
      token = await gmail.token();
      for (const chunk of chunks(addresses, ADDRESS_CHUNK)) {
        const inbound = await gmail.listRefs(token, inboundQuery(chunk));
        const sent = await gmail.listRefs(token, sentQuery(chunk));
        capped ||= inbound.length >= MAX_LIST_IDS || sent.length >= MAX_LIST_IDS;
        inboundRefs.push(...inbound);
        sentRefs.push(...sent);
      }
    } catch (e) {
      return { ...out, error: shortError(e, "Gmail request failed") };
    }

    const known = await store.knownGmailIds([...new Set([...inboundRefs, ...sentRefs].map((r) => r.id))]);
    // Gmail lists newest first: import oldest first.
    const unknownInbound = [...new Map(inboundRefs.filter((r) => !known.has(r.id) && !skippedBefore.has(r.id)).map((r) => [r.id, r])).values()].reverse();
    const unknownSent = [...new Map(sentRefs.filter((r) => !known.has(r.id)).map((r) => [r.id, r])).values()].reverse();

    const importedAt = deps.now().toISOString();
    const purgeAt = new Date(deps.now().getTime() + deps.settings.retentionDays * DAY_MS).toISOString();
    const skippedNow: string[] = [];
    let gets = 0;
    let failedGets = 0;
    const fetch = async (id: string): Promise<GmailMessage | null> => {
      gets += 1;
      try {
        return await gmail.get(token, id);
      } catch (e) {
        // Gone from the mailbox: nothing to store, ever. Anything else is tried again.
        if (e instanceof GmailError && e.status === 404) skippedNow.push(id);
        else failedGets += 1;
        return null;
      }
    };

    let inboundDone = 0;
    for (const ref of unknownInbound) {
      if (gets >= TUNING.irisMaxImportPerRun) break;
      inboundDone += 1;
      const msg = await fetch(ref.id);
      if (!msg) continue;
      let read: ReturnType<typeof readMessage>;
      try {
        read = readMessage(msg);
      } catch {
        skippedNow.push(msg.id);
        continue;
      }
      const match = matchSender(dir, normalizeEmail(read.from.email));
      if (isAutomated(read.headers, read.from.email) || match.state !== "matched") {
        skippedNow.push(msg.id);
        continue;
      }
      const receivedAt = new Date(Number(msg.internalDate)).toISOString();
      const thread = await store.saveThread(
        msg.threadId,
        mergeThread(await store.findThread(msg.threadId), {
          gmailThreadId: msg.threadId, matchState: "matched", notionStudentIds: match.studentIds, parentEmail: read.from.email,
          subject: read.headers.Subject?.slice(0, 500) ?? null, receivedAt, purgeAt,
        }),
      );
      if ((await store.insertMessage(historyInboundRow(msg, thread.id, purgeAt, importedAt))).inserted) out.storedInbound += 1;
    }

    // Charlie's replies, only in threads that hold a stored inbound message.
    const threadIds = await store.storedThreadIds([...new Set(unknownSent.map((r) => r.threadId))]);
    const storableSent = unknownSent.filter((r) => threadIds.has(r.threadId));
    let sentDone = 0;
    for (const ref of storableSent) {
      if (gets >= TUNING.irisMaxImportPerRun) break;
      sentDone += 1;
      const msg = await fetch(ref.id);
      if (!msg) continue;
      let row: ReturnType<typeof charlieManualRow>;
      try {
        row = charlieManualRow(msg, threadIds.get(ref.threadId)!, 0, purgeAt);
      } catch {
        continue; // An unreadable reply is left out.
      }
      if ((await store.insertMessage(row)).inserted) out.storedReplies += 1;
    }

    out.skipped = skippedNow.length;
    // A failed get leaves its id unknown, so it counts as still to do.
    const remaining = unknownInbound.length - inboundDone + (storableSent.length - sentDone) + failedGets;
    await store.insertEvent({
      kind: "eval_import_batch",
      messageId: null,
      detail: { request_id: request.id, stored_inbound: out.storedInbound, stored_replies: out.storedReplies, skipped: skippedNow, capped },
    });
    if (remaining === 0) {
      const all = [...batches, { storedInbound: out.storedInbound, storedReplies: out.storedReplies, skipped: skippedNow, capped }];
      await store.insertEvent({
        kind: "eval_import_finished",
        messageId: null,
        detail: {
          request_id: request.id,
          stored_inbound: all.reduce((n, b) => n + b.storedInbound, 0),
          stored_replies: all.reduce((n, b) => n + b.storedReplies, 0),
          skipped: all.reduce((n, b) => n + b.skipped.length, 0),
          capped: all.some((b) => b.capped),
        },
      });
      out.finished = true;
    }
    return out;
  } catch (e) {
    return { ...out, error: shortError(e, "Iris run failed") };
  }
}
