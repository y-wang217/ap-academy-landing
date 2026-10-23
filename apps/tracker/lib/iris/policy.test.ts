import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHILD_SCOPED, CLASSIFIER_INTENTS, ESCALATE_ONLY, FLAG_HINTS, FLAGS, HARD_RULES, INTENT_HINTS, NEVER_AUTO_SEND, NOTICE_HOURS, POLICY, POLICY_VERSION, REPLY_TYPES, SCHEDULE_FLAGS, SCHEDULE_REPLY_TYPES, SENSITIVE_TRIGGERS } from "./policy";

// REQ-42 AC7: the versioned policy file, with the founder values of Oct 16, 2026.
const ROOT = join(__dirname, "..", "..");
const SOURCE = readFileSync(join(__dirname, "policy.ts"), "utf8");

describe("policy.ts", () => {
  it("is version 4 (REQ-46) with a 12-hour notice window", () => {
    expect(POLICY_VERSION).toBe(4);
    expect(NOTICE_HOURS).toBe(12);
  });

  it("has a section for every reply type and escalate-only intent", () => {
    expect([...REPLY_TYPES]).toEqual(["cancel_with_notice", "late_cancel", "cancellation", "reschedule_request", "reschedule_offer", "pause_or_stop", "general_question", "no_reply_needed"]);
    expect([...ESCALATE_ONLY]).toEqual(["billing_question", "refund_request", "no_show", "other"]);
    expect(Object.keys(POLICY).sort()).toEqual([...REPLY_TYPES, ...ESCALATE_ONLY].sort());
    for (const [key, section] of Object.entries(POLICY)) {
      expect(section.title, key).not.toBe("");
      expect(section.text, key).not.toBe("");
    }
  });

  it("never auto-sends pause_or_stop or any escalate-only intent", () => {
    for (const k of ["pause_or_stop", ...ESCALATE_ONLY]) {
      expect(NEVER_AUTO_SEND, k).toContain(k);
      expect(POLICY[k as keyof typeof POLICY].autoSendAllowed, k).toBe(false);
    }
  });

  it("states every founder value", () => {
    const all = [...Object.values(POLICY).map((s) => s.text), ...HARD_RULES].join("\n");
    for (const fact of [
      "12 or more hours", "under 12 hours", "no fee", "make-up class between the missed class and the next scheduled one",
      "credited on next month's invoice", "never confirms a forfeit", "no notice needed", "refunded on the final invoice", "one invoice a month",
    ]) expect(all, fact).toContain(fact);
  });

  it("names no dollar amount", () => {
    for (const [key, s] of Object.entries(POLICY)) {
      expect(s.text, key).not.toContain("$");
      expect(s.text, key).not.toMatch(/\d\s*dollar/i);
    }
  });

  it("imports nothing", () => {
    expect(SOURCE).not.toMatch(/^\s*import\s/m);
  });

  it("is the only non-test source that carries policy or hard-rule text", () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (f === "node_modules" || f === ".next") return [];
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
    });
    const texts = [...Object.values(POLICY).map((s) => s.text), ...HARD_RULES, ...Object.values(INTENT_HINTS), ...Object.values(FLAG_HINTS)];
    for (const f of files(ROOT).filter((f) => !f.endsWith(join("lib", "iris", "policy.ts")))) {
      const src = readFileSync(f, "utf8");
      for (const t of texts) expect(src.includes(t), `${f} carries "${t.slice(0, 40)}"`).toBe(false);
    }
  });

  // REQ-43: what the classifier may answer.
  it("lists the 9 classifier intents, each a policy section with a hint", () => {
    expect([...CLASSIFIER_INTENTS]).toEqual(["cancellation", "reschedule_request", "pause_or_stop", "general_question", "no_reply_needed", "billing_question", "refund_request", "no_show", "other"]);
    for (const i of CLASSIFIER_INTENTS) {
      expect(POLICY[i], i).toBeDefined();
      expect(INTENT_HINTS[i], i).not.toBe("");
    }
    for (const never of ["cancel_with_notice", "late_cancel", "reschedule_offer"]) expect(CLASSIFIER_INTENTS as readonly string[]).not.toContain(never);
    expect([...CHILD_SCOPED]).toEqual(["cancellation", "reschedule_request"]);
  });

  it("has the five flags, each with a hint and lower-case trigger phrases", () => {
    expect([...FLAGS]).toEqual(["money_dispute", "legal_threat", "crisis", "hardship", "refund"]);
    for (const f of FLAGS) {
      expect(FLAG_HINTS[f], f).not.toBe("");
      expect(SENSITIVE_TRIGGERS[f].length, f).toBeGreaterThanOrEqual(3);
      for (const t of SENSITIVE_TRIGGERS[f]) expect(t, f).toBe(t.toLowerCase().trim());
    }
  });

  // REQ-46: the schedule split's reply types and its flag.
  it("splits cancellations into two reply types the classifier never answers", () => {
    expect([...SCHEDULE_REPLY_TYPES]).toEqual(["cancel_with_notice", "late_cancel"]);
    for (const t of SCHEDULE_REPLY_TYPES) {
      expect(REPLY_TYPES as readonly string[], t).toContain(t);
      expect(CLASSIFIER_INTENTS as readonly string[], t).not.toContain(t);
    }
  });

  it("keeps schedule_unknown out of the sensitive flags, so it never escalates", () => {
    expect([...SCHEDULE_FLAGS]).toEqual(["schedule_unknown"]);
    expect(FLAGS as readonly string[]).not.toContain("schedule_unknown");
    expect(SENSITIVE_TRIGGERS).not.toHaveProperty("schedule_unknown");
  });
});
