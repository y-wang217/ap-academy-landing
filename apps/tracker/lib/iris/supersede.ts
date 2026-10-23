import { isIrisMessageId } from "./compose";
import { charlieManualRow, shortError, type GmailPort } from "./intake";
import type { GmailMessage } from "./gmail";
import { headerMap } from "./mime";
import type { IrisSettings, IrisStore } from "./store";

/**
 * Charlie answered in Gmail himself (REQ-44 AC12, tracker ADR 0063). The
 * poll reads only the inbox, so his sent replies are listed here with
 * `in:sent`. Only a message carrying Gmail's SENT label, which only the
 * mailbox's own sending sets, in a thread Iris already knows, counts: it is
 * stored once as an outbound charlie_manual row, and every earlier message of
 * that thread still waiting on Charlie is handled with reason
 * answered_by_charlie and its pending draft superseded. The streak is not
 * touched. A Gmail failure is an error line for the run, never a 502. A
 * reply Iris sent itself (our <iris-...@apacademy.ca> Message-ID) is left to
 * the send step, which records it (REQ-48).
 */
export const SENT_QUERY = "in:sent newer_than:3d";
const MAX_GETS = 20;
const DAY_MS = 86_400_000;

export type SupersedeOutcome = { stored: number; superseded: number; error: string | null };

export async function runSupersede(deps: { store: IrisStore; gmail: GmailPort; settings: IrisSettings }): Promise<SupersedeOutcome> {
  const out: SupersedeOutcome = { stored: 0, superseded: 0, error: null };
  const { store, gmail } = deps;
  let token: string;
  let ids: string[];
  try {
    token = await gmail.token();
    ids = await gmail.list(token, SENT_QUERY);
  } catch (e) {
    return { ...out, error: shortError(e, "Gmail request failed") };
  }
  try {
    return await storeSent(store, gmail, token, ids, deps.settings, out);
  } catch {
    return { ...out, error: "Iris run failed" };
  }
}

async function storeSent(store: IrisStore, gmail: GmailPort, token: string, ids: string[], settings: IrisSettings, out: SupersedeOutcome): Promise<SupersedeOutcome> {
  const known = await store.knownGmailIds(ids);
  const fresh = ids.filter((id) => !known.has(id)).reverse().slice(0, MAX_GETS);
  const retention = settings.retentionDays * DAY_MS;

  const sent: GmailMessage[] = [];
  for (const id of fresh) {
    try {
      const msg = await gmail.get(token, id);
      if (msg.labelIds?.includes("SENT") && !isIrisMessageId(headerMap(msg.payload)["Message-ID"])) sent.push(msg);
    } catch {
      out.error ??= "Could not read a sent message";
    }
  }
  for (const msg of sent.sort((a, b) => Number(a.internalDate) - Number(b.internalDate))) {
    const thread = await store.findThread(msg.threadId);
    if (!thread) continue;
    let row;
    try {
      row = charlieManualRow(msg, thread.id, retention);
    } catch {
      continue;
    }
    if (!(await store.insertMessage(row)).inserted) continue;
    out.stored += 1;
    await store.setLastOutbound(thread.id, row.receivedAt);
    out.superseded += (await store.supersedeThread(thread.id, row.receivedAt)).length;
  }
  return out;
}
