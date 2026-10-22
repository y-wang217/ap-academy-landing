import { describe, expect, it, vi } from "vitest";
import {
  handleApproveDraft, handleEditDraft, handleIrisSettings, handleMarkHandled, handleRejectDraft, handleRetrySend, handleRunNow, loadInbox, loadIrisSettings, loadMessage, torontoMidnight,
  type IrisAdminDeps, type IrisReader,
} from "../../../lib/iris/handlers";
import { GmailError, type GmailSendPort } from "../../../lib/iris/gmail";
import { POLICY_VERSION } from "../../../lib/iris/policy";
import { attemptSend } from "../../../lib/iris/send";
import { fakeIrisStore } from "../../../lib/iris/store.fake";
import type { MessageDetail, ThreadView } from "../../../lib/iris/schemas";
import type { SchedulerIdentity } from "../../../lib/scheduler/identity";

// REQ-42 AC23, AC27: the owner-only Iris routes and page loaders.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const S1 = "11111111-1111-4111-8111-111111111111";
const ryan = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", name: "Ryan", email: "ryan@example.com", functions: ["Teacher"], status: "Active", subjects: [] };
const ADMIN: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const NOT_OWNERS: [string, SchedulerIdentity][] = [
  ["grade teacher", { scope: "none" }],
  ["scheduling teacher", { scope: "teacher", orgId: ORG, staff: ryan }],
  ["student", { scope: "none" }],
  ["parent", { scope: "none" }],
];

const M1 = "22222222-2222-4222-8222-222222222222";
const DETAIL: MessageDetail = {
  id: M1, gmailThreadId: "g1", fromEmail: "ann@example.com", fromName: "Ann", subject: "Sick", receivedAt: "2026-10-20T10:00:00Z",
  bodyText: "Sam is sick.", state: "classified", intent: "cancellation", confidence: 0.95, flags: [], escalationReason: null,
  policyVersion: 2, handledAt: null, notionStudentIds: [S1],
};

const D1 = "44444444-4444-4444-8444-444444444444";
const D2 = "55555555-5555-4555-8555-555555555555";
const VIEW: ThreadView = {
  thread: [],
  drafts: [{ id: D1, version: 1, replyType: "cancellation", bodyText: "Hi", policyVersion: POLICY_VERSION, state: "proposed", createdBy: "iris", edited: false, approvedAt: null, rejectedReason: null, createdAt: "2026-10-20T10:01:00Z" }],
  send: null,
};

function fakeReader(over: Partial<IrisReader> = {}) {
  const calls: string[] = [];
  const spy = <T,>(name: string, v: T) => async () => (calls.push(name), v);
  const reader: IrisReader = {
    getSettings: spy("getSettings", { paused: true, mailbox: null, lastPollAt: null, lastPollResult: null, lastError: null, confidenceThreshold: 0.85 }),
    lastRun: spy("lastRun", null),
    listNeedsYou: spy("listNeedsYou", [
      { id: "m1", gmailThreadId: "g1", fromEmail: "ann@example.com", subject: "Question", snippet: "Hi", receivedAt: "2026-10-20T10:00:00Z", state: "escalated" as const, escalationReason: "unknown_sender", intent: null, confidence: null, flags: [], notionStudentIds: [], notionStudentId: null, pushFailed: false },
    ]),
    listRecent: spy("listRecent", [
      { id: "m2", gmailThreadId: "g2", fromEmail: "pat@example.com", subject: "Re: Tuesday", snippet: "ok", receivedAt: "2026-10-20T11:00:00Z", state: "matched" as const, escalationReason: null, intent: null, confidence: null, flags: [], notionStudentIds: [S1], notionStudentId: null, pushFailed: false },
    ]),
    listDraftsWaiting: spy("listDraftsWaiting", [
      { id: "m3", gmailThreadId: "g3", fromEmail: "pat@example.com", subject: "Sick", snippet: "s", receivedAt: "2026-10-20T12:00:00Z", state: "drafted" as const, escalationReason: null, intent: "cancellation", confidence: 0.95, flags: [], notionStudentIds: [S1], notionStudentId: S1, pushFailed: true },
    ]),
    listSentToday: spy("listSentToday", []),
    listFailed: spy("listFailed", []),
    getThreadView: spy("getThreadView", VIEW as ThreadView | null),
    approveForSend: spy("approveForSend", { result: "ok" as const, sendId: D2 as string | null, state: "sending" as const as "sending" | "sent" | "failed" | null }),
    retrySend: spy("retrySend", { result: "ok" as const, state: "sending" as const as "sending" | "sent" | "failed" | null }),
    sendContext: spy("sendContext", null),
    claimSend: spy("claimSend", "claimed" as const),
    finishSend: spy("finishSend", undefined),
    failSendAttempt: spy("failSendAttempt", "retrying" as const),
    saveDraftEdit: spy("saveDraftEdit", { result: "ok" as const, draftId: D2 }),
    rejectDraft: spy("rejectDraft", "ok" as const),
    updatePaused: spy("updatePaused", 1),
    getMessage: spy("getMessage", DETAIL as MessageDetail | null),
    markHandled: spy("markHandled", "ok" as const),
    ...over,
  };
  return { reader, calls };
}

/** A scripted Gmail send port: `send` answers in order (an id, or a status to fail with); a refused send token is `tokenRefused`. */
function fakeSendPort(o: { send?: (string | number)[]; found?: string | null; tokenRefused?: number; findFails?: boolean } = {}) {
  const calls: string[] = [];
  const answers = [...(o.send ?? ["gm-1"])];
  const port: GmailSendPort = {
    readToken: async () => (calls.push("readToken"), "read-tok"),
    sendToken: async () => {
      calls.push("sendToken");
      if (o.tokenRefused) throw new GmailError(`Gmail token refused (${o.tokenRefused})`, o.tokenRefused);
      return "send-tok";
    },
    send: async (_t, raw) => {
      calls.push(`send:${raw.length > 0}`);
      const a = answers.length > 1 ? answers.shift()! : answers[0];
      if (typeof a === "number") throw new GmailError(`Gmail returned ${a}`, a);
      return { id: a, threadId: "t" };
    },
    findSent: async () => {
      calls.push("findSent");
      if (o.findFails) throw new GmailError("Gmail returned 503", 503);
      return o.found ?? null;
    },
  };
  return { port, calls };
}

function deps(identity: SchedulerIdentity, over: Partial<IrisReader> = {}, sender: GmailSendPort | null = fakeSendPort().port) {
  const r = fakeReader(over);
  const readerFor = vi.fn<(org: string) => IrisReader>(() => r.reader);
  const d: IrisAdminDeps = { identity: async () => identity, reader: readerFor, sender: () => (sender ? { gmail: sender, mailbox: "charlie@apacademy.ca" } : null) };
  return { d, readerFor, calls: r.calls };
}

describe("PATCH /api/iris/settings", () => {
  for (const [who, identity] of NOT_OWNERS) {
    it(`a ${who} gets 403 and nothing is read`, async () => {
      const w = deps(identity);
      const res = await handleIrisSettings(w.d, { paused: true });
      expect(res.status).toBe(403);
      expect(w.readerFor).not.toHaveBeenCalled();
    });
  }

  it("signed out is 401", async () => {
    const w = deps({ scope: "signed_out" });
    expect((await handleIrisSettings(w.d, { paused: true })).status).toBe(401);
    expect(w.readerFor).not.toHaveBeenCalled();
  });

  it("the owner pauses", async () => {
    const w = deps(ADMIN);
    const res = await handleIrisSettings(w.d, { paused: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ paused: true });
    expect(w.readerFor).toHaveBeenCalledWith(ORG);
  });

  it("unpause needs confirmed: true", async () => {
    const w = deps(ADMIN);
    const refused = await handleIrisSettings(w.d, { paused: false });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "confirm_required" });
    expect(w.calls).not.toContain("updatePaused");
    const ok = await handleIrisSettings(w.d, { paused: false, confirmed: true });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ paused: false });
  });

  it("refuses an unknown field or a bad body with 400", async () => {
    const w = deps(ADMIN);
    expect((await handleIrisSettings(w.d, { paused: true, sending_enabled: true })).status).toBe(400);
    expect((await handleIrisSettings(w.d, null)).status).toBe(400);
  });

  it("zero rows updated is 403; a failed update is 503", async () => {
    expect((await handleIrisSettings(deps(ADMIN, { updatePaused: async () => 0 }).d, { paused: true })).status).toBe(403);
    const failed = await handleIrisSettings(deps(ADMIN, { updatePaused: async () => { throw new Error("x"); } }).d, { paused: true });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "iris_unavailable" });
  });
});

describe("POST /api/iris/run-now", () => {
  const runResponse = { result: "ok", runId: "r1", seen: 1, stored: 1, matched: 1, escalated: 0, skipped: 0, failed: 0, purged: 0 };
  const fetcherOf = (status: number, body: unknown) => vi.fn<(u: string, i?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status }));

  for (const [who, identity] of NOT_OWNERS) {
    it(`a ${who} gets 403 and nothing is fetched`, async () => {
      const fetcher = fetcherOf(200, runResponse);
      const res = await handleRunNow({ identity: async () => identity, secret: "s", runUrl: "http://t/tracker/api/iris/run", fetcher: fetcher as unknown as typeof fetch });
      expect(res.status).toBe(403);
      expect(fetcher).not.toHaveBeenCalled();
    });
  }

  it("signed out is 401", async () => {
    const fetcher = fetcherOf(200, runResponse);
    expect((await handleRunNow({ identity: async () => ({ scope: "signed_out" }), secret: "s", runUrl: "u", fetcher: fetcher as unknown as typeof fetch })).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts to the run URL with the bearer and relays a 200", async () => {
    const fetcher = fetcherOf(200, runResponse);
    const res = await handleRunNow({ identity: async () => ADMIN, secret: "s3cret", runUrl: "http://t/tracker/api/iris/run", fetcher: fetcher as unknown as typeof fetch });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(runResponse);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("http://t/tracker/api/iris/run");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer s3cret");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("relays a 502 failed run", async () => {
    const fetcher = fetcherOf(502, { ...runResponse, result: "failed" });
    const res = await handleRunNow({ identity: async () => ADMIN, secret: "s", runUrl: "u", fetcher: fetcher as unknown as typeof fetch });
    expect(res.status).toBe(502);
    expect((await res.json()).result).toBe("failed");
  });

  it("no secret is 503", async () => {
    const fetcher = fetcherOf(200, runResponse);
    const res = await handleRunNow({ identity: async () => ADMIN, secret: undefined, runUrl: "u", fetcher: fetcher as unknown as typeof fetch });
    expect(res.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("an unreachable run is 503 iris_unavailable", async () => {
    const fetcher = vi.fn(async () => { throw new Error("down"); });
    const res = await handleRunNow({ identity: async () => ADMIN, secret: "s", runUrl: "u", fetcher: fetcher as unknown as typeof fetch });
    expect(res.status).toBe(503);
  });
});

describe("page loaders", () => {
  for (const [who, identity] of [...NOT_OWNERS, ["signed out", { scope: "signed_out" }] as [string, SchedulerIdentity]]) {
    it(`a ${who} is sent away before any read`, async () => {
      const w = deps(identity);
      const names = vi.fn(async () => new Map<string, string>());
      expect(await loadInbox({ ...w.d, studentNames: names })).toEqual({ kind: "denied" });
      expect(await loadIrisSettings(w.d, [])).toEqual({ kind: "denied" });
      expect(await loadMessage({ ...w.d, studentNames: names }, M1)).toEqual({ kind: "denied" });
      expect(w.readerFor).not.toHaveBeenCalled();
      expect(names).not.toHaveBeenCalled();
    });
  }

  it("an unavailable identity is an error, not a redirect", async () => {
    const w = deps({ scope: "unavailable" });
    expect(await loadInbox({ ...w.d, studentNames: async () => new Map() })).toEqual({ kind: "error" });
  });

  it("the owner gets both lists with family labels", async () => {
    const w = deps(ADMIN);
    const inbox = await loadInbox({ ...w.d, studentNames: async () => new Map([[S1, "Sam Lee"]]) });
    expect(inbox.kind).toBe("ok");
    if (inbox.kind !== "ok") return;
    expect(inbox.paused).toBe(true);
    expect(inbox.needsYou.map((r) => r.family)).toEqual(["ann@example.com"]);
    expect(inbox.recent.map((r) => r.family)).toEqual(["Sam Lee"]);
  });

  it("a student not in the names map shows as Paused student", async () => {
    const w = deps(ADMIN);
    const inbox = await loadInbox({ ...w.d, studentNames: async () => new Map() });
    if (inbox.kind !== "ok") throw new Error("expected ok");
    expect(inbox.recent[0].family).toBe("Paused student");
  });

  it("a failed read is an error", async () => {
    const w = deps(ADMIN, { listRecent: async () => { throw new Error("x"); } });
    expect(await loadInbox({ ...w.d, studentNames: async () => new Map() })).toEqual({ kind: "error" });
  });

  it("settings carry the state, the last run and the missing env names", async () => {
    const w = deps(ADMIN);
    const s = await loadIrisSettings(w.d, ["IRIS_GMAIL_PRIVATE_KEY"]);
    expect(s).toEqual({ kind: "ok", paused: true, lastRun: null, lastError: null, missing: ["IRIS_GMAIL_PRIVATE_KEY"], aiConfigured: true, confidenceThreshold: 0.85, phoneAlertsOff: false });
  });
});

// REQ-43 AC11, AC14, AC15: AI not set up, the message page and Mark handled.
describe("AI not set up (AC11)", () => {
  it("settings say so when the key is unset", async () => {
    const s = await loadIrisSettings(deps(ADMIN).d, [], false);
    expect(s).toMatchObject({ kind: "ok", aiConfigured: false });
  });
});

describe("loadMessage (AC14)", () => {
  it("the owner gets the message with its family label", async () => {
    const w = deps(ADMIN);
    const r = await loadMessage({ ...w.d, studentNames: async () => new Map([[S1, "Sam Lee"]]) }, M1);
    expect(r).toEqual({ kind: "ok", message: { ...DETAIL, family: "Sam Lee" }, view: VIEW, currentPolicyVersion: POLICY_VERSION });
  });

  it("a bad id or a missing message is not found; a failed read is an error", async () => {
    const names = async () => new Map<string, string>();
    const w = deps(ADMIN);
    expect(await loadMessage({ ...w.d, studentNames: names }, "nope")).toEqual({ kind: "not_found" });
    expect(w.calls).not.toContain("getMessage");
    expect(await loadMessage({ ...deps(ADMIN, { getMessage: async () => null }).d, studentNames: names }, M1)).toEqual({ kind: "not_found" });
    expect(await loadMessage({ ...deps(ADMIN, { getMessage: async () => { throw new Error("x"); } }).d, studentNames: names }, M1)).toEqual({ kind: "error" });
  });
});

describe("POST /api/iris/messages/[id]/handled (AC15)", () => {
  for (const [who, identity] of NOT_OWNERS) {
    it(`a ${who} gets 403 and nothing is read or written`, async () => {
      const w = deps(identity);
      expect((await handleMarkHandled(w.d, M1)).status).toBe(403);
      expect(w.readerFor).not.toHaveBeenCalled();
    });
  }

  it("signed out is 401", async () => {
    const w = deps({ scope: "signed_out" });
    expect((await handleMarkHandled(w.d, M1)).status).toBe(401);
    expect(w.readerFor).not.toHaveBeenCalled();
  });

  it("the owner marks it handled, then a second call is 409", async () => {
    let done = false;
    const w = deps(ADMIN, { markHandled: async () => (done ? "conflict" : ((done = true), "ok")) });
    const first = await handleMarkHandled(w.d, M1);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ handled: true });
    const second = await handleMarkHandled(w.d, M1);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "already_handled" });
  });

  it("an unknown or non-escalated message is 404, a bad id is 404 with no write", async () => {
    expect((await handleMarkHandled(deps(ADMIN, { markHandled: async () => "not_found" }).d, M1)).status).toBe(404);
    const w = deps(ADMIN);
    expect((await handleMarkHandled(w.d, "not-a-guid")).status).toBe(404);
    expect(w.calls).not.toContain("markHandled");
  });

  it("a failed save is 500 and never says handled", async () => {
    const res = await handleMarkHandled(deps(ADMIN, { markHandled: async () => { throw new Error("x"); } }).d, M1);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "save_failed" });
  });
});

// REQ-44 AC8 to AC10, AC13, AC15, AC18: the draft reviews, the four queue sections and phone alerts.
const REVIEWS: [string, (d: IrisAdminDeps, id: string, body: unknown) => Promise<Response>, unknown, keyof IrisReader][] = [
  ["edit", handleEditDraft, { version: 1, body: "Hi Pat, see you Tuesday." }, "saveDraftEdit"],
  ["reject", handleRejectDraft, { reason: "Too formal" }, "rejectDraft"],
];
for (const [name, handle, body, method] of REVIEWS) {
  describe(`POST /api/iris/drafts/[id]/${name}`, () => {
    for (const [who, identity] of NOT_OWNERS) {
      it(`a ${who} gets 403 before any Iris read`, async () => {
        const w = deps(identity);
        expect((await handle(w.d, D1, body)).status).toBe(403);
        expect(w.readerFor).not.toHaveBeenCalled();
      });
    }

    it("the owner gets 200", async () => {
      const w = deps(ADMIN);
      const res = await handle(w.d, D1, body);
      expect(res.status).toBe(200);
      expect(w.calls).toEqual([method]);
      if (name === "edit") expect(await res.json()).toEqual({ ok: true, draftId: D2 });
    });

    it("a conflict is 409, an unknown or other-org draft 404, a failed save 500", async () => {
      const result = (r: "conflict" | "not_found") => (name === "edit" ? async () => ({ result: r, draftId: null }) : async () => r);
      expect((await handle(deps(ADMIN, { [method]: result("conflict") }).d, D1, body)).status).toBe(409);
      expect((await handle(deps(ADMIN, { [method]: result("not_found") }).d, D1, body)).status).toBe(404);
      const failed = await handle(deps(ADMIN, { [method]: async () => { throw new Error("x"); } }).d, D1, body);
      expect(failed.status).toBe(500);
      expect(await failed.json()).toEqual({ error: "save_failed" });
    });

    it("a bad id is 404 and a bad body 400, with no call", async () => {
      const w = deps(ADMIN);
      expect((await handle(w.d, "nope", body)).status).toBe(404);
      for (const bad of [null, {}, { ...(body as object), extra: 1 }]) expect((await handle(w.d, D1, bad)).status).toBe(400);
      expect(w.calls).toEqual([]);
    });
  });
}

describe("review bodies", () => {
  it("edit takes 1 to 5,000 characters; reject 1 to 300; version is a positive integer", async () => {
    const w = deps(ADMIN);
    expect((await handleEditDraft(w.d, D1, { version: 1, body: " " })).status).toBe(400);
    expect((await handleEditDraft(w.d, D1, { version: 1, body: "a".repeat(5001) })).status).toBe(400);
    expect((await handleRejectDraft(w.d, D1, { reason: "a".repeat(301) })).status).toBe(400);
    expect((await handleApproveDraft(w.d, D1, { version: 0 })).status).toBe(400);
    expect((await handleApproveDraft(w.d, D1, { version: "1" })).status).toBe(400);
    expect(w.calls).toEqual([]);
  });
});

describe("loadInbox sections (AC13)", () => {
  it("the owner gets Needs you, Drafts waiting, Sent today, Failed and Recent, with child labels and the push mark", async () => {
    const w = deps(ADMIN);
    const inbox = await loadInbox({ ...w.d, studentNames: async () => new Map([[S1, "Sam Lee"]]) });
    if (inbox.kind !== "ok") throw new Error("expected ok");
    expect(inbox.drafts).toEqual([expect.objectContaining({ id: "m3", family: "Sam Lee", child: "Sam Lee", pushFailed: true, confidence: 0.95 })]);
    expect(inbox.sentToday).toEqual([]);
    expect(inbox.failed).toEqual([]);
    expect(w.calls).toEqual(expect.arrayContaining(["listNeedsYou", "listDraftsWaiting", "listSentToday", "listFailed", "listRecent"]));
  });

  it("Sent today starts at Toronto midnight", () => {
    expect(torontoMidnight(new Date("2026-10-21T16:00:00Z"))).toBe("2026-10-21T04:00:00.000Z");
    expect(torontoMidnight(new Date("2026-10-22T02:00:00Z"))).toBe("2026-10-21T04:00:00.000Z");
    expect(torontoMidnight(new Date("2026-12-01T12:00:00Z"))).toBe("2026-12-01T05:00:00.000Z");
  });
});

describe("loadMessage drafts (AC14)", () => {
  it("a message outside the org reads no thread", async () => {
    const r = await loadMessage({ ...deps(ADMIN, { getThreadView: async () => null }).d, studentNames: async () => new Map() }, M1);
    expect(r).toEqual({ kind: "not_found" });
  });
});

describe("phone alerts (AC18)", () => {
  it("settings say phone alerts are off when NOTION_CHARLIE_USER_ID is unset", async () => {
    expect(await loadIrisSettings(deps(ADMIN).d, [], true, true)).toMatchObject({ kind: "ok", phoneAlertsOff: true });
  });
});

// REQ-48 AC1, AC6 to AC9, AC12: Approve sends once; Retry searches first.
/** A reader whose send rows live in the fake store, as the owner's client would see them. */
function sendWorld(o: { paused?: boolean; send?: (string | number)[]; found?: string | null; tokenRefused?: number; findFails?: boolean; approved?: Parameters<ReturnType<typeof fakeIrisStore>["approved"]>[0] } = {}) {
  const db = fakeIrisStore({ paused: o.paused ?? false });
  const a = db.approved({ ...o.approved });
  const gmail = fakeSendPort(o);
  let approvals = 0;
  const over: Partial<IrisReader> = {
    approveForSend: async () => {
      if (db.settings.paused) return { result: "paused", sendId: null, state: null };
      approvals += 1;
      return approvals === 1 ? { result: "ok", sendId: a.sendId, state: "sending" } : { result: "existing", sendId: a.sendId, state: db.sends.get(a.sendId)!.state };
    },
    retrySend: async (id) => {
      const x = db.sends.get(id);
      if (!x) return { result: "not_found", state: null };
      if (x.state !== "failed") return { result: "not_failed", state: x.state };
      if (db.settings.paused) return { result: "paused", state: null };
      Object.assign(x, { state: "sending", attempts: 1, lastError: null, leaseUntil: Date.now() + 60_000 });
      return { result: "ok", state: "sending" };
    },
    sendContext: db.store.sendContext,
    claimSend: db.store.claimSend,
    finishSend: db.store.finishSend,
    failSendAttempt: db.store.failSendAttempt,
  };
  const w = deps(ADMIN, over, gmail.port);
  return { ...w, db, a, gmail };
}

describe("POST /api/iris/drafts/[id]/approve sends (REQ-48)", () => {
  for (const [who, identity] of NOT_OWNERS) {
    it(`a ${who} gets 403 with nothing read and no Gmail call`, async () => {
      const g = fakeSendPort();
      const w = deps(identity, {}, g.port);
      expect((await handleApproveDraft(w.d, D1, { version: 1 })).status).toBe(403);
      expect(w.readerFor).not.toHaveBeenCalled();
      expect(g.calls).toEqual([]);
    });
  }

  it("approve twice: 200 both times, one Gmail send, the send recorded once", async () => {
    const w = sendWorld();
    const first = await handleApproveDraft(w.d, D1, { version: 1 });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, state: "sent", error: null });
    const second = await handleApproveDraft(w.d, D1, { version: 1 });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, state: "sent", error: null });
    expect(w.gmail.calls).toEqual(["sendToken", "send:true"]);
    expect(w.db.sends.get(w.a.sendId)).toMatchObject({ state: "sent", gmailMessageId: "gm-1" });
    expect([...w.db.messages.values()].filter((m) => m.direction === "outbound" && m.source === "iris")).toHaveLength(1);
  });

  it("the first attempt sends without a search; a Gmail 500 is still 200 with the status line", async () => {
    const w = sendWorld({ send: [500] });
    const res = await handleApproveDraft(w.d, D1, { version: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, state: "sending", error: "Gmail returned 500" });
    expect(w.gmail.calls).not.toContain("findSent");
    expect(w.db.sends.get(w.a.sendId)).toMatchObject({ state: "sending", leaseUntil: null, lastError: "Gmail returned 500" });
  });

  it("paused is 409 paused with no approval and no Gmail call", async () => {
    const w = sendWorld({ paused: true });
    const res = await handleApproveDraft(w.d, D1, { version: 1 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "paused" });
    expect(w.gmail.calls).toEqual([]);
  });

  it("Gmail not configured is 503 before any write", async () => {
    const w = deps(ADMIN, {}, null);
    const res = await handleApproveDraft(w.d, D1, { version: 1 });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "iris_not_configured" });
    expect(w.calls).toEqual([]);
  });

  it("a conflict is 409, an unknown draft 404, a database throw 500", async () => {
    const out = (result: "conflict" | "not_found") => async () => ({ result, sendId: null, state: null });
    expect((await handleApproveDraft(deps(ADMIN, { approveForSend: out("conflict") }).d, D1, { version: 1 })).status).toBe(409);
    expect((await handleApproveDraft(deps(ADMIN, { approveForSend: out("not_found") }).d, D1, { version: 1 })).status).toBe(404);
    const failed = await handleApproveDraft(deps(ADMIN, { approveForSend: async () => { throw new Error("x"); } }).d, D1, { version: 1 });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "save_failed" });
  });

  it("a refused send token fails only that attempt, with the not-authorised line", async () => {
    const w = sendWorld({ tokenRefused: 403 });
    const res = await handleApproveDraft(w.d, D1, { version: 1 });
    expect(await res.json()).toEqual({ ok: true, state: "sending", error: "Gmail send is not authorised (403)" });
  });

  it("a bad id is 404 and a bad body 400, before Gmail or the reader", async () => {
    const w = deps(ADMIN);
    expect((await handleApproveDraft(w.d, "nope", { version: 1 })).status).toBe(404);
    for (const bad of [null, {}, { version: 1, extra: 1 }]) expect((await handleApproveDraft(w.d, D1, bad)).status).toBe(400);
    expect(w.calls).toEqual([]);
  });
});

describe("POST /api/iris/sends/[id]/retry (REQ-48 AC6)", () => {
  for (const [who, identity] of NOT_OWNERS) {
    it(`a ${who} gets 403 with nothing read`, async () => {
      const w = deps(identity);
      expect((await handleRetrySend(w.d, D2)).status).toBe(403);
      expect(w.readerFor).not.toHaveBeenCalled();
    });
  }

  it("retry on a send that is not failed is 409; on another org's send 404", async () => {
    const w = sendWorld();
    expect((await handleRetrySend(w.d, w.a.sendId)).status).toBe(409);
    expect((await handleRetrySend(w.d, "66666666-6666-4666-8666-666666666666")).status).toBe(404);
    expect(w.gmail.calls).toEqual([]);
  });

  it("Approve plus two run attempts at Gmail 500 end failed; then Retry searches first and sends", async () => {
    const w = sendWorld({ send: [500, 500, 500, "gm-9"] });
    await handleApproveDraft(w.d, D1, { version: 1 });
    for (let i = 0; i < 2; i++) {
      expect(await w.db.store.claimSend(w.a.sendId, 60, 3)).toBe("claimed");
      await attemptSend({ store: w.db.store, gmail: w.gmail.port, sendId: w.a.sendId, mailbox: "charlie@apacademy.ca", verifyFirst: true, now: () => new Date() });
    }
    expect(w.db.sends.get(w.a.sendId)).toMatchObject({ state: "failed", attempts: 3, lastError: "Gmail returned 500" });
    w.gmail.calls.length = 0;
    const res = await handleRetrySend(w.d, w.a.sendId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, state: "sent", error: null });
    expect(w.gmail.calls).toEqual(["readToken", "findSent", "sendToken", "send:true"]);
  });

  it("a message that went out earlier is recorded by Retry, not sent again", async () => {
    const w = sendWorld({ found: "gm-earlier" });
    w.db.sends.get(w.a.sendId)!.state = "failed";
    const res = await handleRetrySend(w.d, w.a.sendId);
    expect(await res.json()).toEqual({ ok: true, state: "sent", error: null });
    expect(w.gmail.calls).toEqual(["readToken", "findSent"]);
    expect(w.db.sends.get(w.a.sendId)!.gmailMessageId).toBe("gm-earlier");
  });

  it("paused Retry is 409 paused", async () => {
    const w = sendWorld();
    w.db.sends.get(w.a.sendId)!.state = "failed";
    w.db.settings.paused = true;
    const res = await handleRetrySend(w.d, w.a.sendId);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "paused" });
  });
});
