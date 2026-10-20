import { describe, expect, it } from "vitest";
import { runIntake, POLL_QUERY, type GmailPort, type IntakeDeps } from "./intake";
import { GmailError, type GmailMessage } from "./gmail";
import { POLICY_VERSION } from "./policy";
import { fakeIrisStore } from "./store.fake";
import type { FamilyEntry } from "../notion/parents";
import { NotionError } from "../notion/staff";

// REQ-42 AC13 to AC19: one poll of the inbox, with fake Gmail, store and directory.
const MAILBOX = "charlie@apacademy.ca";
const SAM = "11111111-1111-4111-8111-111111111111";
const HAIDER = "22222222-2222-4222-8222-222222222222";
const ADA = "33333333-3333-4333-8333-333333333333";
const FAMILIES: FamilyEntry[] = [
  { studentId: SAM, studentName: "Sam Lee", stage: "Active", parentEmail: "ann@x.com", parentName: "Ann Lee" },
  { studentId: HAIDER, studentName: "Haider Afzal", stage: "Active", parentEmail: "fam@y.com", parentName: "Pat Afzal" },
  { studentId: ADA, studentName: "Ada Afzal", stage: "Paused", parentEmail: "fam@y.com", parentName: "Pat Afzal" },
];
const T0 = Date.parse("2026-10-20T12:00:00Z");

let seq = 0;
function mail(opts: { id?: string; thread?: string; from: string; body?: string; html?: string; headers?: Record<string, string>; at?: number; snippet?: string }): GmailMessage {
  const id = opts.id ?? `m${++seq}`;
  const headers = [
    { name: "From", value: opts.from },
    { name: "Subject", value: `Subject of ${id}` },
    { name: "Message-ID", value: `<${id}@mail>` },
    ...Object.entries(opts.headers ?? {}).map(([name, value]) => ({ name, value })),
  ];
  const parts = opts.html !== undefined
    ? [{ mimeType: "text/html", body: { data: Buffer.from(opts.html).toString("base64url") } }]
    : [{ mimeType: "text/plain", body: { data: Buffer.from(opts.body ?? `Body of ${id}`).toString("base64url") } }];
  return { id, threadId: opts.thread ?? `t-${id}`, internalDate: String(opts.at ?? T0 - 3600_000 + seq * 1000), snippet: opts.snippet ?? `Snippet of ${id}`, payload: { mimeType: "multipart/alternative", headers, parts } };
}

/** Gmail lists newest first, as the API does. */
function fakeGmail(initial: GmailMessage[] = []) {
  const box = new Map(initial.map((m) => [m.id, m]));
  const calls: { op: string; arg: string }[] = [];
  const failGet = new Set<string>();
  let failList = false;
  const port: GmailPort = {
    token: async () => "tok",
    list: async (_t, q) => {
      calls.push({ op: "list", arg: q });
      if (failList) throw new GmailError("Gmail returned 500", 500);
      return [...box.values()].sort((a, b) => Number(b.internalDate) - Number(a.internalDate)).map((m) => m.id);
    },
    get: async (_t, id) => {
      calls.push({ op: "get", arg: id });
      if (failGet.has(id)) throw new GmailError("Gmail returned 500", 500);
      const m = box.get(id);
      if (!m) throw new GmailError("Gmail returned 404", 404);
      return m;
    },
  };
  return { port, calls, box, failGet, setFailList: (v: boolean) => (failList = v), gets: () => calls.filter((c) => c.op === "get").map((c) => c.arg) };
}

function world(initial: GmailMessage[] = []) {
  const db = fakeIrisStore();
  const gmail = fakeGmail(initial);
  let directory: () => Promise<FamilyEntry[]> = async () => FAMILIES;
  const deps = (): IntakeDeps => ({ store: db.store, gmail: gmail.port, directory: () => directory(), now: () => new Date(T0), mailbox: MAILBOX, settings: db.settings });
  return { db, gmail, deps, setDirectory: (d: typeof directory) => (directory = d) };
}

describe("runIntake: the poll", () => {
  it("lists once with the 3-day primary inbox query and asks about the listed ids", async () => {
    const w = world([mail({ from: "ann@x.com", at: T0 - 5000 }), mail({ from: "ann@x.com", at: T0 - 9000 })]);
    const seen: string[][] = [];
    const known = w.db.store.knownGmailIds;
    w.db.store.knownGmailIds = async (ids) => (seen.push(ids), known(ids));
    await runIntake(w.deps());
    expect(POLL_QUERY).toBe("in:inbox category:primary newer_than:3d");
    expect(w.gmail.calls.filter((c) => c.op === "list")).toEqual([{ op: "list", arg: POLL_QUERY }]);
    expect(seen[0]).toHaveLength(2);
    const [oldest] = [...w.gmail.box.values()].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
    expect(w.gmail.gets()[0]).toBe(oldest.id);
  });

  it("stores each message once across two runs; the second stores 0", async () => {
    const w = world([mail({ from: "ann@x.com" }), mail({ from: "who@z.com" })]);
    const first = await runIntake(w.deps());
    expect(first).toMatchObject({ result: "ok", seen: 2, stored: 2 });
    const second = await runIntake(w.deps());
    expect(second).toMatchObject({ result: "ok", seen: 2, stored: 0 });
    expect(w.db.messages.size).toBe(2);
  });

  it("takes 50 of 60 new ids, oldest first", async () => {
    const w = world(Array.from({ length: 60 }, (_, i) => mail({ id: `bulk${i}`, from: "ann@x.com", at: T0 - 100_000 + i * 10 })));
    const out = await runIntake(w.deps());
    expect(out.stored).toBe(50);
    expect(w.gmail.gets().slice().sort()).toEqual(Array.from({ length: 50 }, (_, i) => `bulk${i}`).sort());
    expect(w.db.byGmailId("bulk59")).toBeUndefined();
  });
});

describe("runIntake: what is stored", () => {
  it("a matched message keeps its body, state and policy version; a 25,000-character body is cut to 20,000", async () => {
    const w = world([mail({ id: "a1", from: "Ann Lee <Ann@X.com>", body: "Sam is sick today." }), mail({ id: "a2", from: "ann@x.com", body: "z".repeat(25000) })]);
    await runIntake(w.deps());
    const a1 = w.db.byGmailId("a1")!;
    expect(a1).toMatchObject({ state: "matched", direction: "inbound", source: "external", fromEmail: "ann@x.com", fromName: "Ann Lee", bodyText: "Sam is sick today.", bodyTruncated: false, policyVersion: POLICY_VERSION });
    expect(w.db.threadOf("a1")).toMatchObject({ matchState: "matched", notionStudentIds: [SAM], parentEmail: "ann@x.com" });
    const a2 = w.db.byGmailId("a2")!;
    expect(a2.bodyText).toHaveLength(20000);
    expect(a2.bodyTruncated).toBe(true);
  });

  it("automated mail keeps no body and is escalated automated with handled_at", async () => {
    const w = world([mail({ id: "news", from: "News <news@shop.com>", headers: { "List-Unsubscribe": "<https://shop.com/u>" } })]);
    const out = await runIntake(w.deps());
    expect(w.db.byGmailId("news")).toMatchObject({ bodyText: null, state: "escalated", escalationReason: "automated", snippet: "Snippet of news" });
    expect(w.db.byGmailId("news")!.handledAt).not.toBeNull();
    expect(out.escalated).toBe(1);
  });

  it("an unknown sender keeps a snippet and no body, escalated unknown_sender", async () => {
    const w = world([mail({ id: "u1", from: "Lead <lead@z.com>", snippet: "x".repeat(250) })]);
    await runIntake(w.deps());
    const u1 = w.db.byGmailId("u1")!;
    expect(u1).toMatchObject({ bodyText: null, state: "escalated", escalationReason: "unknown_sender", fromEmail: "lead@z.com", handledAt: null });
    expect(u1.snippet).toHaveLength(200);
    expect(w.db.threadOf("u1")).toMatchObject({ matchState: "unknown", notionStudentIds: [] });
  });

  it("a sibling family gets both student ids on the thread", async () => {
    const w = world([mail({ id: "f1", from: "FAM@y.com", html: "<p>Both kids are away</p>" })]);
    await runIntake(w.deps());
    expect(w.db.byGmailId("f1")).toMatchObject({ state: "matched", bodyText: "Both kids are away" });
    expect(w.db.threadOf("f1")!.notionStudentIds).toEqual([HAIDER, ADA]);
  });

  it("mail from the mailbox is outbound charlie_manual in a known thread, skipped in an unknown one", async () => {
    const w = world([
      mail({ id: "in1", thread: "T1", from: "ann@x.com", at: T0 - 9000 }),
      mail({ id: "out1", thread: "T1", from: "Charlie <Charlie@APAcademy.ca>", body: "See you Tuesday", at: T0 - 5000 }),
      mail({ id: "out2", thread: "T9", from: "charlie@apacademy.ca", at: T0 - 4000 }),
    ]);
    const out = await runIntake(w.deps());
    expect(w.db.byGmailId("out1")).toMatchObject({ direction: "outbound", source: "charlie_manual", state: null, bodyText: "See you Tuesday", policyVersion: null });
    expect(w.db.threads.get("T1")!.lastOutboundAt).toBe(new Date(T0 - 5000).toISOString());
    expect(w.db.byGmailId("out2")).toBeUndefined();
    expect(w.db.threads.has("T9")).toBe(false);
    expect(w.db.events).toHaveLength(1);
    expect(out.skipped).toBe(1);
  });

  it("every inbound row has the policy version and purge_at = received + retention; events carry no address or body", async () => {
    const w = world([mail({ id: "p1", from: "ann@x.com", body: "Private words" }), mail({ id: "p2", from: "who@z.com" }), mail({ id: "p3", from: "noreply@x.com" })]);
    await runIntake(w.deps());
    for (const m of w.db.messages.values()) {
      expect(m.policyVersion).toBe(POLICY_VERSION);
      expect(Date.parse(m.purgeAt) - Date.parse(m.receivedAt)).toBe(90 * 86400_000);
    }
    expect(w.db.events.length).toBe(3);
    const detail = JSON.stringify(w.db.events.map((e) => e.detail));
    expect(detail).not.toContain("@");
    expect(detail).not.toContain("Private words");
  });
});

describe("runIntake: failures", () => {
  it("AC18: a directory failure stores received with no body, then a later run re-gets and matches; 3 failures give failed", async () => {
    const w = world([mail({ id: "A", from: "ann@x.com", body: "Body A" }), mail({ id: "B", from: "who@z.com", body: "Body B" })]);
    w.setDirectory(async () => { throw new NotionError("Notion returned 503", 503); });

    const run1 = await runIntake(w.deps());
    expect(run1.result).toBe("ok");
    expect(run1.error).toBe("Notion returned 503");
    const a = w.db.byGmailId("A")!;
    expect(a).toMatchObject({ state: "received", bodyText: null, retryCount: 1 });
    expect(a.lastError!.length).toBeLessThanOrEqual(300);
    expect(a.lastError).not.toContain("@");
    expect(w.db.byGmailId("B")).toMatchObject({ state: "received", bodyText: null });

    // C arrives in run 1's inbox too, but only after A and B were stored; it waits on the directory with them.
    w.gmail.box.set("C", mail({ id: "C", from: "ann@x.com", body: "Body C" }));
    w.setDirectory(async () => FAMILIES);
    const getsBefore = w.gmail.gets().length;
    const run2 = await runIntake(w.deps());
    expect(run2.result).toBe("ok");
    expect(w.gmail.gets().slice(getsBefore)).toEqual(expect.arrayContaining(["A", "B", "C"]));
    expect(w.db.byGmailId("A")).toMatchObject({ state: "matched", bodyText: "Body A" });
    expect(w.db.threadOf("A")!.notionStudentIds).toEqual([SAM]);
    expect(w.db.byGmailId("B")).toMatchObject({ state: "escalated", escalationReason: "unknown_sender", bodyText: null });
  });

  it("AC18: three failing runs move a message to failed, and a fourth run does not fetch it", async () => {
    const w = world([mail({ id: "C", from: "ann@x.com" })]);
    w.setDirectory(async () => { throw new NotionError("Notion request failed"); });
    for (let i = 0; i < 3; i++) await runIntake(w.deps());
    expect(w.db.byGmailId("C")).toMatchObject({ state: "failed", retryCount: 3, lastError: "Notion request failed" });
    w.setDirectory(async () => FAMILIES);
    const before = w.gmail.gets().length;
    await runIntake(w.deps());
    expect(w.gmail.gets().slice(before)).not.toContain("C");
  });

  it("one get failure is counted and the run goes on", async () => {
    const w = world([mail({ id: "g1", from: "ann@x.com" }), mail({ id: "g2", from: "ann@x.com" })]);
    w.gmail.failGet.add("g1");
    const out = await runIntake(w.deps());
    expect(out).toMatchObject({ result: "ok", failed: 1, stored: 1 });
    expect(w.db.byGmailId("g1")).toBeUndefined();
  });

  it("a list failure ends the run as failed with gmailListFailed", async () => {
    const w = world([mail({ from: "ann@x.com" })]);
    w.gmail.setFailList(true);
    const out = await runIntake(w.deps());
    expect(out).toMatchObject({ result: "failed", gmailListFailed: true, error: "Gmail returned 500" });
    expect(w.gmail.gets()).toEqual([]);
  });

  it("a store that throws mid-run resolves to failed", async () => {
    const w = world([mail({ from: "ann@x.com" })]);
    w.db.fail.add("insertMessage");
    const out = await runIntake(w.deps());
    expect(out.result).toBe("failed");
    expect(out.gmailListFailed).toBe(false);
    expect(out.error!.length).toBeLessThanOrEqual(300);
  });

});
