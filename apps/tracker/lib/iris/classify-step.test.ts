import { describe, expect, it } from "vitest";
import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import type { ClassifyAnswer, ClassifyPort } from "./classify";
import { runClassify, type ClassifyStepDeps } from "./classify-step";
import { POLICY_VERSION, type ClassifierIntent, type Flag } from "./policy";
import type { MessageInsert } from "./store";
import { fakeIrisStore } from "./store.fake";

// REQ-43 AC1, AC3, AC5 to AC9, AC11, AC13: the classify step of one run, with a fake store and a fake model.
const MAYA = "11111111-1111-4111-8111-111111111111";
const LEO = "22222222-2222-4222-8222-222222222222";
const SAM = "33333333-3333-4333-8333-333333333333";
const FAMILIES: FamilyEntry[] = [
  { studentId: MAYA, studentName: "Maya Lee", stage: "Active", parentEmail: "ann@x.com", parentName: "Ann Lee" },
  { studentId: LEO, studentName: "Leo Lee", stage: "Active", parentEmail: "ann@x.com", parentName: "Ann Lee" },
  { studentId: SAM, studentName: "Sam Park", stage: "Active", parentEmail: "pat@y.com", parentName: "Pat Park" },
];
const T0 = Date.parse("2026-10-21T12:00:00Z");

type Reply = Partial<{ intents: ClassifierIntent[]; primary: ClassifierIntent; confidence: number; flags: Flag[]; childName: string }>;
const good = (o: Reply = {}): ClassifyAnswer => ({
  ok: true, model: "m", inputTokens: 100, outputTokens: 20,
  output: { intents: [o.primary ?? "general_question"], primary: "general_question", confidence: 0.95, flags: [], childName: "", summary: "A SUMMARY THAT MUST NOT BE STORED", ...o },
});

function world(opts: { threshold?: number } = {}) {
  const db = fakeIrisStore({ confidenceThreshold: opts.threshold ?? 0.85 });
  const prompts: { system: string; user: string }[] = [];
  let reply: (user: string) => ClassifyAnswer = () => good();
  const port: ClassifyPort = async (prompt) => (prompts.push(prompt), reply(prompt.user));
  let directory: () => Promise<FamilyEntry[]> = async () => FAMILIES;
  let clock = T0;
  const deps = (o: Partial<ClassifyStepDeps> = {}): ClassifyStepDeps => ({
    store: db.store, classify: port, directory: () => directory(), settings: db.settings, now: () => new Date(clock), startedAtMs: T0, ...o,
  });
  let n = 0;
  const add = async (o: { students?: string[]; body?: string; state?: MessageInsert["state"]; retryCount?: number; at?: number; thread?: string } = {}) => {
    const gid = o.thread ?? `t${++n}`;
    const thread = await db.store.saveThread(gid, { matchState: "matched", notionStudentIds: o.students ?? [SAM], parentEmail: "pat@y.com", subject: "s", firstReceivedAt: "x", lastInboundAt: "x", purgeAt: "2027-01-01T00:00:00Z" });
    const r = await db.store.insertMessage({
      threadId: thread.id, gmailMessageId: `g${++n}`, rfcMessageId: null, direction: "inbound", source: "external", fromEmail: "pat@y.com", fromName: null,
      receivedAt: new Date(o.at ?? T0 - 3600_000 + n * 1000).toISOString(), bodyText: o.body ?? "Can we talk about Tuesday?", bodyTruncated: false, snippet: "snip",
      state: o.state ?? "matched", stateChangedAt: null, escalationReason: null, policyVersion: POLICY_VERSION, handledAt: null, retryCount: o.retryCount ?? 0, lastError: null, purgeAt: "2027-01-01T00:00:00Z",
    });
    return r.id!;
  };
  return {
    db, prompts, deps, add,
    setReply: (f: typeof reply) => (reply = f),
    setDirectory: (d: typeof directory) => (directory = d),
    setClock: (ms: number) => (clock = ms),
    msg: (id: string) => db.messages.get(id)!,
    eventsOf: (id: string) => db.events.filter((e) => e.messageId === id),
    needsYou: () => [...db.messages.values()].filter((m) => m.state === "escalated" && m.handledAt === null),
  };
}

describe("runClassify: routing stored on the message", () => {
  it("a sensitive message escalates flagged, with no draft port and no draft row (AC1)", async () => {
    const w = world();
    const id = await w.add({ body: "I was charged twice for October." });
    const out = await runClassify(w.deps());
    expect(out).toMatchObject({ classified: 0, escalated: 1, failed: 0, result: "ok" });
    expect(w.msg(id)).toMatchObject({ state: "escalated", escalationReason: "flagged", flags: ["money_dispute"] });
    expect(Object.keys(w.deps())).not.toContain("draft");
    expect(w.db.calls.some((c) => /draft/i.test(c))).toBe(false);
  });

  it("the threshold is read from the settings row, not a constant (AC3)", async () => {
    const w = world({ threshold: 0.9 });
    const id = await w.add();
    w.setReply(() => good({ confidence: 0.85 }));
    await runClassify(w.deps());
    expect(w.msg(id)).toMatchObject({ state: "escalated", escalationReason: "low_confidence", confidence: 0.85 });
  });

  it("no_reply_needed is handled at the injected now and never shows in Needs you (AC5)", async () => {
    const w = world();
    const id = await w.add({ body: "Thanks so much!" });
    w.setReply(() => good({ primary: "no_reply_needed", intents: ["no_reply_needed"], confidence: 0.9 }));
    await runClassify(w.deps());
    expect(w.msg(id)).toMatchObject({ state: "escalated", escalationReason: "no_reply_needed", handledAt: new Date(T0).toISOString() });
    expect(w.needsYou().map((m) => m.id)).not.toContain(id);
    expect(w.eventsOf(id).map((e) => e.kind)).toEqual(["handled"]);
  });

  it("a sibling family naming Maya is classified and the event carries Maya's page id (AC6)", async () => {
    const w = world();
    const id = await w.add({ students: [MAYA, LEO], body: "Maya is sick today." });
    w.setReply(() => good({ primary: "cancellation", intents: ["cancellation"], childName: "maya" }));
    await runClassify(w.deps());
    expect(w.msg(id).state).toBe("classified");
    expect(w.eventsOf(id)).toEqual([{ kind: "classified", messageId: id, detail: expect.objectContaining({ state: "classified", notion_student_id: MAYA }) }]);
  });

  it("everything else is classified with intent, confidence, flags and the policy version, one event each (AC7)", async () => {
    const w = world();
    const a = await w.add();
    const b = await w.add();
    const out = await runClassify(w.deps());
    expect(out.classified).toBe(2);
    for (const id of [a, b]) {
      expect(w.msg(id)).toMatchObject({ state: "classified", intent: "general_question", confidence: 0.95, flags: [], policyVersion: POLICY_VERSION, escalationReason: null, stateChangedAt: new Date(T0).toISOString() });
      expect(w.eventsOf(id)).toHaveLength(1);
    }
  });

  it("rounds confidence to the stored two decimals before routing", async () => {
    const w = world();
    const id = await w.add();
    w.setReply(() => good({ confidence: 0.849 }));
    await runClassify(w.deps());
    expect(w.msg(id)).toMatchObject({ confidence: 0.85, state: "classified" });
  });
});

describe("runClassify: the ai_calls record (AC9) and no text stored (AC10)", () => {
  it("writes exactly one ai_calls row per call, with no text field", async () => {
    const w = world();
    const ok = await w.add({ body: "A plain note." });
    await w.add({ body: "REFUSE this one." });
    w.setReply((user) => (user.includes("REFUSE") ? { ok: false, outcome: "refused", error: "The AI declined this message.", model: "m", aborted: false } : good()));
    await runClassify(w.deps());
    expect(w.db.aiCalls).toHaveLength(2);
    expect(w.db.aiCalls.find((c) => c.messageId === ok)).toEqual({ messageId: ok, purpose: "classify", model: "m", inputTokens: 100, outputTokens: 20, policyVersion: POLICY_VERSION, outcome: "ok", error: null });
    for (const c of w.db.aiCalls) expect(Object.keys(c).sort()).toEqual(["error", "inputTokens", "messageId", "model", "outcome", "outputTokens", "policyVersion", "purpose"]);
    const everything = JSON.stringify({ m: [...w.db.messages.values()], e: w.db.events, a: w.db.aiCalls });
    expect(everything).not.toContain("A SUMMARY THAT MUST NOT BE STORED");
    expect(everything).not.toContain(w.prompts[0].system.slice(0, 60));
  });

  it("never stores the child_name string", async () => {
    const w = world();
    await w.add({ students: [MAYA, LEO] });
    w.setReply(() => good({ primary: "cancellation", intents: ["cancellation"], childName: "Maya" }));
    await runClassify(w.deps());
    expect(JSON.stringify({ e: w.db.events, a: w.db.aiCalls })).not.toMatch(/maya/i);
  });
});

describe("runClassify: failures (AC8)", () => {
  it("a refusal three runs in a row ends failed with one failed event", async () => {
    const w = world();
    const id = await w.add();
    w.setReply(() => ({ ok: false, outcome: "refused", error: "The AI declined this message.", model: "m", aborted: false }));
    await runClassify(w.deps());
    expect(w.msg(id)).toMatchObject({ state: "matched", retryCount: 1, lastError: "The AI declined this message." });
    await runClassify(w.deps());
    expect(w.msg(id)).toMatchObject({ state: "matched", retryCount: 2 });
    const out = await runClassify(w.deps());
    expect(out.failed).toBe(1);
    expect(w.msg(id)).toMatchObject({ state: "failed", retryCount: 3 });
    expect(w.eventsOf(id).map((e) => e.kind)).toEqual(["failed"]);
    expect(await runClassify(w.deps())).toMatchObject({ classified: 0, failed: 0 });
    expect(w.db.aiCalls).toHaveLength(3);
  });

  it("a directory failure skips the step and spends no retry", async () => {
    const w = world();
    const id = await w.add();
    w.setDirectory(async () => { throw new Error("down"); });
    const out = await runClassify(w.deps());
    expect(out).toMatchObject({ classified: 0, result: "ok" });
    expect(out.error).not.toBeNull();
    expect(w.prompts).toHaveLength(0);
    expect(w.msg(id)).toMatchObject({ state: "matched", retryCount: 0 });
  });

  it("a store failure ends the step as a failed run and never throws", async () => {
    const w = world();
    await w.add();
    w.db.fail.add("insertAiCall");
    expect(await runClassify(w.deps())).toMatchObject({ result: "failed", error: "Iris run failed" });
  });
});

describe("runClassify: AI not set up (AC11)", () => {
  it("a null port makes zero calls, reads nothing and leaves retry_count alone", async () => {
    const w = world();
    const id = await w.add();
    const before = w.db.calls.length;
    const out = await runClassify(w.deps({ classify: null }));
    expect(out).toMatchObject({ classified: 0, escalated: 0, failed: 0, result: "ok", error: null });
    expect(w.db.calls.length).toBe(before);
    expect(w.msg(id)).toMatchObject({ state: "matched", retryCount: 0 });
  });
});

describe("runClassify: cap and budget (AC13)", () => {
  it("classifies at most 10, oldest first", async () => {
    const w = world();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await w.add({ at: T0 - 100_000 + i * 1000 }));
    const out = await runClassify(w.deps());
    expect(TUNING.irisMaxClassifyPerRun).toBe(10);
    expect(out.classified).toBe(10);
    expect(ids.slice(0, 10).every((id) => w.msg(id).state === "classified")).toBe(true);
    expect(ids.slice(10).every((id) => w.msg(id).state === "matched")).toBe(true);
  });

  it("starts no call after the 35 s budget and keeps the cut-off message's retry_count", async () => {
    const w = world();
    const id = await w.add({ retryCount: 1 });
    expect(TUNING.irisClassifyBudgetMs).toBe(35_000);
    w.setClock(T0 + 35_000);
    const out = await runClassify(w.deps());
    expect(out.classified).toBe(0);
    expect(w.prompts).toHaveLength(0);
    expect(w.msg(id)).toMatchObject({ state: "matched", retryCount: 1 });
  });

  it("an aborted call keeps the retry_count and the state", async () => {
    const w = world();
    const id = await w.add();
    w.setReply(() => ({ ok: false, outcome: "error", error: "stopped", model: null, aborted: true }));
    await runClassify(w.deps());
    expect(w.msg(id)).toMatchObject({ state: "matched", retryCount: 0 });
  });
});

describe("runClassify: what the prompt is built from (AC12)", () => {
  it("uses first names from the directory and earlier thread lines only", async () => {
    const w = world();
    await w.add({ thread: "same", students: [MAYA, LEO], body: "first", at: T0 - 50_000 });
    const second = await w.add({ thread: "same", students: [MAYA, LEO], body: "Can Maya Lee come later?", at: T0 - 40_000 });
    w.db.messages.get([...w.db.messages.keys()][0])!.state = "classified";
    await runClassify(w.deps());
    const p = w.prompts.find((x) => x.user.includes("come later"))!;
    expect(p.user).toContain("Parent first name: Ann");
    expect(p.user).toContain("Children: Maya, Leo");
    expect(p.user).toMatch(/^- \d{4}-\d{2}-\d{2}, parent, -, snip$/m);
    expect(p.user).not.toMatch(/\bLee\b/);
    expect(w.msg(second).state).toBe("classified");
  });
});
