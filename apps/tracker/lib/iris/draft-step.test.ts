import { describe, expect, it } from "vitest";
import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import type { DraftAnswer, DraftPort } from "./draft";
import { runDraft, type DraftStepDeps } from "./draft-step";
import { POLICY_VERSION, SIGNATURE } from "./policy";
import type { MessageInsert, MessagePatch } from "./store";
import { fakeIrisStore } from "./store.fake";

// REQ-44 AC2, AC4 to AC7: the draft step of one run, with a fake store and a fake model.
const MAYA = "11111111-1111-4111-8111-111111111111";
const LEO = "22222222-2222-4222-8222-222222222222";
const SAM = "33333333-3333-4333-8333-333333333333";
const FAMILIES: FamilyEntry[] = [
  { studentId: MAYA, studentName: "Maya Lee", stage: "Active", parentEmail: "ann@x.com", parentName: "Ann Lee" },
  { studentId: LEO, studentName: "Leo Lee", stage: "Active", parentEmail: "ann@x.com", parentName: "Ann Lee" },
  { studentId: SAM, studentName: "Sam Park", stage: "Active", parentEmail: "pat@y.com", parentName: "Pat Park" },
];
const T0 = Date.parse("2026-10-21T12:00:00Z");
const CLEAN = "Hi Pat,\n\nThanks for letting me know. I hope Sam feels better.";
const good = (o: Partial<{ body: string; needsCharlie: boolean; reason: string }> = {}): DraftAnswer => ({
  ok: true, model: "m", inputTokens: 400, outputTokens: 90, output: { body: CLEAN, needsCharlie: false, reason: "THE MODEL REASON MUST NOT BE STORED", ...o },
});
const bad = (error = "The AI is busy.", aborted = false): DraftAnswer => ({ ok: false, outcome: "error", error, model: null, aborted });

type Msg = MessageInsert & Partial<MessagePatch>;
function world() {
  const db = fakeIrisStore();
  const prompts: { system: string; user: string }[] = [];
  let reply: () => DraftAnswer = () => good();
  const port: DraftPort = async (prompt) => (prompts.push(prompt), reply());
  let clock = T0;
  const deps = (o: Partial<DraftStepDeps> = {}): DraftStepDeps => ({ store: db.store, draft: port, directory: async () => FAMILIES, now: () => new Date(clock), startedAtMs: T0, ...o });
  let n = 0;
  const add = async (o: Partial<Msg> & { students?: string[] } = {}) => {
    const thread = await db.store.saveThread(`t${++n}`, { matchState: "matched", notionStudentIds: o.students ?? [SAM], parentEmail: "pat@y.com", subject: "s", firstReceivedAt: "x", lastInboundAt: "x", purgeAt: "2027-01-01T00:00:00Z" });
    const r = await db.store.insertMessage({
      threadId: thread.id, gmailMessageId: `g${++n}`, rfcMessageId: null, direction: "inbound", source: "external", fromEmail: "pat@y.com", fromName: null,
      receivedAt: new Date(T0 - 3600_000 + n * 1000).toISOString(), bodyText: "Sam is sick today.", bodyTruncated: false, snippet: "snip",
      state: "classified", stateChangedAt: null, escalationReason: null, policyVersion: POLICY_VERSION, handledAt: null, retryCount: 0, lastError: null, purgeAt: "2027-01-01T00:00:00Z",
    });
    await db.store.updateMessage(r.id!, { intent: "cancellation", notionStudentId: SAM, ...o });
    return r.id!;
  };
  return {
    db, prompts, deps, add,
    setReply: (f: typeof reply) => (reply = f),
    setClock: (ms: number) => (clock = ms),
    msg: (id: string) => db.messages.get(id)!,
    draftsOf: (id: string) => [...db.drafts.values()].filter((d) => d.messageId === id),
    eventsOf: (id: string) => db.events.filter((e) => e.messageId === id),
  };
}

describe("runDraft: a clean draft (AC2)", () => {
  it("stores version 1 proposed by iris, moves the message to drafted, one ai_call and one drafted event", async () => {
    const w = world();
    const id = await w.add();
    const out = await runDraft(w.deps());
    expect(out).toEqual({ result: "ok", drafted: 1, escalated: 0, failed: 0, error: null });
    const [d] = w.draftsOf(id);
    expect(d).toMatchObject({ version: 1, state: "proposed", createdBy: "iris", edited: false, replyType: "cancellation", policyVersion: POLICY_VERSION, bodyText: CLEAN });
    expect(d.bodyText).not.toContain(SIGNATURE);
    expect(w.msg(id)).toMatchObject({ state: "drafted", stateChangedAt: new Date(T0).toISOString() });
    expect(w.db.aiCalls).toEqual([{ messageId: id, purpose: "draft", model: "m", inputTokens: 400, outputTokens: 90, policyVersion: POLICY_VERSION, outcome: "ok", error: null }]);
    expect(w.eventsOf(id)).toEqual([{ kind: "drafted", messageId: id, draftId: d.id, detail: { state: "drafted", reason: null, reply_type: "cancellation", version: 1 } }]);
    expect(JSON.stringify([...w.db.messages.values(), ...w.db.events, ...w.db.drafts.values()])).not.toContain("MODEL REASON");
  });

  it("the prompt names the chosen child of a sibling family", async () => {
    const w = world();
    await w.add({ students: [MAYA, LEO], notionStudentId: LEO });
    await runDraft(w.deps());
    expect(w.prompts[0].user).toContain("Parent first name: Ann");
    expect(w.prompts[0].user).toContain("Child first name: Leo");
  });
});

describe("runDraft: rules, needs_charlie and escalations (AC4 to AC6)", () => {
  it("a rule-breaking body stores no draft and escalates draft_rule with the rule codes", async () => {
    const w = world();
    const id = await w.add();
    w.setReply(() => good({ body: "That class at 5 pm is forfeited and costs $40." }));
    const out = await runDraft(w.deps());
    expect(out).toMatchObject({ drafted: 0, escalated: 1 });
    expect(w.draftsOf(id)).toEqual([]);
    expect(w.msg(id)).toMatchObject({ state: "escalated", escalationReason: "draft_rule", handledAt: null });
    expect(w.eventsOf(id)[0].detail).toEqual({ state: "escalated", reason: "draft_rule", rules: ["money", "time", "forfeit"] });
  });

  it("needs_charlie stores the draft and escalates needs_charlie, unhandled", async () => {
    const w = world();
    const id = await w.add();
    w.setReply(() => good({ needsCharlie: true }));
    await runDraft(w.deps());
    expect(w.draftsOf(id)).toHaveLength(1);
    expect(w.msg(id)).toMatchObject({ state: "escalated", escalationReason: "needs_charlie", handledAt: null });
  });

  it("an unhandled no-show escalation gets a draft and stays escalated escalate_only", async () => {
    const w = world();
    const id = await w.add({ state: "escalated", escalationReason: "escalate_only", intent: "no_show" });
    await runDraft(w.deps());
    expect(w.draftsOf(id)).toHaveLength(1);
    expect(w.msg(id)).toMatchObject({ state: "escalated", escalationReason: "escalate_only" });
    // A second run does not draft it again.
    await runDraft(w.deps());
    expect(w.draftsOf(id)).toHaveLength(1);
    expect(w.prompts).toHaveLength(1);
  });

  it.each([
    ["flagged", "cancellation"], ["multi_intent", "cancellation"], ["low_confidence", "general_question"], ["ambiguous_student", "cancellation"],
    ["escalate_only", "billing_question"], ["escalate_only", "refund_request"], ["escalate_only", "other"], ["unknown_sender", null], ["automated", null],
  ])("an escalation (%s, %s) gets no draft and no call", async (reason, intent) => {
    const w = world();
    await w.add({ state: "escalated", escalationReason: reason, intent });
    await runDraft(w.deps());
    expect(w.prompts).toHaveLength(0);
    expect(w.db.drafts.size).toBe(0);
  });

  it("a handled no-show gets no draft", async () => {
    const w = world();
    await w.add({ state: "escalated", escalationReason: "escalate_only", intent: "no_show", handledAt: new Date(T0).toISOString() });
    await runDraft(w.deps());
    expect(w.prompts).toHaveLength(0);
  });
});

describe("runDraft: failures, caps and budget (AC7)", () => {
  it("a failure adds 1 to retry_count with a short error; the third sets failed with an event", async () => {
    const w = world();
    const id = await w.add();
    w.setReply(() => bad());
    await runDraft(w.deps());
    expect(w.msg(id)).toMatchObject({ state: "classified", retryCount: 1, lastError: "The AI is busy." });
    await runDraft(w.deps());
    const out = await runDraft(w.deps());
    expect(out.failed).toBe(1);
    expect(w.msg(id)).toMatchObject({ state: "failed", retryCount: 3 });
    expect(w.eventsOf(id).map((e) => e.detail)).toEqual([{ state: "failed", reason: "draft_failed" }]);
    expect(w.draftsOf(id)).toEqual([]);
    expect(w.db.aiCalls.every((c) => c.outcome === "error" && (c.error ?? "").length <= 300)).toBe(true);
  });

  it("a failing no-show stays escalated in Needs you", async () => {
    const w = world();
    const id = await w.add({ state: "escalated", escalationReason: "escalate_only", intent: "no_show" });
    w.setReply(() => bad());
    for (let i = 0; i < 3; i++) await runDraft(w.deps());
    expect(w.msg(id)).toMatchObject({ state: "escalated", retryCount: 3 });
  });

  it("an abort keeps the retry count", async () => {
    const w = world();
    const id = await w.add();
    w.setReply(() => bad("Stopped at the run's time limit.", true));
    await runDraft(w.deps());
    expect(w.msg(id).retryCount).toBe(0);
  });

  it("no port makes zero calls and reads nothing", async () => {
    const w = world();
    await w.add();
    expect(await runDraft(w.deps({ draft: null }))).toEqual({ result: "ok", drafted: 0, escalated: 0, failed: 0, error: null });
    expect(w.db.calls).not.toContain("listDraftable");
  });

  it("starts at most irisMaxDraftPerRun calls, oldest first", async () => {
    const w = world();
    const ids: string[] = [];
    for (let i = 0; i < TUNING.irisMaxDraftPerRun + 2; i++) ids.push(await w.add());
    await runDraft(w.deps());
    expect(w.prompts).toHaveLength(TUNING.irisMaxDraftPerRun);
    expect(ids.slice(0, TUNING.irisMaxDraftPerRun).every((id) => w.msg(id).state === "drafted")).toBe(true);
    expect(ids.slice(TUNING.irisMaxDraftPerRun).every((id) => w.msg(id).state === "classified")).toBe(true);
  });

  it("starts no call after the draft budget", async () => {
    const w = world();
    await w.add();
    w.setClock(T0 + TUNING.irisDraftBudgetMs);
    await runDraft(w.deps());
    expect(w.prompts).toHaveLength(0);
  });

  it("a store error ends the step with a short error and never throws", async () => {
    const w = world();
    await w.add();
    w.db.fail.add("insertDraft");
    expect(await runDraft(w.deps())).toMatchObject({ result: "failed", error: "Iris run failed" });
  });
});
