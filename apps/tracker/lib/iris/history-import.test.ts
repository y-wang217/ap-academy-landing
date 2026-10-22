import { describe, expect, it } from "vitest";
import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import { GmailError, type GmailMessage } from "./gmail";
import { ADDRESS_CHUNK, runHistoryImport } from "./history-import";
import type { GmailPort } from "./intake";
import { fakeIrisStore } from "./store.fake";

// REQ-45 AC1, AC2, AC4: the history import, over a fake store and a fake Gmail.
const NOW = Date.parse("2026-10-22T12:00:00Z");
const DAY = 86_400_000;
const S1 = "11111111-1111-4111-8111-111111111111";

const family = (n: number): FamilyEntry[] =>
  Array.from({ length: n }, (_, i) => ({ studentId: i === 0 ? S1 : `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`, studentName: `Kid${i} Doe`, stage: "Active", parentEmail: `p${i}@example.com`, parentName: `Pat${i} Doe` }));

const mail = (id: string, threadId: string, from: string, daysAgo: number, extra: { name: string; value: string }[] = []): GmailMessage => ({
  id, threadId, internalDate: String(NOW - daysAgo * DAY), snippet: "s",
  payload: { mimeType: "text/plain", headers: [{ name: "From", value: from }, { name: "Subject", value: "Hi" }, ...extra], body: { data: Buffer.from(`body of ${id}`).toString("base64url") } },
});

function world(opts: { inbound?: GmailMessage[]; sent?: GmailMessage[]; entries?: FamilyEntry[]; listCap?: boolean } = {}) {
  const db = fakeIrisStore();
  db.setNow(() => NOW);
  const inbound = opts.inbound ?? [];
  const sent = opts.sent ?? [];
  const queries: string[] = [];
  const gets: string[] = [];
  const gmail: GmailPort = {
    token: async () => "tok",
    list: async () => [],
    listRefs: async (_t, q) => {
      queries.push(q);
      const pool = q.startsWith("in:sent") ? sent : inbound;
      const refs = pool.map((m) => ({ id: m.id, threadId: m.threadId })).reverse();
      return opts.listCap ? [...refs, ...Array.from({ length: 500 - refs.length }, (_, i) => ({ id: `pad${i}`, threadId: "pad" }))].slice(0, 500) : refs;
    },
    get: async (_t, id) => {
      gets.push(id);
      const m = [...inbound, ...sent].find((x) => x.id === id);
      if (!m) throw new GmailError("Gmail returned 404", 404);
      return m;
    },
  };
  const run = () => runHistoryImport({ store: db.store, gmail, directory: async () => opts.entries ?? family(1), now: () => new Date(NOW), settings: db.settings });
  return { db, gmail, queries, gets, run };
}

describe("runHistoryImport", () => {
  it("does nothing, and calls no Gmail, without a pending request", async () => {
    const w = world({ inbound: [mail("a", "t1", "p0@example.com", 30)] });
    expect(await w.run()).toMatchObject({ ran: false });
    expect(w.queries).toEqual([]);
    expect(w.gets).toEqual([]);
  });

  it("queries a year of mail older than the poll window, 15 addresses per query", async () => {
    const w = world({ entries: family(16) });
    w.db.request("eval_import_requested");
    await w.run();
    expect(ADDRESS_CHUNK).toBe(15);
    const addrs = Array.from({ length: 15 }, (_, i) => `p${i}@example.com`).join(" OR ");
    expect(w.queries).toEqual([
      `newer_than:365d older_than:3d from:(${addrs})`,
      `in:sent newer_than:365d older_than:3d to:(${addrs})`,
      "newer_than:365d older_than:3d from:(p15@example.com)",
      "in:sent newer_than:365d older_than:3d to:(p15@example.com)",
    ]);
  });

  it("stores a matched message as handled history and skips unknown and automated senders entirely", async () => {
    const w = world({
      inbound: [
        mail("a", "t1", "Pat <P0@Example.com>", 30),
        mail("u", "t2", "stranger@example.com", 20),
        mail("b", "t3", "p0@example.com", 10, [{ name: "Auto-Submitted", value: "auto-replied" }]),
      ],
    });
    w.db.request("eval_import_requested");
    const out = await w.run();
    expect(out).toMatchObject({ storedInbound: 1, skipped: 2, finished: true });
    const a = w.db.byGmailId("a")!;
    expect(a).toMatchObject({
      direction: "inbound", source: "external", state: "escalated", escalationReason: "history_import", policyVersion: null,
      handledAt: new Date(NOW).toISOString(), purgeAt: new Date(NOW + 90 * DAY).toISOString(), bodyText: "body of a",
    });
    expect(w.db.threadOf("a")).toMatchObject({ matchState: "matched", notionStudentIds: [S1] });
    expect(w.db.byGmailId("u")).toBeUndefined();
    expect(w.db.byGmailId("b")).toBeUndefined();
    expect(w.db.threads.has("t2")).toBe(false);
    expect(w.db.threads.has("t3")).toBe(false);
    // No body, address or name in any event.
    expect(JSON.stringify(w.db.events)).not.toMatch(/example\.com|body of|Pat/);
  });

  it("stores Charlie's reply only in a thread with a stored inbound message", async () => {
    const w = world({
      inbound: [mail("a", "t1", "p0@example.com", 30)],
      sent: [mail("r1", "t1", "charlie@apacademy.ca", 29), mail("r2", "t9", "charlie@apacademy.ca", 28)],
    });
    w.db.request("eval_import_requested");
    expect(await w.run()).toMatchObject({ storedInbound: 1, storedReplies: 1, finished: true });
    expect(w.db.byGmailId("r1")).toMatchObject({ direction: "outbound", source: "charlie_manual", purgeAt: new Date(NOW + 90 * DAY).toISOString() });
    expect(w.db.byGmailId("r2")).toBeUndefined();
  });

  it("imports twice and stores each message once, with one finished event", async () => {
    const w = world({ inbound: [mail("a", "t1", "p0@example.com", 30), mail("u", "t2", "x@y.com", 5)] });
    w.db.request("eval_import_requested");
    await w.run();
    const finished = () => w.db.events.filter((e) => e.kind === "eval_import_finished");
    expect(finished()).toHaveLength(1);
    expect(await w.run()).toMatchObject({ ran: false });
    w.db.request("eval_import_requested");
    const again = await w.run();
    expect(again).toMatchObject({ storedInbound: 0, finished: true });
    expect([...w.db.messages.values()].filter((m) => m.gmailMessageId === "a")).toHaveLength(1);
  });

  it("makes at most irisMaxImportPerRun gets per run and finishes on a later run, skipped ids not fetched again", async () => {
    const n = TUNING.irisMaxImportPerRun + 5;
    const inbound = Array.from({ length: n }, (_, i) => mail(`m${i}`, `t${i}`, i === 0 ? "nobody@x.com" : "p0@example.com", 40 - i * 0.1));
    const w = world({ inbound });
    const req = w.db.request("eval_import_requested");
    const first = await w.run();
    expect(w.gets).toHaveLength(TUNING.irisMaxImportPerRun);
    expect(w.gets[0]).toBe("m0");
    expect(first).toMatchObject({ finished: false, skipped: 1 });
    w.gets.length = 0;
    const second = await w.run();
    expect(w.gets).not.toContain("m0");
    expect(second.finished).toBe(true);
    const done = w.db.events.find((e) => e.kind === "eval_import_finished")!;
    expect(done.detail).toEqual({ request_id: req, stored_inbound: n - 1, stored_replies: 0, skipped: 1, capped: false });
  });

  it("marks the finished event capped when a list hit 500 ids", async () => {
    const w = world({ inbound: [mail("a", "t1", "p0@example.com", 30)], listCap: true });
    w.db.request("eval_import_requested");
    // The pad ids are gone from the mailbox (404): skipped, so the import still finishes.
    for (let i = 0; i < 20 && !w.db.events.some((e) => e.kind === "eval_import_finished"); i++) await w.run();
    expect(w.db.events.find((e) => e.kind === "eval_import_batch")!.detail.capped).toBe(true);
    expect(w.db.events.find((e) => e.kind === "eval_import_finished")!.detail).toMatchObject({ stored_inbound: 1, capped: true });
  });

  it("a failed get is tried again on the next run", async () => {
    const m = mail("a", "t1", "p0@example.com", 30);
    const w = world({ inbound: [m] });
    let down = true;
    const gmail: GmailPort = { ...w.gmail, get: async (t, id) => { if (down) throw new GmailError("Gmail returned 500", 500); return w.gmail.get(t, id); } };
    w.db.request("eval_import_requested");
    const deps = { store: w.db.store, gmail, directory: async () => family(1), now: () => new Date(NOW), settings: w.db.settings };
    expect(await runHistoryImport(deps)).toMatchObject({ storedInbound: 0, skipped: 0, finished: false });
    down = false;
    expect(await runHistoryImport(deps)).toMatchObject({ storedInbound: 1, finished: true });
  });

  it("a directory failure stores nothing and reports a short error", async () => {
    const w = world({ inbound: [mail("a", "t1", "p0@example.com", 30)] });
    w.db.request("eval_import_requested");
    const out = await runHistoryImport({ store: w.db.store, gmail: w.gmail, directory: async () => { throw new Error("down"); }, now: () => new Date(NOW), settings: w.db.settings });
    expect(out.error).toBe("Could not read the family directory");
    expect(w.db.messages.size).toBe(0);
  });
});
