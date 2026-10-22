import { describe, expect, it } from "vitest";
import { BILLING_RULES_VERSION, chargeState, type ChargeInput } from "./charge-state";

// REQ-40 AC1, AC2. The rules table of the design, first match wins. The grid
// below walks every combination and checks it against this table.
type Row = { when: (i: ChargeInput) => boolean; state: string; unconfirmed: (i: ChargeInput) => boolean };
const RULES: Row[] = [
  { when: (i) => i.status === "cancelled" && i.makeup === "delivered", state: "not_charged", unconfirmed: () => false },
  { when: (i) => i.status === "cancelled", state: "credit_owed", unconfirmed: () => false },
  { when: (i) => i.outcome === "no_show", state: "forfeit_pending", unconfirmed: () => false },
  { when: (i) => i.purpose === "makeup" && i.outcome === "delivered", state: "made_up", unconfirmed: (i) => i.outcomePending },
  { when: (i) => i.purpose === "makeup", state: "not_charged", unconfirmed: (i) => i.past },
  { when: (i) => i.outcome === "delivered", state: "chargeable", unconfirmed: (i) => i.outcomePending },
  { when: (i) => i.past, state: "chargeable", unconfirmed: () => true },
  { when: () => true, state: "not_charged", unconfirmed: () => false },
];

const KINDS = [
  { kind: "weekly", purpose: null },
  { kind: "one_off", purpose: null },
  { kind: "one_off", purpose: "trial" },
  { kind: "one_off", purpose: "extra" },
  { kind: "one_off", purpose: "makeup" },
] as const;
const OUTCOMES = [
  { outcome: "delivered", outcomePending: false },
  { outcome: "delivered", outcomePending: true },
  { outcome: "no_show", outcomePending: false },
  { outcome: "none", outcomePending: false },
] as const;

function grid(): ChargeInput[] {
  const out: ChargeInput[] = [];
  for (const status of ["scheduled", "moved", "cancelled"] as const)
    for (const k of KINDS)
      for (const o of OUTCOMES)
        for (const past of [true, false])
          for (const makeup of status === "cancelled" ? (["none", "linked", "delivered"] as const) : (["none"] as const))
            out.push({ status, kind: k.kind, purpose: k.purpose, past, outcome: o.outcome, outcomePending: o.outcomePending, makeup });
  return out;
}

describe("chargeState (REQ-40 AC1)", () => {
  it("exports rules version 1", () => {
    expect(BILLING_RULES_VERSION).toBe(1);
  });

  it("every combination of state, purpose, outcome and time matches the rules table", () => {
    const inputs = grid();
    expect(inputs.length).toBe(3 * 5 * 4 * 2 + 2 * 5 * 4 * 2);
    for (const i of inputs) {
      const rule = RULES.find((r) => r.when(i))!;
      expect(chargeState(i), JSON.stringify(i)).toEqual({ state: rule.state, unconfirmed: rule.unconfirmed(i) });
    }
  });

  it("a moved class is charged like a scheduled one", () => {
    for (const o of OUTCOMES) for (const past of [true, false]) {
      const base = { kind: "weekly", purpose: null, past, outcome: o.outcome, outcomePending: o.outcomePending, makeup: "none" } as const;
      expect(chargeState({ ...base, status: "moved" })).toEqual(chargeState({ ...base, status: "scheduled" }));
    }
  });

  it("trials, extras and undeclared one-offs are charged like weekly classes (Decision 4)", () => {
    for (const k of KINDS.filter((x) => x.purpose !== "makeup")) {
      const i = { status: "scheduled", kind: k.kind, purpose: k.purpose, past: true, outcome: "delivered", outcomePending: false, makeup: "none" } as const;
      expect(chargeState(i)).toEqual({ state: "chargeable", unconfirmed: false });
    }
  });

  it("a past class with no outcome is chargeable and unconfirmed; a pending claim is too", () => {
    const base = { status: "scheduled", kind: "weekly", purpose: null, makeup: "none" } as const;
    expect(chargeState({ ...base, past: true, outcome: "none", outcomePending: false })).toEqual({ state: "chargeable", unconfirmed: true });
    expect(chargeState({ ...base, past: true, outcome: "delivered", outcomePending: true })).toEqual({ state: "chargeable", unconfirmed: true });
    expect(chargeState({ ...base, past: false, outcome: "none", outcomePending: false })).toEqual({ state: "not_charged", unconfirmed: false });
  });
});

describe("the double-count trap (REQ-40 AC2)", () => {
  const cancelled = (makeup: ChargeInput["makeup"]) =>
    chargeState({ status: "cancelled", kind: "weekly", purpose: null, past: true, outcome: "none", outcomePending: false, makeup });
  const makeup = (outcome: ChargeInput["outcome"]) =>
    chargeState({ status: "scheduled", kind: "one_off", purpose: "makeup", past: outcome !== "none", outcome, outcomePending: false, makeup: "none" });

  it("before the makeup is delivered the original is credit_owed and the makeup is not charged", () => {
    expect(cancelled("linked").state).toBe("credit_owed");
    expect(makeup("none").state).toBe("not_charged");
  });
  it("once the makeup is delivered the original is not_charged and the makeup is made_up", () => {
    expect(cancelled("delivered").state).toBe("not_charged");
    expect(makeup("delivered").state).toBe("made_up");
  });
  it("neither side is ever chargeable", () => {
    for (const m of ["none", "linked", "delivered"] as const) expect(cancelled(m).state).not.toBe("chargeable");
    for (const o of ["none", "delivered", "no_show"] as const) expect(makeup(o).state).not.toBe("chargeable");
  });
});
