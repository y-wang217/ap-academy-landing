import { describe, expect, it } from "vitest";
import { TUNING } from "../domain/tuning";
import { GmailError, type GmailSendPort } from "./gmail";
import { attemptSend, runSends } from "./send";
import { fakeIrisStore } from "./store.fake";

// REQ-48 AC3 to AC5, AC9: one attempt, and the run's send step.
const MAILBOX = "charlie@apacademy.ca";
const NOW = Date.parse("2026-10-22T19:00:00Z");

/**
 * A scripted Gmail. `send` answers in order: an id is accepted, a number is
 * that status, "accept-then-500" stores the message and answers 500 (a crash
 * after Gmail accepted it). findSent finds whatever was stored.
 */
function scriptedGmail(o: { send?: (string | number)[]; tokenRefused?: number; findFails?: boolean } = {}) {
  const calls: string[] = [];
  const stored = new Map<string, string>();
  const answers = [...(o.send ?? ["gm-1"])];
  const port: GmailSendPort = {
    readToken: async () => (calls.push("readToken"), "read"),
    sendToken: async () => {
      calls.push("sendToken");
      if (o.tokenRefused) throw new GmailError(`Gmail token refused (${o.tokenRefused})`, o.tokenRefused);
      return "send";
    },
    send: async (_t, raw) => {
      calls.push("send");
      const a = answers.length > 1 ? answers.shift()! : answers[0];
      const id = Buffer.from(raw, "base64url").toString().match(/^Message-ID: (.+)$/m)![1].trim();
      if (a === "accept-then-500") {
        stored.set(id, `gm-${stored.size + 1}`);
        throw new GmailError("Gmail returned 500", 500);
      }
      if (typeof a === "number") throw new GmailError(`Gmail returned ${a}`, a);
      stored.set(id, a);
      return { id: a, threadId: "t" };
    },
    findSent: async (_t, rfc) => {
      calls.push("findSent");
      if (o.findFails) throw new GmailError("Gmail returned 503", 503);
      return stored.get(rfc) ?? null;
    },
  };
  return { port, calls, sentCount: () => calls.filter((c) => c === "send").length, stored };
}

const now = () => new Date(NOW);

function world(o: Parameters<typeof scriptedGmail>[0] = {}, approved: Parameters<ReturnType<typeof fakeIrisStore>["approved"]>[0] = {}) {
  const db = fakeIrisStore();
  db.setNow(() => NOW);
  const a = db.approved(approved);
  const gmail = scriptedGmail(o);
  const attempt = (verifyFirst: boolean) => attemptSend({ store: db.store, gmail: gmail.port, sendId: a.sendId, mailbox: MAILBOX, verifyFirst, now });
  const outbound = () => [...db.messages.values()].filter((m) => m.direction === "outbound");
  return { db, a, gmail, attempt, outbound };
}

describe("attemptSend", () => {
  it("Approve's first attempt sends without a search and records everything once", async () => {
    const w = world();
    expect(await w.attempt(false)).toEqual({ state: "sent", error: null });
    expect(w.gmail.calls).toEqual(["sendToken", "send"]);
    expect(w.db.calls.filter((c) => c === "finishSend")).toHaveLength(1);
    expect(w.db.sends.get(w.a.sendId)).toMatchObject({ state: "sent", gmailMessageId: "gm-1", sentAt: "2026-10-22T19:00:00.000Z" });
    expect(w.db.drafts.get(w.a.draftId)!.state).toBe("sent");
    expect(w.db.messages.get(w.a.messageId)!.state).toBe("sent");
    const [out] = w.outbound();
    expect(out).toMatchObject({ source: "iris", fromEmail: MAILBOX, gmailMessageId: "gm-1", receivedAt: "2026-10-22T19:00:00.000Z" });
    expect(out.bodyText).toMatch(/^Hi Ann,\n\nThanks for letting me know\.\n\nCharlie/);
    expect(w.db.events.filter((e) => e.kind === "sent")).toHaveLength(1);
  });

  it("accepted then 500, then a verify attempt finds it: one send call, one outbound row", async () => {
    const w = world({ send: ["accept-then-500"] });
    expect(await w.attempt(false)).toEqual({ state: "sending", error: "Gmail returned 500" });
    expect(await w.db.store.claimSend(w.a.sendId, 60, 3)).toBe("claimed");
    expect(await w.attempt(true)).toEqual({ state: "sent", error: null });
    expect(w.gmail.sentCount()).toBe(1);
    expect(w.outbound()).toHaveLength(1);
    expect(w.db.sends.get(w.a.sendId)!.gmailMessageId).toBe("gm-1");
  });

  it("a search error means no send, and the attempt counts as failed", async () => {
    const w = world({ findFails: true });
    expect(await w.attempt(true)).toEqual({ state: "sending", error: "Could not check Gmail before retrying" });
    expect(w.gmail.sentCount()).toBe(0);
  });

  it("Gmail 500 on every attempt: failed after three, with the status line only", async () => {
    const w = world({ send: [500] });
    await w.attempt(false);
    for (let i = 0; i < 2; i++) {
      expect(await w.db.store.claimSend(w.a.sendId, 60, TUNING.irisSendMaxAttempts)).toBe("claimed");
      const r = await w.attempt(true);
      expect(r.state).toBe(i === 1 ? "failed" : "sending");
    }
    expect(w.db.sends.get(w.a.sendId)).toMatchObject({ state: "failed", attempts: 3, lastError: "Gmail returned 500" });
    expect(w.db.messages.get(w.a.messageId)).toMatchObject({ state: "failed", lastError: "Gmail returned 500" });
    expect(w.db.drafts.get(w.a.draftId)!.state).toBe("failed");
    expect(w.gmail.sentCount()).toBe(3);
  });

  it("a refused send token gives the not-authorised line, and the read token is untouched", async () => {
    const w = world({ tokenRefused: 403 });
    expect(await w.attempt(true)).toEqual({ state: "sending", error: "Gmail send is not authorised (403)" });
    expect(w.gmail.calls).toEqual(["readToken", "findSent", "sendToken"]);
  });

  it("an unusable parent address fails the attempt without a Gmail call", async () => {
    const w = world({}, { from: "not an address" });
    expect(await w.attempt(false)).toEqual({ state: "sending", error: "Parent address unusable" });
    expect(w.gmail.calls).toEqual([]);
  });

  it("a send that is already sent makes no Gmail call", async () => {
    const w = world();
    await w.attempt(false);
    w.gmail.calls.length = 0;
    expect(await w.attempt(true)).toEqual({ state: "sent", error: null });
    expect(w.gmail.calls).toEqual([]);
  });

  it("never throws when the store does", async () => {
    const w = world();
    w.db.fail.add("sendContext");
    expect(await w.attempt(false)).toEqual({ state: "sending", error: "Could not read the send" });
  });
});

describe("runSends", () => {
  it("verifies, then sends, a send whose lease has passed; skips a busy one", async () => {
    const w = world({}, { leaseUntil: null });
    const busy = w.db.approved();
    const out = await runSends({ store: w.db.store, gmail: w.gmail.port, mailbox: MAILBOX, now, startedAtMs: NOW });
    expect(out).toEqual({ sent: 1, failed: 0, error: null });
    expect(w.gmail.calls).toEqual(["readToken", "findSent", "sendToken", "send"]);
    expect(w.db.sends.get(busy.sendId)!.state).toBe("sending");
  });

  it("takes at most irisMaxSendsPerRun and starts none after the budget", async () => {
    const w = world({}, { leaseUntil: null });
    for (let i = 0; i < 4; i++) w.db.approved({ leaseUntil: null });
    const out = await runSends({ store: w.db.store, gmail: w.gmail.port, mailbox: MAILBOX, now, startedAtMs: NOW });
    expect(out.sent).toBe(TUNING.irisMaxSendsPerRun);
    const late = await runSends({ store: w.db.store, gmail: w.gmail.port, mailbox: MAILBOX, now, startedAtMs: NOW - TUNING.irisSendBudgetMs });
    expect(late.sent).toBe(0);
  });

  it("a send at the attempt limit becomes failed with no Gmail call", async () => {
    const w = world({}, { leaseUntil: null, attempts: 3 });
    const out = await runSends({ store: w.db.store, gmail: w.gmail.port, mailbox: MAILBOX, now, startedAtMs: NOW });
    expect(out).toEqual({ sent: 0, failed: 1, error: null });
    expect(w.gmail.calls).toEqual([]);
    expect(w.db.sends.get(w.a.sendId)!.state).toBe("failed");
  });

  it("paused: no Gmail call", async () => {
    const w = world({}, { leaseUntil: null });
    w.db.settings.paused = true;
    expect(await runSends({ store: w.db.store, gmail: w.gmail.port, mailbox: MAILBOX, now, startedAtMs: NOW })).toEqual({ sent: 0, failed: 0, error: null });
    expect(w.gmail.calls).toEqual([]);
  });
});
