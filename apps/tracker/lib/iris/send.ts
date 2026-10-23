import { TUNING } from "../domain/tuning";
import { buildReply, ComposeError } from "./compose";
import { withSignature } from "./draft-rules";
import { GmailError, type GmailSendPort } from "./gmail";
import { AUTOMATED_LINE } from "./policy";

/**
 * Sending an approved reply (REQ-48, tracker ADR 0069). One iris.sends row
 * per approved draft; this step makes its Gmail attempts. Every attempt but
 * the first one Approve makes searches Gmail first, so a message Gmail
 * already accepted is recorded, never sent again. Both functions take their
 * ports and never throw: a failed attempt is a status line on the send.
 */

/** What one attempt needs, read through the caller's client. */
export type SendContext = {
  sendId: string;
  state: "sending" | "sent" | "failed";
  attempts: number;
  rfcMessageId: string;
  /** The draft text without the signature. */
  draftText: string;
  /** The inbound sender: Iris replies only to them. */
  to: string;
  subject: string | null;
  /** The inbound message's Message-ID, for In-Reply-To and References. */
  inReplyTo: string | null;
  gmailThreadId: string | null;
  /** auto (REQ-49) carries the automated line after the signature; manual never does. */
  mode: "manual" | "auto";
};

/** withdrawn (REQ-49): a held auto send whose switch went off went back to the manual queue. */
export type ClaimResult = "claimed" | "busy" | "done" | "exhausted" | "paused" | "withdrawn" | "not_found";

/** The send rows, through the owner's client (Approve, Retry) or the service client (the run). */
export type SendStore = {
  sendContext(sendId: string): Promise<SendContext | null>;
  claimSend(sendId: string, leaseSeconds: number, maxAttempts: number): Promise<ClaimResult>;
  finishSend(sendId: string, r: { gmailMessageId: string; from: string; body: string; sentAt: string }): Promise<void>;
  failSendAttempt(sendId: string, error: string, maxAttempts: number): Promise<"retrying" | "failed" | "done" | "not_found">;
};

/** The run's store adds the list of sends whose lease has passed. */
export type SendRunStore = SendStore & { listStuckSends(limit: number): Promise<string[]> };

export type AttemptResult = { state: "sent" | "sending" | "failed"; error: string | null };

const status = (e: unknown) => (e instanceof GmailError && e.status ? ` (${e.status})` : "");

/** One Gmail attempt on a send the caller already holds (Approve's, Retry's or a claimed one). */
export async function attemptSend(d: { store: SendStore; gmail: GmailSendPort; sendId: string; mailbox: string; verifyFirst: boolean; now: () => Date }): Promise<AttemptResult> {
  const { store, gmail, sendId } = d;
  const fail = async (error: string): Promise<AttemptResult> => {
    try {
      const r = await store.failSendAttempt(sendId, error, TUNING.irisSendMaxAttempts);
      return { state: r === "failed" ? "failed" : "sending", error };
    } catch {
      return { state: "sending", error };
    }
  };

  let ctx: SendContext | null;
  try {
    ctx = await store.sendContext(sendId);
  } catch {
    return { state: "sending", error: "Could not read the send" };
  }
  if (!ctx) return { state: "sending", error: "Send not found" };
  if (ctx.state !== "sending") return { state: ctx.state, error: null };
  const body = ctx.mode === "auto" ? `${withSignature(ctx.draftText)}\n\n${AUTOMATED_LINE}` : withSignature(ctx.draftText);
  const finish = async (gmailMessageId: string): Promise<AttemptResult> => {
    try {
      await store.finishSend(sendId, { gmailMessageId, from: d.mailbox, body, sentAt: d.now().toISOString() });
      return { state: "sent", error: null };
    } catch {
      // Gmail has it; the lease lapses and the next attempt finds it by search.
      return { state: "sending", error: "Sent, but not recorded yet" };
    }
  };

  if (d.verifyFirst) {
    let found: string | null;
    try {
      found = await gmail.findSent(await gmail.readToken(), ctx.rfcMessageId, ctx.gmailThreadId, sendId);
    } catch {
      return fail("Could not check Gmail before retrying");
    }
    if (found) return finish(found);
  }

  let raw: string;
  try {
    raw = buildReply({ from: d.mailbox, to: ctx.to, subject: ctx.subject, inReplyTo: ctx.inReplyTo, messageId: ctx.rfcMessageId, sendId, body, date: d.now() });
  } catch (e) {
    return fail(e instanceof ComposeError ? e.message : "Parent address unusable");
  }
  let token: string;
  try {
    token = await gmail.sendToken();
  } catch (e) {
    return fail(`Gmail send is not authorised${status(e)}`);
  }
  let sent: { id: string };
  try {
    sent = await gmail.send(token, raw, ctx.gmailThreadId);
  } catch (e) {
    return fail(e instanceof GmailError ? e.message : "Gmail request failed");
  }
  return finish(sent.id);
}

export type SendsOutcome = { sent: number; failed: number; error: string | null };

/**
 * The run's send step: sends still sending whose lease has passed (a crash,
 * a failed attempt), at most irisMaxSendsPerRun, none started after
 * irisSendBudgetMs. Each is claimed first, so a Retry at the same moment
 * cannot attempt it too.
 */
export async function runSends(d: { store: SendRunStore; gmail: GmailSendPort; mailbox: string; now: () => Date; startedAtMs: number }): Promise<SendsOutcome> {
  const out: SendsOutcome = { sent: 0, failed: 0, error: null };
  let ids: string[];
  try {
    ids = await d.store.listStuckSends(TUNING.irisMaxSendsPerRun);
  } catch {
    return { ...out, error: "Could not read the sends" };
  }
  for (const sendId of ids) {
    if (d.now().getTime() - d.startedAtMs >= TUNING.irisSendBudgetMs) break;
    let claim: ClaimResult;
    try {
      claim = await d.store.claimSend(sendId, TUNING.irisSendLeaseSeconds, TUNING.irisSendMaxAttempts);
    } catch {
      out.error ??= "Could not claim a send";
      continue;
    }
    if (claim === "paused") break;
    if (claim === "exhausted") out.failed += 1;
    if (claim !== "claimed") continue;
    const r = await attemptSend({ store: d.store, gmail: d.gmail, sendId, mailbox: d.mailbox, verifyFirst: true, now: d.now });
    if (r.state === "sent") out.sent += 1;
    if (r.state === "failed") out.failed += 1;
    if (r.error) out.error ??= r.error;
  }
  return out;
}
