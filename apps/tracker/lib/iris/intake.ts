import { TUNING } from "../domain/tuning";
import { NotionError } from "../notion/staff";
import type { FamilyEntry } from "../notion/parents";
import { GmailError, type GmailMessage } from "./gmail";
import { buildDirectory, matchSender, type Directory } from "./match";
import { bodyText, capBody, headerMap, isAutomated, parseFrom, snippetOf } from "./mime";
import { POLICY_VERSION } from "./policy";
import { mergeThread, type IrisSettings, type IrisStore, type MessageInsert, type StoredThread, type ThreadInput } from "./store";

/**
 * One Iris poll (REQ-42): list new inbox mail, store each message once, match
 * the sender to a family, and retry messages that waited on Notion. Nothing
 * is classified, drafted or sent. Every port is injected, and the function
 * never throws: an escaping error becomes `result: "failed"`.
 */
export const POLL_QUERY = `in:inbox category:primary newer_than:${TUNING.irisPollWindowDays}d`;
const GET_CONCURRENCY = 5;
const DAY_MS = 86_400_000;

export type GmailPort = {
  token(): Promise<string>;
  list(token: string, q: string): Promise<string[]>;
  get(token: string, id: string): Promise<GmailMessage>;
};

export type IntakeDeps = {
  store: IrisStore;
  gmail: GmailPort;
  /** Students & Parents, read once per run, uncached. */
  directory: () => Promise<FamilyEntry[]>;
  now: () => Date;
  /** The mailbox Iris reads, lower-cased. Mail from it is Charlie's own. */
  mailbox: string;
  settings: IrisSettings;
};

export type RunCounts = { seen: number; stored: number; matched: number; escalated: number; skipped: number; failed: number };
export type RunOutcome = RunCounts & { result: "ok" | "failed"; gmailListFailed: boolean; error: string | null };

/** A short reason for an admin to read: a status line, never a response body or an address. */
export function shortError(e: unknown, fallback: string): string {
  return (e instanceof GmailError || e instanceof NotionError ? e.message : fallback).slice(0, 300);
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

export async function runIntake(deps: IntakeDeps): Promise<RunOutcome> {
  const counts: RunCounts = { seen: 0, stored: 0, matched: 0, escalated: 0, skipped: 0, failed: 0 };
  const { store, gmail } = deps;
  const at = () => deps.now().toISOString();
  try {
    // 1. List. Only this step's failure fails the run as a Gmail failure.
    let token: string;
    let ids: string[];
    try {
      token = await gmail.token();
      ids = await gmail.list(token, POLL_QUERY);
    } catch (e) {
      return { ...counts, result: "failed", gmailListFailed: true, error: shortError(e, "Gmail request failed") };
    }
    counts.seen = ids.length;

    // 2. New ids, oldest first.
    const known = await store.knownGmailIds(ids);
    const fresh = ids.filter((id) => !known.has(id)).reverse().slice(0, TUNING.irisMaxMessagesPerRun);

    // 3. The family directory, once.
    let dir: Directory | null = null;
    let dirError: string | null = null;
    try {
      dir = buildDirectory(await deps.directory());
    } catch (e) {
      dirError = shortError(e, "Could not read the family directory");
    }

    // 4. Fetch with concurrency 5, then store one by one, oldest first, so a
    // reply sees the thread its earlier message created.
    const fetched = await pool(fresh, GET_CONCURRENCY, async (id) => {
      try {
        return await gmail.get(token, id);
      } catch {
        counts.failed += 1;
        return null;
      }
    });
    const storedNow = new Set<string>();
    const retention = deps.settings.retentionDays * DAY_MS;

    const saveThread = async (input: ThreadInput): Promise<StoredThread> =>
      store.saveThread(input.gmailThreadId, mergeThread(await store.findThread(input.gmailThreadId), input));

    for (const msg of fetched.filter((m): m is GmailMessage => m !== null).sort((a, b) => Number(a.internalDate) - Number(b.internalDate))) {
      const headers = headerMap(msg.payload);
      const from = parseFrom(headers.From ?? "");
      const receivedMs = Number(msg.internalDate);
      const receivedAt = new Date(receivedMs).toISOString();
      const purgeAt = new Date(receivedMs + retention).toISOString();
      const subject = headers.Subject?.slice(0, 500) ?? null;
      const base = {
        gmailMessageId: msg.id,
        rfcMessageId: headers["Message-ID"] ?? null,
        fromEmail: from.email,
        fromName: from.name?.slice(0, 200) ?? null,
        receivedAt,
        purgeAt,
        snippet: snippetOf(msg.snippet),
        retryCount: 0,
        lastError: null,
        handledAt: null,
        escalationReason: null,
      };

      // Charlie's own mail: a record in a known thread, never a new thread.
      if (from.email === deps.mailbox) {
        const thread = await store.findThread(msg.threadId);
        if (!thread) {
          counts.skipped += 1;
          continue;
        }
        const body = capBody(bodyText(msg.payload));
        const row: MessageInsert = { ...base, threadId: thread.id, direction: "outbound", source: "charlie_manual", bodyText: body.text, bodyTruncated: body.truncated, state: null, stateChangedAt: null, policyVersion: null };
        if ((await store.insertMessage(row)).inserted) {
          counts.stored += 1;
          await store.setLastOutbound(thread.id, receivedAt);
        }
        continue;
      }

      const threadInput = (match: ReturnType<typeof matchSender> | null): ThreadInput => ({
        gmailThreadId: msg.threadId,
        matchState: match?.state === "matched" ? "matched" : "unknown",
        notionStudentIds: match?.state === "matched" ? match.studentIds : [],
        parentEmail: match?.state === "matched" ? from.email : null,
        subject,
        receivedAt,
        purgeAt,
      });
      const inbound = { ...base, direction: "inbound" as const, source: "external" as const, policyVersion: POLICY_VERSION, stateChangedAt: at() };

      let row: Omit<MessageInsert, "threadId">;
      let thread: StoredThread;
      if (isAutomated(headers, from.email)) {
        thread = await saveThread(threadInput(null));
        row = { ...inbound, bodyText: null, bodyTruncated: false, state: "escalated", escalationReason: "automated", handledAt: at() };
      } else if (!dir) {
        thread = await saveThread(threadInput(null));
        row = { ...inbound, bodyText: null, bodyTruncated: false, state: "received", retryCount: 1, lastError: dirError };
      } else {
        const match = matchSender(dir, from.email);
        thread = await saveThread(threadInput(match));
        if (match.state === "matched") {
          const body = capBody(bodyText(msg.payload));
          row = { ...inbound, bodyText: body.text, bodyTruncated: body.truncated, state: "matched" };
        } else {
          row = { ...inbound, bodyText: null, bodyTruncated: false, state: "escalated", escalationReason: "unknown_sender" };
        }
      }

      const result = await store.insertMessage({ ...row, threadId: thread.id });
      if (!result.inserted || !result.id) continue;
      storedNow.add(result.id);
      counts.stored += 1;
      if (row.state === "matched") counts.matched += 1;
      if (row.state === "escalated") counts.escalated += 1;
      await store.insertEvent({ kind: "message_stored", messageId: result.id, detail: { state: row.state, reason: row.escalationReason } });
    }

    // 5. Messages that waited on Notion in an earlier run.
    const waiting = (await store.listRetryable(TUNING.irisMaxRetries, TUNING.irisMaxMessagesPerRun)).filter((m) => !storedNow.has(m.id));
    for (const w of waiting) {
      if (!dir) {
        const retryCount = w.retryCount + 1;
        if (retryCount >= TUNING.irisMaxRetries) {
          await store.updateMessage(w.id, { retryCount, state: "failed", stateChangedAt: at(), lastError: dirError });
          counts.failed += 1;
          await store.insertEvent({ kind: "failed", messageId: w.id, detail: { state: "failed", reason: "directory_unavailable" } });
        } else {
          await store.updateMessage(w.id, { retryCount, lastError: dirError });
        }
        continue;
      }
      let msg: GmailMessage;
      try {
        msg = await gmail.get(token, w.gmailMessageId);
      } catch {
        counts.failed += 1;
        continue;
      }
      const from = parseFrom(headerMap(msg.payload).From ?? "");
      const match = matchSender(dir, from.email);
      const receivedMs = Number(msg.internalDate);
      await saveThread({
        gmailThreadId: msg.threadId,
        matchState: match.state,
        notionStudentIds: match.state === "matched" ? match.studentIds : [],
        parentEmail: match.state === "matched" ? from.email : null,
        subject: headerMap(msg.payload).Subject?.slice(0, 500) ?? null,
        receivedAt: new Date(receivedMs).toISOString(),
        purgeAt: new Date(receivedMs + retention).toISOString(),
      });
      if (match.state === "matched") {
        const body = capBody(bodyText(msg.payload));
        await store.updateMessage(w.id, { state: "matched", bodyText: body.text, bodyTruncated: body.truncated, stateChangedAt: at(), lastError: null });
        counts.matched += 1;
      } else {
        await store.updateMessage(w.id, { state: "escalated", escalationReason: "unknown_sender", stateChangedAt: at(), lastError: null });
        counts.escalated += 1;
      }
      await store.insertEvent({ kind: match.state === "matched" ? "matched" : "escalated", messageId: w.id, detail: { state: match.state === "matched" ? "matched" : "escalated", reason: match.state === "matched" ? null : "unknown_sender" } });
    }

    return { ...counts, result: "ok", gmailListFailed: false, error: dirError };
  } catch (e) {
    return { ...counts, result: "failed", gmailListFailed: false, error: shortError(e, "Iris run failed") };
  }
}
