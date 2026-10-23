import { describe, expect, it } from "vitest";
import type { GmailMessage } from "./gmail";
import type { GmailPort } from "./intake";
import { POLICY_VERSION } from "./policy";
import { fakeIrisStore } from "./store.fake";
import { runSupersede, SENT_QUERY } from "./supersede";

// REQ-44 AC12: Charlie's own reply in Gmail supersedes the pending draft.
const T0 = Date.parse("2026-10-21T12:00:00Z");
const MAILBOX = "charlie@apacademy.ca";
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sent = (id: string, thread: string, at: number, labels = ["SENT"]): GmailMessage => ({
  id, threadId: thread, internalDate: String(at), snippet: "ok", labelIds: labels,
  payload: { mimeType: "text/plain", headers: [{ name: "From", value: `Charlie <${MAILBOX}>` }, { name: "Subject", value: "Re: Sick" }], body: { data: b64("No problem, feel better.") } },
});

function world(mail: GmailMessage[]) {
  const db = fakeIrisStore();
  const queries: string[] = [];
  const gmail: GmailPort = {
    token: async () => "tok",
    listRefs: async () => [],
    list: async (_t, q) => (queries.push(q), mail.map((m) => m.id)),
    get: async (_t, id) => mail.find((m) => m.id === id)!,
  };
  let n = 0;
  const add = async (gid: string, state: "drafted" | "escalated" | "classified", at: number, o: { handledAt?: string | null } = {}) => {
    const thread = await db.store.saveThread(gid, { matchState: "matched", notionStudentIds: [], parentEmail: "pat@y.com", subject: "Sick", firstReceivedAt: "x", lastInboundAt: "x", purgeAt: "2027-01-01T00:00:00Z" });
    const r = await db.store.insertMessage({
      threadId: thread.id, gmailMessageId: `in${++n}`, rfcMessageId: null, direction: "inbound", source: "external", fromEmail: "pat@y.com", fromName: null,
      receivedAt: new Date(at).toISOString(), bodyText: "Sam is sick.", bodyTruncated: false, snippet: "s", state, stateChangedAt: null,
      escalationReason: state === "escalated" ? "needs_charlie" : null, policyVersion: POLICY_VERSION, handledAt: o.handledAt ?? null, retryCount: 0, lastError: null, purgeAt: "2027-01-01T00:00:00Z",
    });
    const draftId = await db.store.insertDraft({ messageId: r.id!, replyType: "cancellation", bodyText: "Thanks.", policyVersion: POLICY_VERSION });
    return { id: r.id!, draftId };
  };
  const run = () => runSupersede({ store: db.store, gmail, settings: db.settings });
  return { db, add, run, queries };
}

describe("runSupersede", () => {
  it("a SENT reply in a thread with a proposed draft is stored once and supersedes it", async () => {
    const w = world([sent("s1", "g-a", T0)]);
    const m = await w.add("g-a", "drafted", T0 - 3600_000);
    const out = await w.run();
    expect(w.queries).toEqual([SENT_QUERY]);
    expect(out).toEqual({ stored: 1, superseded: 1, error: null });
    expect(w.db.byGmailId("s1")).toMatchObject({ direction: "outbound", source: "charlie_manual", fromEmail: MAILBOX });
    expect(w.db.messages.get(m.id)).toMatchObject({ state: "escalated", escalationReason: "answered_by_charlie", handledAt: new Date(T0).toISOString() });
    expect(w.db.drafts.get(m.draftId)!.state).toBe("superseded");
    expect(w.db.events.filter((e) => e.kind === "superseded").map((e) => e.messageId)).toEqual([m.id]);
    // A repeat run stores nothing new.
    expect(await w.run()).toEqual({ stored: 0, superseded: 0, error: null });
  });

  it("an unhandled escalation with a draft is handled too", async () => {
    const w = world([sent("s1", "g-a", T0)]);
    const m = await w.add("g-a", "escalated", T0 - 3600_000);
    await w.run();
    expect(w.db.messages.get(m.id)).toMatchObject({ escalationReason: "answered_by_charlie", handledAt: new Date(T0).toISOString() });
  });

  it("mail without the SENT label, or in an unknown thread, supersedes nothing", async () => {
    const w = world([sent("s1", "g-a", T0, ["INBOX"]), sent("s2", "g-unknown", T0)]);
    const m = await w.add("g-a", "drafted", T0 - 3600_000);
    expect(await w.run()).toEqual({ stored: 0, superseded: 0, error: null });
    expect(w.db.messages.get(m.id)!.state).toBe("drafted");
    expect(w.db.byGmailId("s1")).toBeUndefined();
    expect(w.db.byGmailId("s2")).toBeUndefined();
  });

  it("only earlier messages: an inbound message after the reply is untouched", async () => {
    const w = world([sent("s1", "g-a", T0)]);
    const later = await w.add("g-a", "drafted", T0 + 60_000);
    await w.run();
    expect(w.db.messages.get(later.id)!.state).toBe("drafted");
    expect(w.db.drafts.get(later.draftId)!.state).toBe("proposed");
  });

  it("a Gmail list failure is an error line, not a throw", async () => {
    const w = world([]);
    const gmail: GmailPort = { token: async () => "tok", listRefs: async () => [], list: async () => { throw new Error("down"); }, get: async () => { throw new Error("x"); } };
    expect(await runSupersede({ store: w.db.store, gmail, settings: w.db.settings })).toEqual({ stored: 0, superseded: 0, error: "Gmail request failed" });
  });
});
