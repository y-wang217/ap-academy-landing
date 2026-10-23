import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/sensitive.json";
import { FLAGS, type ClassifierIntent, type Flag } from "./policy";
import { backstopFlags, routeClassification, type Classification, type RouteContext } from "./route";

// REQ-43 AC1 to AC7: the pure routing rules, first match wins.
const MAYA = "11111111-1111-4111-8111-111111111111";
const LEO = "22222222-2222-4222-8222-222222222222";
const SOLO = "33333333-3333-4333-8333-333333333333";
const SIBLINGS = [{ studentId: MAYA, firstName: "Maya" }, { studentId: LEO, firstName: "Leo" }];
const ONE_CHILD = [{ studentId: SOLO, firstName: "Sam" }];

const answer = (o: Partial<Classification> = {}): Classification => ({
  intents: [o.primary ?? "general_question"], primary: "general_question", confidence: 0.95, flags: [], childName: "", ...o,
});
const ctx = (o: Partial<RouteContext> = {}): RouteContext => ({ threshold: 0.85, children: ONE_CHILD, text: "A plain question about Tuesday.", ...o });

describe("routeClassification: sensitive fixtures (AC1)", () => {
  const list = fixtures.fixtures as { flag: Flag; text: string }[];

  it("has at least 3 synthetic fixtures per flag", () => {
    for (const f of FLAGS) expect(list.filter((x) => x.flag === f).length, f).toBeGreaterThanOrEqual(3);
  });

  for (const fx of list) {
    it(`"${fx.text.slice(0, 40)}" escalates flagged with ${fx.flag}, with and without the model's flag`, () => {
      const withFlag = routeClassification(answer({ flags: [fx.flag] }), ctx({ text: fx.text }));
      const backstop = routeClassification(answer({ flags: [] }), ctx({ text: fx.text }));
      for (const r of [withFlag, backstop]) {
        expect(r.state).toBe("escalated");
        expect(r.reason).toBe("flagged");
        expect(r.flags).toContain(fx.flag);
        expect(r.handled).toBe(false);
      }
    });
  }

  it("flags win over every later rule, even a no-reply thank-you", () => {
    const r = routeClassification(answer({ primary: "no_reply_needed", intents: ["no_reply_needed"], flags: ["crisis"] }), ctx());
    expect(r).toMatchObject({ state: "escalated", reason: "flagged", handled: false });
  });
});

describe("backstopFlags", () => {
  it("finds phrases in any case, with curly apostrophes, and only adds", () => {
    expect(backstopFlags("We CAN’T AFFORD it")).toEqual(["hardship"]);
    expect(backstopFlags("See you Tuesday")).toEqual([]);
    expect(backstopFlags("A refund, and my lawyer agrees")).toEqual(["legal_threat", "refund"]);
  });
});

describe("routeClassification: multi intent (AC2)", () => {
  it("two distinct intents escalate multi_intent and keep the primary", () => {
    const r = routeClassification(answer({ intents: ["cancellation", "general_question"], primary: "cancellation", confidence: 0.99 }), ctx());
    expect(r).toMatchObject({ state: "escalated", reason: "multi_intent", intent: "cancellation" });
  });

  it("a repeated intent counts as one", () => {
    const r = routeClassification(answer({ intents: ["cancellation", "cancellation"], primary: "cancellation", confidence: 0.99 }), ctx());
    expect(r).toMatchObject({ state: "classified", reason: null });
  });

  it("a primary missing from intents still counts", () => {
    const r = routeClassification(answer({ intents: ["general_question"], primary: "cancellation", confidence: 0.99 }), ctx());
    expect(r.reason).toBe("multi_intent");
  });
});

describe("routeClassification: threshold (AC3)", () => {
  it("0.84 under 0.85 is low_confidence; 0.85 at 0.85 passes; 0.85 under 0.90 is low_confidence", () => {
    expect(routeClassification(answer({ confidence: 0.84 }), ctx({ threshold: 0.85 }))).toMatchObject({ state: "escalated", reason: "low_confidence" });
    expect(routeClassification(answer({ confidence: 0.85 }), ctx({ threshold: 0.85 }))).toMatchObject({ state: "classified", reason: null });
    expect(routeClassification(answer({ confidence: 0.85 }), ctx({ threshold: 0.9 }))).toMatchObject({ state: "escalated", reason: "low_confidence" });
  });
});

describe("routeClassification: escalate-only (AC4)", () => {
  it.each(["billing_question", "refund_request", "no_show", "other"] as ClassifierIntent[])("%s alone at 0.99 escalates escalate_only", (intent) => {
    // A text with no trigger phrase, so only the intent rule can fire.
    expect(routeClassification(answer({ primary: intent, intents: [intent], confidence: 0.99 }), ctx({ text: "About last week." }))).toMatchObject({ state: "escalated", reason: "escalate_only" });
  });

  it("general_question at 0.99 is classified", () => {
    expect(routeClassification(answer({ confidence: 0.99 }), ctx())).toMatchObject({ state: "classified", reason: null });
  });
});

describe("routeClassification: no reply needed (AC5)", () => {
  it("no_reply_needed alone at the threshold is escalated, handled, reason no_reply_needed", () => {
    const r = routeClassification(answer({ primary: "no_reply_needed", intents: ["no_reply_needed"], confidence: 0.85 }), ctx({ text: "Thanks so much!" }));
    expect(r).toMatchObject({ state: "escalated", reason: "no_reply_needed", handled: true });
  });
});

describe("routeClassification: siblings (AC6)", () => {
  for (const intent of ["cancellation", "reschedule_request"] as ClassifierIntent[]) {
    it(`${intent}: no name or a stranger's name is ambiguous_student; MAYA is Maya`, () => {
      const base = answer({ primary: intent, intents: [intent], confidence: 0.95 });
      expect(routeClassification({ ...base, childName: "" }, ctx({ children: SIBLINGS }))).toMatchObject({ state: "escalated", reason: "ambiguous_student", studentId: null });
      expect(routeClassification({ ...base, childName: "Zed" }, ctx({ children: SIBLINGS }))).toMatchObject({ state: "escalated", reason: "ambiguous_student" });
      expect(routeClassification({ ...base, childName: "MAYA" }, ctx({ children: SIBLINGS }))).toMatchObject({ state: "classified", reason: null, studentId: MAYA });
    });
  }

  it("a single-child family never gets ambiguous_student", () => {
    const r = routeClassification(answer({ primary: "cancellation", intents: ["cancellation"], childName: "" }), ctx({ children: ONE_CHILD }));
    expect(r).toMatchObject({ state: "classified", studentId: SOLO });
  });

  it("a child-scoped intent with no resolvable child escalates ambiguous_student", () => {
    const r = routeClassification(answer({ primary: "cancellation", intents: ["cancellation"] }), ctx({ children: [] }));
    expect(r.reason).toBe("ambiguous_student");
  });

  it("a sibling family with a non-child-scoped intent is classified with no student", () => {
    expect(routeClassification(answer(), ctx({ children: SIBLINGS }))).toMatchObject({ state: "classified", studentId: null });
  });
});

describe("routeClassification: default (AC7)", () => {
  it("general_question at 0.95 with no flags in a single-child family is classified, reason null", () => {
    expect(routeClassification(answer(), ctx())).toEqual({ state: "classified", reason: null, intent: "general_question", intents: ["general_question"], flags: [], handled: false, studentId: SOLO });
  });
});

// REQ-46 AC9: the schedule flag is never a classifier flag, so an empty flag list stays classified.
describe("routeClassification: schedule_unknown", () => {
  it("a clean cancellation with no flags routes classified", () => {
    const r = routeClassification(answer({ primary: "cancellation", intents: ["cancellation"], flags: [] }), ctx({ text: "Please cancel Thursday's class." }));
    expect(r.state).toBe("classified");
    expect(FLAGS as readonly string[]).not.toContain("schedule_unknown");
  });
});
