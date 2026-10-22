import { describe, expect, it } from "vitest";
import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import type { ClassifyAnswer, ClassifyPort } from "./classify";
import { prepareClassifyPrompt } from "./classify-step";
import type { DraftAnswer, DraftPort } from "./draft";
import { prepareDraftPrompt } from "./draft-step";
import { runEval, type EvalStepDeps } from "./eval-step";
import { POLICY_VERSION } from "./policy";
import { fakeIrisStore } from "./store.fake";

// REQ-45 AC6: the eval step of one run, with a fake store and fake models.
const SAM = "33333333-3333-4333-8333-333333333333";
const FAMILIES: FamilyEntry[] = [{ studentId: SAM, studentName: "Sam Park", stage: "Active", parentEmail: "pat@y.com", parentName: "Pat Park" }];
const T0 = Date.parse("2026-10-22T12:00:00Z");
const MODEL = "claude-test";

const classified = (primary: "cancellation" | "billing_question" | "no_reply_needed" = "cancellation"): ClassifyAnswer => ({
  ok: true, model: MODEL, inputTokens: 300, outputTokens: 40,
  output: { intents: [primary], primary, confidence: 0.97, flags: [], childName: "Sam", summary: "THE GIST MUST NOT BE STORED" },
});
const drafted = (o: Partial<{ body: string; needsCharlie: boolean }> = {}): DraftAnswer => ({
  ok: true, model: MODEL, inputTokens: 400, outputTokens: 90, output: { body: "Thanks for letting me know. I hope Sam feels better.", needsCharlie: false, reason: "r", ...o },
});
const failure = (aborted = false) => ({ ok: false as const, outcome: "error" as const, error: "The AI is busy.", model: null, aborted });

function world() {
  const db = fakeIrisStore();
  db.setNow(() => T0);
  const classifyPrompts: { system: string; user: string }[] = [];
  const draftPrompts: { system: string; user: string }[] = [];
  let classifyReply: () => ClassifyAnswer = () => classified();
  let draftReply: () => DraftAnswer = () => drafted();
  const classify: ClassifyPort = async (p) => (classifyPrompts.push(p), classifyReply());
  const draft: DraftPort = async (p) => (draftPrompts.push(p), draftReply());
  let clock = T0;
  const deps = (o: Partial<EvalStepDeps> = {}): EvalStepDeps => ({
    store: db.store, classify, draft, directory: async () => FAMILIES, settings: db.settings, model: MODEL, now: () => new Date(clock), startedAtMs: T0, ...o,
  });
  let n = 0;
  const add = async (label: { goldIntent: string | null; goldReplyType?: string | null; goldEscalate: boolean | null } = { goldIntent: "cancellation", goldReplyType: "cancellation", goldEscalate: false }) => {
    const thread = await db.store.saveThread(`t${++n}`, { matchState: "matched", notionStudentIds: [SAM], parentEmail: "pat@y.com", subject: "s", firstReceivedAt: "x", lastInboundAt: "x", purgeAt: "2027-01-01T00:00:00Z" });
    const r = await db.store.insertMessage({
      threadId: thread.id, gmailMessageId: `g${n}`, rfcMessageId: null, direction: "inbound", source: "external", fromEmail: "pat@y.com", fromName: null,
      receivedAt: new Date(T0 - 30 * 86_400_000 + n * 1000).toISOString(), bodyText: "Sam is sick today.", bodyTruncated: false, snippet: "snip",
      state: "escalated", stateChangedAt: null, escalationReason: "history_import", policyVersion: null, handledAt: new Date(T0).toISOString(), retryCount: 0, lastError: null, purgeAt: "2027-01-01T00:00:00Z",
    });
    db.labels.set(r.id!, { goldIntent: label.goldIntent, goldReplyType: label.goldReplyType ?? null, goldEscalate: label.goldEscalate });
    return r.id!;
  };
  const request = (detail: Record<string, unknown> = { policy_version: POLICY_VERSION, model: MODEL }) => db.request("eval_run_requested", detail);
  return {
    db, deps, add, request, classifyPrompts, draftPrompts,
    setClassify: (f: typeof classifyReply) => (classifyReply = f),
    setDraft: (f: typeof draftReply) => (draftReply = f),
    setClock: (ms: number) => (clock = ms),
    finished: () => db.events.filter((e) => e.kind === "eval_run_finished"),
  };
}

describe("runEval", () => {
  it("does nothing without a pending request", async () => {
    const w = world();
    await w.add();
    expect(await runEval(w.deps())).toMatchObject({ ran: false });
    expect(w.classifyPrompts).toEqual([]);
  });

  it("a request stamped with an older policy or another model finishes stale with no model call", async () => {
    for (const detail of [{ policy_version: POLICY_VERSION - 1, model: MODEL }, { policy_version: POLICY_VERSION, model: "older-model" }]) {
      const w = world();
      await w.add();
      const id = w.request(detail);
      expect(await runEval(w.deps())).toMatchObject({ ran: true, finished: true });
      expect(w.classifyPrompts).toEqual([]);
      expect(w.db.aiCalls).toEqual([]);
      expect(w.finished().map((e) => e.detail)).toEqual([{ request_id: id, scored: 0, errors: 0, reason: "stale" }]);
    }
  });

  it("classifies and drafts with exactly the live prompts, and stores one result with the draft", async () => {
    const w = world();
    const id = await w.add();
    const req = w.request();
    expect(await runEval(w.deps())).toMatchObject({ scored: 1, errors: 0, finished: true });
    const ctx = await w.db.store.threadContext(w.db.messages.get(id)!.threadId, w.db.messages.get(id)!.receivedAt, 5);
    const byStudent = new Map(FAMILIES.map((e) => [e.studentId, e]));
    expect(w.classifyPrompts).toEqual([prepareClassifyPrompt({ bodyText: "Sam is sick today." }, ctx, byStudent).prompt]);
    expect(w.draftPrompts).toEqual([prepareDraftPrompt({ bodyText: "Sam is sick today.", notionStudentId: SAM }, "cancellation", ctx, byStudent)]);
    expect(w.db.evalResults).toEqual([
      expect.objectContaining({
        requestEventId: req, messageId: id, policyVersion: POLICY_VERSION, model: MODEL, predictedIntent: "cancellation", predictedReplyType: "cancellation",
        predictedEscalate: false, draftBody: "Thanks for letting me know. I hope Sam feels better.", outcome: "ok",
      }),
    ]);
    expect(w.db.aiCalls.map((c) => [c.purpose, c.inputTokens, c.outputTokens])).toEqual([["eval", 300, 40], ["eval", 400, 90]]);
    expect(JSON.stringify(w.db.aiCalls)).not.toMatch(/sick|GIST/);
    // The live state is untouched: no draft, no message change.
    expect(w.db.drafts.size).toBe(0);
    expect(w.db.messages.get(id)).toMatchObject({ state: "escalated", escalationReason: "history_import" });
    expect(w.finished().map((e) => e.detail)).toEqual([{ request_id: req, scored: 1, errors: 0 }]);
  });

  it("an escalated route gets no draft call and is predicted escalated", async () => {
    const w = world();
    await w.add();
    w.request();
    w.setClassify(() => classified("billing_question"));
    await runEval(w.deps());
    expect(w.draftPrompts).toEqual([]);
    expect(w.db.evalResults[0]).toMatchObject({ predictedEscalate: true, predictedReplyType: null, escalationReason: "escalate_only", draftBody: null });
  });

  it("no_reply_needed is predicted as no reply, not as an escalation", async () => {
    const w = world();
    await w.add();
    w.request();
    w.setClassify(() => classified("no_reply_needed"));
    await runEval(w.deps());
    expect(w.db.evalResults[0]).toMatchObject({ predictedEscalate: false, predictedReplyType: null });
  });

  it("a draft that breaks a rule is predicted escalated with no body", async () => {
    const w = world();
    await w.add();
    w.request();
    w.setDraft(() => drafted({ body: "We will refund you $40." }));
    await runEval(w.deps());
    expect(w.db.evalResults[0]).toMatchObject({ predictedEscalate: true, escalationReason: "draft_rule", draftBody: null });
  });

  it("a model error stores an error result; an abort stores nothing and waits", async () => {
    const w = world();
    await w.add();
    await w.add();
    w.request();
    let calls = 0;
    w.setClassify(() => (++calls === 1 ? failure() : failure(true)));
    const out = await runEval(w.deps());
    expect(out).toMatchObject({ errors: 1, finished: false });
    expect(w.db.evalResults).toEqual([expect.objectContaining({ outcome: "error", error: "The AI is busy.", predictedEscalate: true })]);
    expect(w.finished()).toEqual([]);
  });

  it("does at most irisMaxEvalPerRun per run, skips unlabelled messages and finishes when none remain", async () => {
    const w = world();
    for (let i = 0; i < TUNING.irisMaxEvalPerRun + 1; i++) await w.add();
    await w.add({ goldIntent: "cancellation", goldEscalate: null });
    const req = w.request();
    expect(await runEval(w.deps())).toMatchObject({ scored: TUNING.irisMaxEvalPerRun, finished: false });
    expect(await runEval(w.deps())).toMatchObject({ scored: 1, finished: true });
    expect(w.db.evalResults).toHaveLength(TUNING.irisMaxEvalPerRun + 1);
    expect(w.finished().map((e) => e.detail)).toEqual([{ request_id: req, scored: TUNING.irisMaxEvalPerRun + 1, errors: 0 }]);
    expect(await runEval(w.deps())).toMatchObject({ ran: false });
  });

  it("starts nothing past the eval budget, and waits while AI is not set up", async () => {
    const w = world();
    await w.add();
    w.request();
    w.setClock(T0 + TUNING.irisEvalBudgetMs);
    expect(await runEval(w.deps())).toMatchObject({ ran: true, scored: 0, finished: false });
    w.setClock(T0);
    expect(await runEval(w.deps({ classify: null }))).toMatchObject({ ran: true, scored: 0, finished: false });
    expect(w.classifyPrompts).toEqual([]);
  });
});
