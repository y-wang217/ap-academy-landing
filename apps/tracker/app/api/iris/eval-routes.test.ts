import { describe, expect, it } from "vitest";
import type { EvalReader } from "../../../lib/data/iris-eval";
import {
  handleEvalImport, handleEvalLabel, handleEvalRating, handleEvalRecord, handleEvalRun, loadEval, loadReadiness, parseFilter, parsePage, type EvalAdminDeps,
} from "../../../lib/iris/eval-handlers";
import type { EvalStatus } from "../../../lib/iris/eval-schemas";
import type { IrisReader } from "../../../lib/iris/handlers";
import { POLICY_VERSION } from "../../../lib/iris/policy";
import type { SchedulerIdentity } from "../../../lib/scheduler/identity";

// REQ-45 AC5 to AC8, AC11, AC13, AC14: the owner-only eval routes and loaders.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const M1 = "22222222-2222-4222-8222-222222222222";
const R1 = "66666666-6666-4666-8666-666666666666";
const ryan = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", name: "Ryan", email: "ryan@example.com", functions: ["Teacher"], status: "Active", subjects: [] };
const ADMIN: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const NOT_OWNERS: [string, SchedulerIdentity][] = [
  ["grade teacher", { scope: "none" }],
  ["scheduling teacher", { scope: "teacher", orgId: ORG, staff: ryan }],
  ["student", { scope: "none" }],
  ["parent", { scope: "none" }],
  ["signed out", { scope: "none" }],
];

const idle: EvalStatus = {
  importRequest: null, runRequest: null, ratedRequestId: null, latestRun: null, confusion: null,
  counts: { imported: 0, labelled: 0, evalTotal: 0, evalDone: 0, unratedDrafts: 0 },
};

function fakeReader(over: Partial<EvalReader> = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const spy = <T,>(name: string, v: T) => async (...args: unknown[]) => (calls.push({ name, args }), v);
  const reader: EvalReader = {
    listEvalItems: spy("listEvalItems", { items: [], total: 0 }),
    evalStatus: spy("evalStatus", idle),
    saveLabel: spy("saveLabel", "ok" as const),
    saveRating: spy("saveRating", "ok" as const),
    requestEval: spy("requestEval", undefined),
    recordRun: spy("recordRun", "ok" as const),
    gateInputs: spy("gateInputs", { run: null, replyTypes: {} }),
    ...over,
  };
  return { reader, calls };
}

function deps(identity: SchedulerIdentity, over: Partial<EvalReader> = {}) {
  const r = fakeReader(over);
  const d: EvalAdminDeps = { identity: async () => identity, reader: () => r.reader, model: "claude-test" };
  return { d, calls: r.calls };
}

const label = { goldIntent: "cancellation", goldReplyType: "cancellation", goldEscalate: false };

describe("eval routes: owner only, before anything is read (AC13)", () => {
  it.each(NOT_OWNERS)("a %s gets 403 from every route and the reader is never called", async (_who, identity) => {
    const { d, calls } = deps(identity);
    for (const res of [
      await handleEvalImport(d),
      await handleEvalRun(d),
      await handleEvalLabel(d, M1, label),
      await handleEvalRating(d, M1, { resultId: R1, rating: 5 }),
      await handleEvalRecord(d, { requestId: 1 }),
    ]) {
      expect(res.status).toBe(403);
    }
    expect(calls).toEqual([]);
  });

  it("the page sends a non-owner away and an unreachable identity is an error", async () => {
    for (const [, identity] of NOT_OWNERS) {
      const { d, calls } = deps(identity);
      const iris = () => { throw new Error("must not read"); };
      expect(await loadEval({ ...d, iris, studentNames: async () => new Map() }, "all", 1)).toEqual({ kind: "denied" });
      expect(calls).toEqual([]);
    }
    const { d } = deps({ scope: "unavailable" } as SchedulerIdentity);
    expect(await loadEval({ ...d, iris: () => { throw new Error("x"); }, studentNames: async () => new Map() }, "all", 1)).toEqual({ kind: "error" });
  });
});

describe("eval requests (AC4, AC6)", () => {
  it("an import request is an event; a second while pending is 409", async () => {
    const { d, calls } = deps(ADMIN);
    expect((await handleEvalImport(d)).status).toBe(200);
    expect(calls.at(-1)).toEqual({ name: "requestEval", args: ["eval_import_requested", {}] });
    const pending = deps(ADMIN, { evalStatus: async () => ({ ...idle, importRequest: { id: 5, at: "x", finished: null } }) });
    expect((await handleEvalImport(pending.d)).status).toBe(409);
    expect(pending.calls.some((c) => c.name === "requestEval")).toBe(false);
  });

  it("a run request is stamped with the policy version and model; a second while pending is 409", async () => {
    const { d, calls } = deps(ADMIN);
    expect((await handleEvalRun(d)).status).toBe(200);
    expect(calls.at(-1)).toEqual({ name: "requestEval", args: ["eval_run_requested", { policy_version: POLICY_VERSION, model: "claude-test" }] });
    const pending = deps(ADMIN, { evalStatus: async () => ({ ...idle, runRequest: { id: 6, at: "x", policyVersion: POLICY_VERSION, model: "m", finished: null } }) });
    expect((await handleEvalRun(pending.d)).status).toBe(409);
  });

  it("a read failure is 503", async () => {
    const { d } = deps(ADMIN, { evalStatus: async () => { throw new Error("down"); } });
    expect((await handleEvalImport(d)).status).toBe(503);
    expect((await handleEvalRun(d)).status).toBe(503);
  });
});

describe("labels (AC5)", () => {
  it("saves a valid label", async () => {
    const { d, calls } = deps(ADMIN);
    const res = await handleEvalLabel(d, M1, { ...label, note: "  ok  " });
    expect(res.status).toBe(200);
    expect(calls.at(-1)).toEqual({ name: "saveLabel", args: [M1, { ...label, note: "ok" }] });
  });

  it.each([
    ["escalate yes with a reply type", { ...label, goldEscalate: true }],
    ["an unknown intent", { ...label, goldIntent: "made_up" }],
    ["no_reply_needed as a reply type", { ...label, goldReplyType: "no_reply_needed" }],
    ["an extra field", { ...label, extra: 1 }],
    ["a long note", { ...label, note: "x".repeat(1001) }],
    ["no body", null],
  ])("400 for %s", async (_n, body) => {
    const { d, calls } = deps(ADMIN);
    expect((await handleEvalLabel(d, M1, body)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("escalate yes with no reply type is fine", async () => {
    const { d } = deps(ADMIN);
    expect((await handleEvalLabel(d, M1, { ...label, goldReplyType: null, goldEscalate: true })).status).toBe(200);
  });

  it("404 for a bad id or a message outside the org, 500 on a failed save", async () => {
    expect((await handleEvalLabel(deps(ADMIN).d, "nope", label)).status).toBe(404);
    expect((await handleEvalLabel(deps(ADMIN, { saveLabel: async () => "not_found" }).d, M1, label)).status).toBe(404);
    expect((await handleEvalLabel(deps(ADMIN, { saveLabel: async () => { throw new Error("x"); } }).d, M1, label)).status).toBe(500);
  });
});

describe("ratings (AC7)", () => {
  it("saves 1 to 5, refuses 0, 6 and another request's result", async () => {
    const { d, calls } = deps(ADMIN);
    expect((await handleEvalRating(d, M1, { resultId: R1, rating: 5 })).status).toBe(200);
    expect(calls.at(-1)).toEqual({ name: "saveRating", args: [M1, R1, 5] });
    expect((await handleEvalRating(d, M1, { resultId: R1, rating: 0 })).status).toBe(400);
    expect((await handleEvalRating(d, M1, { resultId: R1, rating: 6 })).status).toBe(400);
    expect((await handleEvalRating(d, M1, { resultId: "x", rating: 3 })).status).toBe(400);
    expect((await handleEvalRating(deps(ADMIN, { saveRating: async () => "invalid" }).d, M1, { resultId: R1, rating: 3 })).status).toBe(400);
  });
});

describe("record (AC8)", () => {
  it("records; refuses an unfinished request or one with error results with 409", async () => {
    expect((await handleEvalRecord(deps(ADMIN).d, { requestId: 7 })).status).toBe(200);
    expect((await handleEvalRecord(deps(ADMIN, { recordRun: async () => "not_finished" }).d, { requestId: 7 })).status).toBe(409);
    expect((await handleEvalRecord(deps(ADMIN, { recordRun: async () => "has_errors" }).d, { requestId: 7 })).status).toBe(409);
    expect((await handleEvalRecord(deps(ADMIN, { recordRun: async () => "not_found" }).d, { requestId: 7 })).status).toBe(404);
    expect((await handleEvalRecord(deps(ADMIN).d, { requestId: "7" })).status).toBe(400);
  });
});

describe("loadEval (AC5, AC14)", () => {
  const iris = (paused: boolean) => () => ({ getSettings: async () => ({ paused, mailbox: null, lastPollAt: null, lastPollResult: null, lastError: null, confidenceThreshold: 0.85 }) }) as unknown as IrisReader;

  it("labels families from the local names and carries paused", async () => {
    const item = { id: M1, receivedAt: "2026-03-12T10:00:00Z", fromEmail: "pat@y.com", subject: "Sick", notionStudentIds: ["s1"], bodyText: "b", reply: null, label: null, result: null };
    const { d } = deps(ADMIN, { listEvalItems: async () => ({ items: [item], total: 1 }) });
    const r = await loadEval({ ...d, iris: iris(true), studentNames: async () => new Map([["s1", "Sam P."]]) }, "unlabelled", 1);
    expect(r).toMatchObject({ kind: "ok", paused: true, total: 1, items: [{ id: M1, family: "Sam P." }] });
  });

  it("parses the filter and page", () => {
    expect([parseFilter("labelled"), parseFilter("all"), parseFilter("x"), parseFilter(undefined)]).toEqual(["labelled", "all", "unlabelled", "unlabelled"]);
    expect([parsePage("3"), parsePage("0"), parsePage("x"), parsePage(undefined)]).toEqual([3, 1, 1, 1]);
  });
});

describe("loadReadiness (AC11)", () => {
  it("lists the six candidate types with their failing conditions, and the never list", async () => {
    const { reader } = fakeReader({
      gateInputs: async () => ({
        run: { ranAt: "2026-10-21T14:05:00Z", policyVersion: POLICY_VERSION, model: "claude-test", perType: { cancellation: { precision: 1, recall: 1, count: 22 } }, sensitiveRecall: 1, meanRatingPerType: { cancellation: 4.2 } },
        replyTypes: { cancellation: { uneditedStreak: 7, streakPolicyVersion: POLICY_VERSION } },
      }),
    });
    const r = await loadReadiness(reader, "claude-test");
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows.map((x) => x.type)).toEqual(["cancel_with_notice", "late_cancel", "cancellation", "reschedule_request", "reschedule_offer", "general_question"]);
    expect(r.rows.find((x) => x.type === "cancellation")).toEqual({
      type: "cancellation", pass: false, failing: ["streak"], count: 22, streak: 7,
      enabled: false, eligible: false, switchable: false, approvedTotal: 0, editedTotal: 0, rejectedTotal: 0, disabledReason: null, disabledAt: null,
    });
    expect(r.never).toEqual(["pause_or_stop", "billing_question", "refund_request", "no_show", "other"]);
  });

  it("a read failure is an error", async () => {
    const { reader } = fakeReader({ gateInputs: async () => { throw new Error("x"); } });
    expect(await loadReadiness(reader, "m")).toEqual({ kind: "error" });
  });
});
