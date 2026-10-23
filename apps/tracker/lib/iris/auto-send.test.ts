import { describe, expect, it } from "vitest";
import { TUNING } from "../domain/tuning";
import { AUTO_SKIP_CONDITIONS, autoSendCheck, quietSendAfter, runAutoSend, type AutoSkipCondition, type GateSettings } from "./auto-send";
import { GmailError, type GmailSendPort } from "./gmail";
import { AUTOMATED_LINE } from "./policy";
import { fakeIrisStore } from "./store.fake";
import type { AutoSendCandidate } from "./store";

// REQ-49 AC1, AC2, AC4: the gate, quiet hours and the run's auto-send step.
const ON: GateSettings = { paused: false, sendingEnabled: true, confidenceThreshold: 0.85 };
const SAM = "11111111-1111-4111-8111-111111111111";
const PASSING: AutoSendCandidate = {
  draftId: "d1", messageId: "m1", replyType: "late_cancel", version: 1, createdBy: "iris", edited: false, policyVersion: 5,
  message: { state: "drafted", intent: "cancellation", flags: [], confidence: 0.95, notionStudentId: SAM, notionStudentIds: [SAM] },
  typeSwitch: { autoSendEnabled: true, streakPolicyVersion: 5 },
};
const msg = (patch: Partial<AutoSendCandidate["message"]>) => ({ ...PASSING, message: { ...PASSING.message, ...patch } });

describe("autoSendCheck (AC1, AC2)", () => {
  it("passes with every condition met", () => {
    expect(autoSendCheck(ON, PASSING)).toEqual({ approve: true, failing: [] });
  });

  const cases: [AutoSkipCondition, GateSettings, AutoSendCandidate][] = [
    ["paused", { ...ON, paused: true }, PASSING],
    ["sending_disabled", { ...ON, sendingEnabled: false }, PASSING],
    ["type_disabled", ON, { ...PASSING, typeSwitch: { autoSendEnabled: false, streakPolicyVersion: 5 } }],
    ["never_auto_send", ON, { ...PASSING, replyType: "pause_or_stop", typeSwitch: { autoSendEnabled: true, streakPolicyVersion: 5 } }],
    ["needs_charlie", ON, msg({ state: "escalated" })],
    ["flags", ON, msg({ flags: ["schedule_unknown"] })],
    ["confidence", ON, msg({ confidence: 0.84 })],
    ["student", ON, msg({ notionStudentId: null, notionStudentIds: [SAM, "22222222-2222-4222-8222-222222222222"] })],
    ["policy_version", ON, { ...PASSING, policyVersion: 4 }],
    ["edited", ON, { ...PASSING, edited: true }],
  ];
  for (const [code, settings, c] of cases) {
    it(`fails ${code} alone`, () => {
      expect(autoSendCheck(settings, c)).toEqual({ approve: false, failing: [code] });
    });
  }

  it("fails intent alone when the message has no intent", () => {
    // A null intent is not child-scoped, so the student condition does not apply.
    expect(autoSendCheck(ON, msg({ intent: null }))).toEqual({ approve: false, failing: ["intent"] });
  });

  it("each code has a test, and a type with no row is type_disabled and policy_version", () => {
    expect(new Set([...cases.map(([c]) => c), "intent"])).toEqual(new Set(AUTO_SKIP_CONDITIONS));
    expect(autoSendCheck(ON, { ...PASSING, typeSwitch: null }).failing).toEqual(["type_disabled", "policy_version"]);
  });

  it("a version 2 or an owner draft is edited", () => {
    expect(autoSendCheck(ON, { ...PASSING, version: 2 }).failing).toEqual(["edited"]);
    expect(autoSendCheck(ON, { ...PASSING, createdBy: "owner" }).failing).toEqual(["edited"]);
  });

  it("a non child-scoped intent needs no student, and one thread child is enough", () => {
    expect(autoSendCheck(ON, msg({ intent: "general_question", notionStudentId: null, notionStudentIds: [] })).approve).toBe(true);
    expect(autoSendCheck(ON, msg({ notionStudentId: null, notionStudentIds: [SAM] })).approve).toBe(true);
  });

  it("lists every failing condition, in order", () => {
    const r = autoSendCheck({ paused: true, sendingEnabled: false, confidenceThreshold: 0.85 }, { ...msg({ flags: ["x"], confidence: 0.5 }), edited: true });
    expect(r.failing).toEqual(["paused", "sending_disabled", "flags", "confidence", "edited"]);
  });
});

describe("quietSendAfter (AC4)", () => {
  // Toronto local time to an instant: EDT (UTC-4) before Nov 1 2026, EST (UTC-5) after, EDT again from Mar 14 2027.
  const at = (iso: string) => new Date(iso);
  const cases: [string, string, string | null][] = [
    ["20:59 sends now", "2026-10-22T20:59:00-04:00", null],
    ["21:00 waits to 07:00 next day", "2026-10-22T21:00:00-04:00", "2026-10-23T11:00:00.000Z"],
    ["22:00 waits to 07:00 next day", "2026-10-22T22:00:00-04:00", "2026-10-23T11:00:00.000Z"],
    ["23:59 waits to 07:00 next day", "2026-10-22T23:59:00-04:00", "2026-10-23T11:00:00.000Z"],
    ["00:00 waits to 07:00 same day", "2026-10-23T00:00:00-04:00", "2026-10-23T11:00:00.000Z"],
    ["03:00 waits to 07:00 same day", "2026-10-23T03:00:00-04:00", "2026-10-23T11:00:00.000Z"],
    ["06:59 waits to 07:00 same day", "2026-10-23T06:59:00-04:00", "2026-10-23T11:00:00.000Z"],
    ["07:00 sends now", "2026-10-23T07:00:00-04:00", null],
    ["22:00 on Oct 31 waits to 07:00 EST on Nov 1 (DST ends)", "2026-10-31T22:00:00-04:00", "2026-11-01T12:00:00.000Z"],
    ["03:00 on Nov 1 waits to 07:00 EST", "2026-11-01T03:00:00-05:00", "2026-11-01T12:00:00.000Z"],
    ["22:00 on Mar 13 waits to 07:00 EDT on Mar 14 (DST starts)", "2027-03-13T22:00:00-05:00", "2027-03-14T11:00:00.000Z"],
  ];
  for (const [name, now, want] of cases) {
    it(name, () => {
      expect(quietSendAfter(at(now), "21:00", "07:00")).toBe(want);
    });
  }

  it("uses the stored window, wrapping or not, and seconds in the stored time are ignored", () => {
    expect(quietSendAfter(at("2026-10-22T22:30:00-04:00"), "23:00:00", "06:00:00")).toBeNull();
    expect(quietSendAfter(at("2026-10-22T23:30:00-04:00"), "23:00:00", "06:00:00")).toBe("2026-10-23T10:00:00.000Z");
    expect(quietSendAfter(at("2026-10-22T13:00:00-04:00"), "12:00", "14:00")).toBe("2026-10-22T18:00:00.000Z");
    expect(quietSendAfter(at("2026-10-22T14:00:00-04:00"), "12:00", "14:00")).toBeNull();
    expect(quietSendAfter(at("2026-10-22T14:00:00-04:00"), "07:00", "07:00")).toBeNull();
  });
});

/** A Gmail that accepts every send and keeps the raw messages. */
function gmailPort(o: { fail?: number } = {}) {
  const calls: string[] = [];
  const raws: string[] = [];
  const port: GmailSendPort = {
    readToken: async () => (calls.push("readToken"), "read"),
    sendToken: async () => (calls.push("sendToken"), "send"),
    send: async (_t, raw) => {
      calls.push("send");
      if (o.fail) throw new GmailError(`Gmail returned ${o.fail}`, o.fail);
      raws.push(Buffer.from(raw, "base64url").toString());
      return { id: `gm-${raws.length}`, threadId: "t" };
    },
    findSent: async () => (calls.push("findSent"), null),
  };
  return { port, calls, raws };
}

describe("runAutoSend (AC1, AC2, AC4)", () => {
  const DAY = Date.parse("2026-10-22T19:00:00Z"); // 15:00 Toronto
  const NIGHT = Date.parse("2026-10-23T02:00:00Z"); // 22:00 Toronto
  function world(t = DAY) {
    const db = fakeIrisStore({ sendingEnabled: true });
    db.setNow(() => t);
    db.replyType("late_cancel");
    const g = gmailPort();
    const run = (drafted: { messageId: string; draftId: string }[], o: { sender?: GmailSendPort | null; startedAtMs?: number } = {}) =>
      runAutoSend({
        store: db.store, sender: o.sender === undefined ? g.port : o.sender, mailbox: "charlie@apacademy.ca", settings: db.settings, drafted,
        now: () => new Date(t), startedAtMs: o.startedAtMs ?? t,
      });
    return { db, g, run };
  }

  it("a pass by day approves, claims and sends with the automated line", async () => {
    const w = world();
    const a = w.db.drafted();
    const out = await w.run([a]);
    expect(out).toEqual({ approved: 1, sent: 1, failed: 0, skipped: 0, error: null });
    const d = w.db.drafts.get(a.draftId)!;
    expect(d).toMatchObject({ state: "sent", approvalMode: "auto", sendAfter: null });
    expect(w.g.calls).toEqual(["sendToken", "send"]);
    // The stored outbound row is what was sent: draft, signature, a blank line, then the line (AC3).
    const outbound = [...w.db.messages.values()].find((m) => m.direction === "outbound")!;
    expect(outbound.bodyText!.endsWith(`\n\n${AUTOMATED_LINE}`)).toBe(true);
    expect(w.g.raws).toHaveLength(1);
    const send = [...w.db.sends.values()][0];
    expect(send).toMatchObject({ mode: "auto", state: "sent", attempts: 1 });
    expect(w.db.events.filter((e) => e.kind === "auto_approved")).toHaveLength(1);
  });

  it("a pass at 22:00 approves, makes no Gmail call, and the send waits for 07:00", async () => {
    const w = world(NIGHT);
    const a = w.db.drafted();
    const out = await w.run([a]);
    expect(out).toMatchObject({ approved: 1, sent: 0 });
    expect(w.g.calls).toEqual([]);
    const send = [...w.db.sends.values()][0];
    expect(send).toMatchObject({ state: "sending", attempts: 0, leaseUntil: Date.parse("2026-10-23T11:00:00Z") });
    expect(w.db.drafts.get(a.draftId)!.sendAfter).toBe("2026-10-23T11:00:00.000Z");
    expect(await w.db.store.claimSend(send.id, 60, 3)).toBe("busy");
  });

  it("a fail writes one skipped event with its conditions and nothing else", async () => {
    const w = world();
    const a = w.db.drafted({ flags: ["schedule_unknown"] });
    const out = await w.run([a]);
    expect(out).toEqual({ approved: 0, sent: 0, failed: 0, skipped: 1, error: null });
    expect(w.db.events.filter((e) => e.kind === "auto_send_skipped")).toEqual([
      { kind: "auto_send_skipped", messageId: a.messageId, draftId: a.draftId, detail: { reply_type: "late_cancel", conditions: ["flags"] } },
    ]);
    expect(w.db.sends.size).toBe(0);
    expect(w.db.drafts.get(a.draftId)!.state).toBe("proposed");
    expect(w.db.messages.get(a.messageId)!.state).toBe("drafted");
    expect(w.db.calls).not.toContain("autoApprove");
  });

  it("a skip from SQL is recorded with its code", async () => {
    const w = world();
    const a = w.db.drafted();
    w.db.store.autoApprove = async () => ({ result: "skipped", reason: "type_disabled" });
    const out = await w.run([a]);
    expect(out).toMatchObject({ approved: 0, skipped: 1 });
    expect(w.db.events.find((e) => e.kind === "auto_send_skipped")!.detail.conditions).toEqual(["type_disabled"]);
  });

  it("after the send budget it approves but starts no send; the next run's send step finds it", async () => {
    const w = world();
    const a = w.db.drafted();
    const out = await w.run([a], { startedAtMs: DAY - TUNING.irisSendBudgetMs });
    expect(out).toMatchObject({ approved: 1, sent: 0 });
    expect(w.g.calls).toEqual([]);
    expect(await w.db.store.listStuckSends(5)).toHaveLength(1);
  });

  it("without a sender it approves and leaves the send for a run that has one", async () => {
    const w = world();
    const a = w.db.drafted();
    expect(await w.run([a], { sender: null })).toMatchObject({ approved: 1, sent: 0 });
    expect([...w.db.sends.values()][0]).toMatchObject({ state: "sending", attempts: 0 });
  });

  it("a store error ends the step with one error line and never throws", async () => {
    const w = world();
    const a = w.db.drafted();
    w.db.fail.add("autoSendCandidates");
    expect(await w.run([a])).toEqual({ approved: 0, sent: 0, failed: 0, skipped: 0, error: "Could not read drafts for auto-send" });
    w.db.fail.delete("autoSendCandidates");
    w.db.fail.add("autoApprove");
    const out = await w.run([a]);
    expect(out.error).toBe("Auto-send stopped: the store failed");
    expect(out.error!.length).toBeLessThanOrEqual(300);
  });

  it("nothing drafted reads nothing", async () => {
    const w = world();
    expect(await w.run([])).toEqual({ approved: 0, sent: 0, failed: 0, skipped: 0, error: null });
    expect(w.db.calls).toEqual([]);
  });
});
