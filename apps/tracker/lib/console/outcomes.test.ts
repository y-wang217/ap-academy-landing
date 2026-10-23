import { describe, expect, it } from "vitest";
import {
  allowedOutcomes, CONTRACT_A, CONTRACT_C, CONTRACT_FIELDS, FOLLOW_UP_ACTIONS, nextCallSlot, OUTCOMES, planOutcome, STAGES,
  type ContractField, type LeadSnapshot, type Outcome,
} from "./outcomes";

// REQ-61 AC1 to AC4: the transition table, the contracts and the cadence, pure.
const NOW = new Date("2026-10-26T14:00:00.000Z"); // Monday 10:00 Toronto (EDT)
const TODAY = "2026-10-26";
const FUTURE = "2026-10-27T18:00:00.000Z";
const PAST = "2026-10-25T18:00:00.000Z";
const TRIAL_TIME = "2026-10-29T20:00:00.000Z";

const allPresent = (): Record<ContractField, boolean> => Object.fromEntries(CONTRACT_FIELDS.map((f) => [f, true])) as Record<ContractField, boolean>;

function lead(over: Partial<LeadSnapshot> = {}): LeadSnapshot {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", stage: "Working", lostReason: null, attempts: 1, nextAction: "Call", nextActionDue: null, owner: null,
    lastContact: null, contactedAt: null, trialBookedAt: null, closedAt: null, trialTime: TRIAL_TIME,
    lastEditedAt: "2026-10-26T13:00:00.000Z", lastTxn: null, present: allPresent(), ...over,
  };
}
const FORM: Record<Outcome, { nextAction?: string; due?: string }> = {
  no_answer: {}, call_back: { due: FUTURE }, follow_up: { nextAction: "Close call", due: FUTURE }, trial_booked: {}, not_interested: {},
  wrong_number: {}, do_not_contact: {}, won: {},
};
const plan = (outcome: Outcome, l: LeadSnapshot = lead(), form = FORM[outcome], now = NOW) => planOutcome({ outcome, lead: l, form, now });

// The transition table: allowed starting Stages per outcome.
const ALLOWED: Record<Outcome, string[]> = {
  no_answer: ["New", "Working", "Awaiting Close"],
  call_back: ["New", "Working"],
  follow_up: ["Working", "Trial Booked", "Trial Claimed", "Awaiting Close", "Onboarding"],
  trial_booked: ["New", "Working"],
  not_interested: ["New", "Working", "Awaiting Close"],
  wrong_number: ["New", "Working"],
  do_not_contact: ["New", "Working", "Awaiting Close"],
  won: ["Awaiting Close"],
};

describe("planOutcome: the transition matrix (AC1)", () => {
  it("knows all eleven Stage options", () => {
    expect(STAGES).toHaveLength(11);
  });

  for (const outcome of OUTCOMES) {
    for (const stage of [...STAGES, null]) {
      const allowed = stage !== null && ALLOWED[outcome].includes(stage);
      it(`${outcome} from ${stage ?? "no Stage"} is ${allowed ? "planned" : "refused"}`, () => {
        const r = plan(outcome, lead({ stage }));
        if (allowed) {
          expect(r.ok).toBe(true);
        } else {
          expect(r).toMatchObject({ ok: false, code: "disallowed" });
          if (!r.ok) expect(r.message).toContain(stage ?? "no Stage");
        }
      });
    }
  }

  for (const reason of ["Do not contact", "Duplicate"]) {
    it(`every outcome is refused for a lead whose Lost Reason is ${reason}`, () => {
      for (const outcome of OUTCOMES) {
        const r = plan(outcome, lead({ stage: ALLOWED[outcome][0], lostReason: reason }));
        expect(r).toMatchObject({ ok: false, code: "disallowed" });
      }
    });
  }

  it("allowedOutcomes lists exactly the table's outcomes per Stage, none for a permanent Lost Reason", () => {
    for (const stage of STAGES) {
      expect(allowedOutcomes(stage, null)).toEqual(OUTCOMES.filter((o) => ALLOWED[o].includes(stage)));
    }
    expect(allowedOutcomes(null, null)).toEqual([]);
    expect(allowedOutcomes("Working", "Do not contact")).toEqual([]);
    expect(allowedOutcomes("Working", "Duplicate")).toEqual([]);
    expect(allowedOutcomes("Working", "Not interested")).toEqual(allowedOutcomes("Working", null));
  });
});

describe("planOutcome: the side effects of each row (AC1)", () => {
  it("No answer from New moves to Working, counts the attempt, sets the next slot and Call when empty", () => {
    const r = plan("no_answer", lead({ stage: "New", attempts: null, nextAction: null }));
    expect(r).toEqual({
      ok: true, cadenceUsedUp: false,
      patch: { stage: "Working", attempts: 1, nextActionDue: "2026-10-26T15:00:00-04:00", nextAction: "Call" },
      touch: { type: "Call", outcome: "No answer", title: "Call · Oct 26 10:00" },
    });
  });

  it("No answer from Working keeps the Stage and an existing Next Action", () => {
    const r = plan("no_answer", lead({ stage: "Working", attempts: 2, nextAction: "Text" }));
    expect(r).toMatchObject({ ok: true, patch: { attempts: 3, nextActionDue: "2026-10-26T15:00:00-04:00" } });
    if (r.ok) {
      expect(r.patch).not.toHaveProperty("stage");
      expect(r.patch).not.toHaveProperty("nextAction");
    }
  });

  it("No answer from Awaiting Close logs a Close call touch", () => {
    const r = plan("no_answer", lead({ stage: "Awaiting Close" }));
    expect(r).toMatchObject({ ok: true, touch: { type: "Close call", outcome: "No answer", title: "Close call · Oct 26 10:00" } });
  });

  it("the fourth No answer uses up the cadence: Next Action Text, due 7 days out", () => {
    const r = plan("no_answer", lead({ attempts: 3 }));
    expect(r).toEqual({
      ok: true, cadenceUsedUp: true,
      patch: { attempts: 4, nextAction: "Text", nextActionDue: new Date(NOW.getTime() + 7 * 86_400_000).toISOString() },
      touch: { type: "Call", outcome: "No answer", title: "Call · Oct 26 10:00" },
    });
    expect(plan("no_answer", lead({ attempts: 2 }))).toMatchObject({ cadenceUsedUp: false });
  });

  it("Contacted, call back later resets Attempts and stamps contact", () => {
    expect(plan("call_back", lead({ stage: "New", attempts: 3 }))).toEqual({
      ok: true, cadenceUsedUp: false,
      patch: { stage: "Working", attempts: 0, nextAction: "Call", nextActionDue: FUTURE, lastContact: TODAY, contactedAt: TODAY },
      touch: { type: "Call", outcome: "Follow-up", title: "Call · Oct 26 10:00" },
    });
  });

  it("a milestone is stamped only when empty, never overwritten", () => {
    const r = plan("call_back", lead({ contactedAt: "2026-10-01" }));
    expect(r.ok && r.patch).not.toHaveProperty("contactedAt");
    const t = plan("trial_booked", lead({ trialBookedAt: "2026-10-02", contactedAt: "2026-10-01" }));
    expect(t.ok && t.patch).not.toHaveProperty("trialBookedAt");
    expect(t.ok && t.patch).not.toHaveProperty("contactedAt");
    const w = plan("won", lead({ stage: "Awaiting Close", closedAt: "2026-10-03" }));
    expect(w.ok && w.patch).not.toHaveProperty("closedAt");
  });

  it("Follow-up scheduled keeps the Stage and writes the chosen action", () => {
    expect(plan("follow_up", lead({ stage: "Trial Claimed" }), { nextAction: "Rebook trial", due: FUTURE })).toEqual({
      ok: true, cadenceUsedUp: false,
      patch: { nextAction: "Rebook trial", nextActionDue: FUTURE, lastContact: TODAY, contactedAt: TODAY },
      touch: { type: "Call", outcome: "Follow-up", title: "Call · Oct 26 10:00" },
    });
  });

  it("Trial booked from New passes through Working to Trial Booked, clears Owner and is due at the Trial Time", () => {
    expect(plan("trial_booked", lead({ stage: "New" }))).toEqual({
      ok: true, cadenceUsedUp: false,
      patch: {
        stage: "Trial Booked", owner: null, nextAction: "Deliver trial", nextActionDue: TRIAL_TIME, lastContact: TODAY,
        trialBookedAt: TODAY, contactedAt: TODAY,
      },
      touch: { type: "Call", outcome: "Trial booked", title: "Call · Oct 26 10:00" },
    });
  });

  it("Lost outcomes set the reason, None and clear the due", () => {
    expect(plan("not_interested", lead({ stage: "Awaiting Close" }))).toEqual({
      ok: true, cadenceUsedUp: false,
      patch: { stage: "Lost", lostReason: "Not interested", nextAction: "None", nextActionDue: null, lastContact: TODAY, contactedAt: TODAY },
      touch: { type: "Close call", outcome: "Not interested", title: "Close call · Oct 26 10:00" },
    });
    expect(plan("wrong_number")).toEqual({
      ok: true, cadenceUsedUp: false,
      patch: { stage: "Lost", lostReason: "Wrong number", nextAction: "None", nextActionDue: null },
      touch: { type: "Call", outcome: "Wrong number", title: "Call · Oct 26 10:00" },
    });
    expect(plan("do_not_contact")).toEqual({
      ok: true, cadenceUsedUp: false,
      patch: { stage: "Lost", lostReason: "Do not contact", nextAction: "None", nextActionDue: null, lastContact: TODAY, contactedAt: TODAY },
      touch: { type: "Call", outcome: "Do not contact", title: "Call · Oct 26 10:00" },
    });
  });

  it("Won moves Awaiting Close to Onboarding with Assign teacher due in 24 hours", () => {
    expect(plan("won", lead({ stage: "Awaiting Close", contactedAt: "2026-10-01" }))).toEqual({
      ok: true, cadenceUsedUp: false,
      patch: {
        stage: "Onboarding", nextAction: "Assign teacher", nextActionDue: new Date(NOW.getTime() + 86_400_000).toISOString(), lastContact: TODAY, closedAt: TODAY,
      },
      touch: { type: "Close call", outcome: "Won", title: "Close call · Oct 26 10:00" },
    });
  });
});

describe("planOutcome: contracts (AC2, AC3)", () => {
  it("names the contract fields", () => {
    expect(CONTRACT_A).toEqual(["Parent Name", "Student Name", "Parent Phone", "Subjects", "Grade", "Target Program", "Trial Time", "Sales Notes"]);
    expect(CONTRACT_C).toEqual(["Lesson Cadence", "Hourly Rate (CAD)", "Last Payment Date", "Subjects"]);
  });

  for (const field of CONTRACT_A) {
    it(`Trial booked with ${field} empty is refused, naming exactly it`, () => {
      const r = plan("trial_booked", lead({ present: { ...allPresent(), [field]: false } }));
      expect(r).toMatchObject({ ok: false, code: "contract_missing", missing: [field] });
    });
  }
  for (const field of CONTRACT_C) {
    it(`Won with ${field} empty is refused, naming exactly it`, () => {
      const r = plan("won", lead({ stage: "Awaiting Close", present: { ...allPresent(), [field]: false } }));
      expect(r).toMatchObject({ ok: false, code: "contract_missing", missing: [field] });
    });
  }

  it("Won is refused while Last Payment Date is empty even with the other three set", () => {
    const present = { ...allPresent(), "Last Payment Date": false };
    expect(plan("won", lead({ stage: "Awaiting Close", present }))).toMatchObject({ code: "contract_missing", missing: ["Last Payment Date"] });
  });

  it("several missing fields are all named, in contract order", () => {
    const present = { ...allPresent(), "Sales Notes": false, "Parent Phone": false };
    expect(plan("trial_booked", lead({ present }))).toMatchObject({ code: "contract_missing", missing: ["Parent Phone", "Sales Notes"] });
  });

  it("no plan writes a billing, parent, note or schedule field", () => {
    const allowed = new Set(["stage", "owner", "nextAction", "nextActionDue", "attempts", "lastContact", "lostReason", "contactedAt", "trialBookedAt", "closedAt"]);
    for (const outcome of OUTCOMES) {
      for (const stage of ALLOWED[outcome]) {
        const r = plan(outcome, lead({ stage, attempts: 3 }));
        expect(r.ok).toBe(true);
        if (r.ok) for (const k of Object.keys(r.patch)) expect(allowed.has(k), `${outcome} from ${stage} writes ${k}`).toBe(true);
      }
    }
  });
});

describe("planOutcome: the form", () => {
  it("call back and follow-up need a future time", () => {
    expect(plan("call_back", lead(), { due: PAST })).toMatchObject({ ok: false, code: "bad_form" });
    expect(plan("call_back", lead(), {})).toMatchObject({ ok: false, code: "bad_form" });
    expect(plan("follow_up", lead(), { nextAction: "Call", due: PAST })).toMatchObject({ ok: false, code: "bad_form" });
  });

  it("follow-up needs one of the listed next actions", () => {
    expect(FOLLOW_UP_ACTIONS).toEqual(["Call", "Text", "Book trial", "Close call", "Rebook trial", "Schedule first lesson"]);
    expect(plan("follow_up", lead(), { due: FUTURE })).toMatchObject({ ok: false, code: "bad_form" });
    expect(plan("follow_up", lead(), { nextAction: "Assign teacher", due: FUTURE })).toMatchObject({ ok: false, code: "bad_form" });
  });

  it("Trial booked without a Trial Time value is refused as a contract gap", () => {
    expect(plan("trial_booked", lead({ trialTime: null, present: { ...allPresent(), "Trial Time": false } }))).toMatchObject({
      code: "contract_missing", missing: ["Trial Time"],
    });
  });
});

describe("nextCallSlot (AC4)", () => {
  const at = (iso: string) => nextCallSlot(new Date(iso));
  it("before 15:00 on a business day: 15:00 today; after: 12:00 the next business day", () => {
    expect(at("2026-10-26T14:00:00.000Z")).toBe("2026-10-26T15:00:00-04:00"); // Mon 10:00
    expect(at("2026-10-26T16:05:00.000Z")).toBe("2026-10-26T15:00:00-04:00"); // Mon 12:05
    expect(at("2026-10-26T19:10:00.000Z")).toBe("2026-10-27T12:00:00-04:00"); // Mon 15:10
    expect(at("2026-10-30T19:10:00.000Z")).toBe("2026-11-02T12:00:00-05:00"); // Fri 15:10, Monday after the DST end
    expect(at("2026-10-31T15:00:00.000Z")).toBe("2026-11-02T12:00:00-05:00"); // Sat 11:00
  });

  it("keeps the right offset on both sides of the November and March DST changes", () => {
    expect(at("2026-10-30T14:00:00.000Z")).toBe("2026-10-30T15:00:00-04:00"); // Fri before, EDT
    expect(at("2026-11-02T15:00:00.000Z")).toBe("2026-11-02T15:00:00-05:00"); // Mon after, EST
    expect(at("2027-03-12T15:00:00.000Z")).toBe("2027-03-12T15:00:00-05:00"); // Fri before, EST
    expect(at("2027-03-12T21:00:00.000Z")).toBe("2027-03-15T12:00:00-04:00"); // Fri 16:00, Monday after, EDT
    expect(new Date(at("2027-03-12T21:00:00.000Z")).toISOString()).toBe("2027-03-15T16:00:00.000Z");
  });
});
