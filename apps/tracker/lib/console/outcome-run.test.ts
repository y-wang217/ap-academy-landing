import { describe, expect, it } from "vitest";
import { fakeLeadWriter } from "../notion/lead-writer.fake";
import { fakeOutcomeStore } from "./outcome-store.fake";
import { OUTCOME_MESSAGES, runOutcome, type OutcomeBody } from "./outcome-run";
import type { LeadSnapshot } from "./outcomes";

// REQ-61 AC6 to AC10: the outcome run over a fake Notion and a fake transition log.
const PAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const REQ = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
const REQ2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002";
const STAFF = "cccccccc-cccc-4ccc-8ccc-cccccccc0001";
const EDITED = "2026-10-26T13:00:00.000Z";

function setup(lead: Partial<LeadSnapshot> = {}) {
  const clock = { now: new Date("2026-10-26T14:00:00.000Z") };
  const tick = (seconds: number) => (clock.now = new Date(clock.now.getTime() + seconds * 1000));
  const notion = fakeLeadWriter({ id: PAGE, stage: "Working", attempts: 1, lastEditedAt: EDITED, ...lead }, () => clock.now);
  const log = fakeOutcomeStore(() => clock.now);
  const body = (over: Partial<OutcomeBody> = {}): OutcomeBody => ({
    requestId: REQ, pageId: PAGE, outcome: "no_answer", expected: { stage: lead.stage ?? "Working", attempts: lead.attempts ?? 1, lastEditedAt: EDITED }, note: "Left a voicemail", ...over,
  });
  const run = (b: OutcomeBody = body()) => runOutcome({ body: b, store: log.store, writer: notion.writer, staffId: STAFF, now: () => clock.now });
  return { notion, log, body, run, tick, clock };
}

describe("runOutcome: the happy path (AC9, AC10)", () => {
  it("one PATCH, one Touch, a read-back, then done with the read-back values", async () => {
    const s = setup();
    const r = await s.run();
    expect(r).toMatchObject({ kind: "done", cadenceUsedUp: false, staffLinked: true, result: { stage: "Working", attempts: 2, nextActionDue: "2026-10-26T15:00:00-04:00" } });
    expect(s.notion.count("patch")).toBe(1);
    expect(s.notion.count("create")).toBe(1);
    expect(s.notion.lead.lastTxn).toBe(REQ);
    expect(s.notion.touches).toHaveLength(1);
    expect(s.notion.touches[0].input).toMatchObject({ studentId: PAGE, staffId: STAFF, type: "Call", outcome: "No answer", note: "Left a voicemail", requestId: REQ });
    const row = s.log.rows.get(REQ)!;
    expect(row.state).toBe("done");
    expect(s.log.rows.size).toBe(1);
    expect(s.log.audits).toEqual([{ pageId: PAGE, state: "done" }]);
    expect(JSON.stringify(row)).not.toContain("Left a voicemail");
    expect(row.touch).toMatchObject({ noteChars: 16, noteSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("the touch is written without Staff when the owner has no staff link, and says so", async () => {
    const s = setup();
    const r = await runOutcome({ body: s.body(), store: s.log.store, writer: s.notion.writer, staffId: null, now: () => s.clock.now });
    expect(r).toMatchObject({ kind: "done", staffLinked: false });
    expect(s.notion.touches[0].input.staffId).toBeNull();
  });

  it("the fourth no answer reports the cadence used up", async () => {
    const s = setup({ attempts: 3 });
    expect(await s.run()).toMatchObject({ kind: "done", cadenceUsedUp: true, result: { nextAction: "Text", attempts: 4 } });
  });
});

describe("runOutcome: refusals write nothing (AC6, AC13, AC2)", () => {
  for (const [what, expected] of [
    ["Stage", { stage: "New", attempts: 1, lastEditedAt: EDITED }],
    ["Attempts", { stage: "Working", attempts: 0, lastEditedAt: EDITED }],
    ["last_edited_time", { stage: "Working", attempts: 1, lastEditedAt: "2026-10-26T12:59:00.000Z" }],
  ] as const) {
    it(`stale on ${what}: no write, no row`, async () => {
      const s = setup();
      const r = await s.run(s.body({ expected }));
      expect(r).toEqual({ kind: "stale", current: { stage: "Working", attempts: 1, lastEditedAt: EDITED } });
      expect(s.notion.count("patch") + s.notion.count("create")).toBe(0);
      expect(s.log.rows.size).toBe(0);
    });
  }

  it("not ready: no Notion call beyond the check, no row", async () => {
    const s = setup();
    s.notion.state.missing = ["Txn ID", "Last Txn"];
    expect(await s.run()).toEqual({ kind: "notion_not_ready", missing: ["Txn ID", "Last Txn"] });
    expect(s.notion.log).toEqual([]);
    expect(s.log.calls).toEqual([]);
  });

  it("contract missing and disallowed: no write, no row", async () => {
    const s = setup({ trialTime: "2026-10-29T20:00:00.000Z", present: { ...fakeLeadWriter({ id: PAGE }).lead.present, "Sales Notes": false } });
    expect(await s.run(s.body({ outcome: "trial_booked" }))).toMatchObject({ kind: "contract_missing", missing: ["Sales Notes"], notionUrl: `https://www.notion.so/${PAGE.replaceAll("-", "")}` });
    expect(await s.run(s.body({ outcome: "won" }))).toMatchObject({ kind: "disallowed" });
    expect(await s.run(s.body({ outcome: "call_back", due: "2026-10-01T10:00:00.000Z" }))).toMatchObject({ kind: "bad_form" });
    expect(s.notion.count("patch") + s.notion.count("create")).toBe(0);
    expect(s.log.rows.size).toBe(0);
  });
});

describe("runOutcome: idempotency (AC7)", () => {
  it("a second submit with the same request id returns the stored result, writing nothing", async () => {
    const s = setup();
    const first = await s.run();
    const second = await s.run();
    expect(second).toEqual(first);
    expect(s.notion.count("patch")).toBe(1);
    expect(s.notion.count("create")).toBe(1);
    expect(s.log.rows.size).toBe(1);
  });

  it("two submits at once: one patch, one touch, one row; the other is in progress", async () => {
    const s = setup();
    const [a, b] = await Promise.all([s.run(), s.run()]);
    expect([a.kind, b.kind].sort()).toEqual(["done", "in_progress"]);
    expect(s.notion.count("patch")).toBe(1);
    expect(s.notion.count("create")).toBe(1);
    expect(s.log.rows.size).toBe(1);
  });

  it("a running row with a live lease is in progress", async () => {
    const s = setup();
    s.notion.faults.find = ["timeout-before"];
    await s.run();
    // Put it back to running with a live lease, as if another request held it.
    const row = s.log.rows.get(REQ)!;
    Object.assign(row, { state: "running", leaseUntil: new Date(s.clock.now.getTime() + 30_000).toISOString() });
    expect(await s.run()).toEqual({ kind: "in_progress" });
  });

  it("reusing a request id with a different note, outcome, page or form is refused", async () => {
    const s = setup();
    await s.run();
    expect(await s.run(s.body({ note: "Something else" }))).toEqual({ kind: "request_id_reused" });
    expect(await s.run(s.body({ outcome: "wrong_number" }))).toEqual({ kind: "request_id_reused" });
    expect(await s.run(s.body({ pageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002" }))).toEqual({ kind: "request_id_reused" });
    expect(await s.run(s.body({ due: "2026-10-27T18:00:00.000Z" }))).toEqual({ kind: "request_id_reused" });
    expect(s.notion.count("patch")).toBe(1);
  });

  it("an open transition blocks a new request id for the same lead", async () => {
    const s = setup();
    s.notion.faults.patch = ["timeout-after"];
    expect(await s.run()).toMatchObject({ kind: "uncertain" });
    expect(await s.run(s.body({ requestId: REQ2 }))).toEqual({ kind: "unresolved_transition", openRequestId: REQ });
    expect(s.notion.count("patch")).toBe(1);
  });
});

describe("runOutcome: uncertain writes and read-back recovery (AC8, AC9)", () => {
  it("a PATCH that committed then timed out is uncertain; the retry sends no second PATCH", async () => {
    const s = setup();
    s.notion.faults.patch = ["timeout-after"];
    expect(await s.run()).toEqual({ kind: "uncertain", message: OUTCOME_MESSAGES.uncertain, retryAfterSeconds: null });
    expect(s.log.rows.get(REQ)!.state).toBe("uncertain");
    expect(await s.run()).toMatchObject({ kind: "done", result: { attempts: 2 } });
    expect(s.notion.count("patch")).toBe(1);
    expect(s.notion.count("create")).toBe(1);
    expect(s.log.audits.map((a) => a.state)).toEqual(["uncertain", "done"]);
  });

  it("a PATCH that timed out before landing is sent again with the same absolute values", async () => {
    const s = setup();
    s.notion.faults.patch = ["timeout-before", "500"];
    expect(await s.run()).toMatchObject({ kind: "uncertain" });
    expect(await s.run()).toMatchObject({ kind: "uncertain" });
    expect(await s.run()).toMatchObject({ kind: "done", result: { attempts: 2 } });
    const sent = s.notion.log.filter((l) => l.op === "patch").map((l) => l.detail);
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((p) => JSON.stringify(p))).size).toBe(1);
    expect((sent[0] as { attempts: number }).attempts).toBe(2);
  });

  it("a create that timed out before landing waits out the settle window, then creates once", async () => {
    const s = setup();
    s.notion.faults.create = ["timeout-before"];
    expect(await s.run()).toMatchObject({ kind: "uncertain" });
    s.tick(20);
    expect(await s.run()).toEqual({ kind: "uncertain", message: OUTCOME_MESSAGES.settling, retryAfterSeconds: 40 });
    expect(s.notion.count("create")).toBe(1);
    s.tick(41);
    expect(await s.run()).toMatchObject({ kind: "done" });
    expect(s.notion.count("create")).toBe(2);
    expect(s.notion.touches).toHaveLength(1);
  });

  it("a create that landed then timed out is found on the retry and never sent again", async () => {
    const s = setup();
    s.notion.faults.create = ["timeout-after"];
    s.notion.state.queryLag = 30_000;
    expect(await s.run()).toMatchObject({ kind: "uncertain" });
    s.tick(10);
    expect(await s.run()).toMatchObject({ kind: "uncertain", retryAfterSeconds: 50 });
    s.tick(25);
    expect(await s.run()).toMatchObject({ kind: "done" });
    expect(s.notion.count("create")).toBe(1);
    expect(s.notion.touches).toHaveLength(1);
  });

  it("two touches with the request id stay uncertain and nothing is deleted", async () => {
    const s = setup();
    s.notion.faults.find = ["timeout-before"];
    await s.run();
    await s.notion.writer.createTouch({ studentId: PAGE, staffId: null, type: "Call", outcome: "No answer", title: "x", note: "", requestId: REQ });
    await s.notion.writer.createTouch({ studentId: PAGE, staffId: null, type: "Call", outcome: "No answer", title: "x", note: "", requestId: REQ });
    expect(await s.run()).toEqual({ kind: "uncertain", message: OUTCOME_MESSAGES.duplicates, retryAfterSeconds: null });
    expect(s.notion.touches).toHaveLength(2);
  });

  it("a read-back that differs is never done", async () => {
    const s = setup();
    s.notion.state.readBackOverride = { attempts: 7 };
    // The first read is the pre-check: let it through, then differ.
    const r = await runOutcome({
      body: s.body({ expected: { stage: "Working", attempts: 7, lastEditedAt: EDITED } }), store: s.log.store, writer: s.notion.writer, staffId: STAFF, now: () => s.clock.now,
    });
    expect(r).toEqual({ kind: "uncertain", message: OUTCOME_MESSAGES.mismatch, retryAfterSeconds: null });
    expect(s.log.rows.get(REQ)!.state).toBe("uncertain");
  });

  it("the page edited in Notion between the first try and the retry stops uncertain", async () => {
    const s = setup();
    s.notion.faults.patch = ["timeout-before"];
    await s.run();
    s.notion.lead.lastEditedAt = "2026-10-26T14:30:00.000Z";
    expect(await s.run()).toEqual({ kind: "uncertain", message: OUTCOME_MESSAGES.changed, retryAfterSeconds: null });
    expect(s.notion.count("patch")).toBe(1);
  });

  it("a 400 on the first PATCH is failed, and stays failed on a resubmit", async () => {
    const s = setup();
    s.notion.faults.patch = ["400"];
    expect(await s.run()).toEqual({ kind: "failed", message: OUTCOME_MESSAGES.failed });
    expect(s.log.rows.get(REQ)!.state).toBe("failed");
    expect(await s.run()).toEqual({ kind: "failed", message: OUTCOME_MESSAGES.failed });
    expect(s.notion.count("patch")).toBe(1);
    expect(s.notion.count("create")).toBe(0);
    expect(s.log.audits).toEqual([{ pageId: PAGE, state: "failed" }]);
  });

  it("a 400 on the create after the patch landed is uncertain, never failed", async () => {
    const s = setup();
    s.notion.faults.create = ["400"];
    expect(await s.run()).toMatchObject({ kind: "uncertain" });
    expect(s.log.rows.get(REQ)!.state).toBe("uncertain");
  });
});
