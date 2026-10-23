import { describe, expect, it } from "vitest";
import type { ClassException, ClassSeries } from "../domain/schedule/recurrence";
import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import type { DraftAnswer, DraftPort } from "./draft";
import { runDraft, type DraftStepDeps, type StudentSchedule } from "./draft-step";
import { POLICY, POLICY_VERSION, SIGNATURE } from "./policy";
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

// REQ-46 AC6 to AC10: cancellations split by the notice the scheduler shows.
describe("runDraft: schedule-aware cancellations (REQ-46)", () => {
  const weekly = (o: Partial<ClassSeries> = {}): ClassSeries => ({
    id: "s1", staffId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0009", studentId: SAM, subject: "MPM2D", kind: "weekly",
    startDate: "2026-10-06", startTime: "17:00", durationMinutes: 60, effectiveUntil: null, ...o,
  });
  // T0 is Wed 2026-10-21 08:00 Toronto; each message arrives about 07:00.
  const scheduleOf = (series: ClassSeries[], exceptions: ClassException[] = []) => {
    const calls: string[] = [];
    const port = async (id: string): Promise<StudentSchedule> => (calls.push(id), { series, exceptions });
    return { calls, port };
  };

  it("with notice: the draft is cancel_with_notice, the prompt names the two dates and no time", async () => {
    const w = world();
    const id = await w.add();
    const s = scheduleOf([weekly()]);
    const out = await runDraft(w.deps({ schedule: s.port }));
    expect(out).toMatchObject({ drafted: 1, escalated: 0, error: null });
    expect(s.calls).toEqual([SAM]);
    expect(w.draftsOf(id)[0].replyType).toBe("cancel_with_notice");
    expect(w.msg(id).state).toBe("drafted");
    expect(w.prompts[0].system).toContain(POLICY.cancel_with_notice.text);
    expect(w.prompts[0].system).not.toContain(POLICY.cancellation.text);
    expect(w.prompts[0].user).toContain("Missed class: Tuesday 27 October");
    expect(w.prompts[0].user).toContain("Next scheduled class: Tuesday 3 November");
    expect(w.prompts[0].user).not.toMatch(/\d{1,2}:\d{2}/);
    const [e] = w.eventsOf(id);
    expect(e.detail).toMatchObject({ state: "drafted", reply_type: "cancel_with_notice", class_date: "2026-10-27" });
    expect(e.detail.notice_minutes).toBeGreaterThan(24 * 60);
  });

  it("late: the draft is late_cancel", async () => {
    const w = world();
    const id = await w.add();
    await runDraft(w.deps({ schedule: scheduleOf([weekly({ kind: "one_off", startDate: "2026-10-21", startTime: "15:00" })]).port }));
    expect(w.draftsOf(id)[0].replyType).toBe("late_cancel");
    expect(w.prompts[0].system).toContain(POLICY.late_cancel.text);
    expect(w.prompts[0].user).toContain("Missed class: Wednesday 21 October");
    expect(w.prompts[0].user).toContain("Next scheduled class: none on the schedule");
  });

  it("no-show: escalated schedule_no_show with intent no_show, one escalated event, then a no_show draft", async () => {
    const w = world();
    const id = await w.add();
    const out = await runDraft(w.deps({ schedule: scheduleOf([weekly({ kind: "one_off", startDate: "2026-10-21", startTime: "07:00" })]).port }));
    expect(out).toMatchObject({ drafted: 1, escalated: 1 });
    expect(w.msg(id)).toMatchObject({ state: "escalated", intent: "no_show", escalationReason: "schedule_no_show", handledAt: null });
    const events = w.eventsOf(id);
    expect(events.map((e) => e.kind)).toEqual(["escalated", "drafted"]);
    expect(events[0].detail).toEqual({ state: "escalated", reason: "schedule_no_show", classified_intent: "cancellation", class_date: "2026-10-21", notion_student_id: SAM });
    expect(events[1].detail).toMatchObject({ state: "escalated", reason: "schedule_no_show", reply_type: "no_show" });
    expect(w.draftsOf(id)[0].replyType).toBe("no_show");
    expect(w.prompts[0].system).toContain(POLICY.no_show.text);
    expect(w.prompts[0].user).not.toContain("Missed class:");
  });

  it("no-show whose draft call fails is drafted by the next run, still escalated", async () => {
    const w = world();
    const id = await w.add();
    const s = scheduleOf([weekly({ kind: "one_off", startDate: "2026-10-21", startTime: "07:00" })]);
    w.setReply(() => bad());
    await runDraft(w.deps({ schedule: s.port }));
    expect(w.msg(id)).toMatchObject({ state: "escalated", escalationReason: "schedule_no_show", retryCount: 1 });
    w.setReply(() => good());
    await runDraft(w.deps({ schedule: s.port }));
    expect(w.draftsOf(id).map((d) => d.replyType)).toEqual(["no_show"]);
    expect(w.msg(id)).toMatchObject({ state: "escalated", escalationReason: "schedule_no_show" });
    expect(w.eventsOf(id).filter((e) => e.kind === "drafted")[0].detail).toMatchObject({ reason: "schedule_no_show" });
  });

  it("no series: cancellation with the schedule_unknown flag, not escalated", async () => {
    const w = world();
    const id = await w.add({ flags: [] });
    await runDraft(w.deps({ schedule: scheduleOf([]).port }));
    expect(w.draftsOf(id)[0].replyType).toBe("cancellation");
    expect(w.msg(id)).toMatchObject({ state: "drafted", flags: ["schedule_unknown"] });
    expect(w.prompts[0].system).toContain(POLICY.cancellation.text);
  });

  it("no matched student: cancellation with the flag, and the schedule is never read", async () => {
    const w = world();
    const id = await w.add({ notionStudentId: null });
    const s = scheduleOf([weekly()]);
    await runDraft(w.deps({ schedule: s.port }));
    expect(s.calls).toHaveLength(0);
    expect(w.draftsOf(id)[0].replyType).toBe("cancellation");
    expect(w.msg(id)).toMatchObject({ state: "drafted", flags: ["schedule_unknown"] });
  });

  it("a failed schedule read leaves the message classified, spends no retry, and the next message is still drafted", async () => {
    const w = world();
    const broken = await w.add();
    const fine = await w.add({ notionStudentId: LEO, students: [LEO] });
    const port = async (id: string): Promise<StudentSchedule> => {
      if (id === SAM) throw new Error("boom");
      return { series: [weekly({ studentId: LEO })], exceptions: [] };
    };
    const out = await runDraft(w.deps({ schedule: port }));
    expect(out).toMatchObject({ result: "ok", drafted: 1, error: "Could not read the schedule" });
    expect(w.msg(broken)).toMatchObject({ state: "classified", retryCount: 0 });
    expect(w.draftsOf(broken)).toEqual([]);
    expect(w.msg(fine).state).toBe("drafted");
  });

  it("reads each student's schedule once per run", async () => {
    const w = world();
    await w.add();
    await w.add();
    const s = scheduleOf([weekly()]);
    await runDraft(w.deps({ schedule: s.port }));
    expect(s.calls).toEqual([SAM]);
  });

  it("other intents never read the schedule", async () => {
    const w = world();
    const id = await w.add({ intent: "general_question" });
    const s = scheduleOf([weekly()]);
    await runDraft(w.deps({ schedule: s.port }));
    expect(s.calls).toHaveLength(0);
    expect(w.draftsOf(id)[0].replyType).toBe("general_question");
  });

  it("with no schedule port the step behaves as before", async () => {
    const w = world();
    const id = await w.add();
    await runDraft(w.deps({ schedule: null }));
    expect(w.draftsOf(id)[0].replyType).toBe("cancellation");
    expect(w.msg(id).flags ?? []).toEqual([]);
  });
});
