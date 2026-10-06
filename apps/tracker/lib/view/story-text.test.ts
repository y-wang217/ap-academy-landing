import { describe, expect, it } from "vitest";
import { asideText, headlineText, listText, storyText } from "./story-text";

describe("story copy", () => {
  it("words every headline with its numbers", () => {
    expect(headlineText({ kind: "no_goal" })).toBe("No target set yet. Your teacher sets it with you.");
    expect(headlineText({ kind: "no_marks" })).toBe("No marks yet. The first marked test or assignment starts your averages.");
    expect(headlineText({ kind: "six_on_target", average: 93.42, gap: 0.42 })).toBe("Six-course average is 93.4%, 0.4 above target.");
    expect(headlineText({ kind: "six_on_target", average: 93, gap: 0.02 })).toBe("Six-course average is 93.0%, on target.");
    expect(headlineText({ kind: "partial_on_target", graded: 4, plan: 6, gap: 1.2, unmarked: ["SBI4U", "ENG4U"] })).toBe(
      "4 of 6 courses graded. The average so far is 1.2 above target. SBI4U and ENG4U have no marks yet.",
    );
    expect(headlineText({ kind: "partial_on_target", graded: 5, plan: 6, gap: 0, unmarked: ["ENG4U"] })).toBe(
      "5 of 6 courses graded. The average so far is on target. ENG4U has no marks yet.",
    );
    expect(headlineText({ kind: "all_courses_on_target", gap: -1.5, target: 93, targetsAverage: 91.5 })).toBe(
      "Every course is at or above its own target. The course targets average 91.5%, below the 93.0% goal.",
    );
    expect(headlineText({ kind: "below_target", graded: 1, plan: 6, gap: -3 })).toBe("1 of 6 courses graded. The average so far is 3.0 below target.");
    expect(headlineText({ kind: "one_course_below", code: "SPH4U", gap: 6 })).toBe("SPH4U is the one course below its target, 6.0 below. The others are at or above theirs.");
    expect(headlineText({ kind: "dominant_gap", code: "SPH4U", gap: 6.04, below: 3 })).toBe("SPH4U is the biggest gap, 6.0 below its target.");
    expect(headlineText({ kind: "several_below", codes: ["SPH4U", "SCH4U", "MCV4U"] })).toBe("3 courses are below their targets: SPH4U, SCH4U and MCV4U.");
  });

  it("words every aside", () => {
    expect(asideText({ kind: "big_test_soon", title: "Unit 3 Test", date: "2026-10-09", share: 12.4, code: "MHF4U" })).toBe("Unit 3 Test on Fri, Oct 9 is about 12% of MHF4U.");
    expect(asideText({ kind: "rising", code: "MHF4U", delta: 3.21, window: 3 })).toBe("MHF4U rose 3.2 over the last 3 marks.");
    expect(asideText({ kind: "awaiting_many", count: 2 })).toBe("2 results are waiting to be entered.");
  });

  it("never forecasts, never mentions admission, never uses an em-dash", () => {
    const all = [
      headlineText({ kind: "no_goal" }), headlineText({ kind: "no_marks" }),
      headlineText({ kind: "six_on_target", average: 93, gap: 1 }), headlineText({ kind: "partial_on_target", graded: 1, plan: 6, gap: 1, unmarked: ["A"] }),
      headlineText({ kind: "all_courses_on_target", gap: -1, target: 93, targetsAverage: 90 }), headlineText({ kind: "below_target", graded: 1, plan: 6, gap: -1 }),
      headlineText({ kind: "one_course_below", code: "A", gap: 1 }), headlineText({ kind: "dominant_gap", code: "A", gap: 1, below: 2 }),
      headlineText({ kind: "several_below", codes: ["A", "B"] }),
      asideText({ kind: "big_test_soon", title: "T", date: "2026-10-09", share: 10, code: "A" }), asideText({ kind: "rising", code: "A", delta: 1, window: 3 }),
      asideText({ kind: "awaiting_many", count: 2 }),
    ];
    for (const s of all) {
      expect(s).not.toMatch(/—/);
      expect(s).not.toMatch(/admi(t|ssion)|likely|chance|will get|can get|you're close/i);
      expect(s.length).toBeLessThanOrEqual(140);
    }
  });

  it("joins lists and pairs the aside with the headline", () => {
    expect(listText([])).toBe("");
    expect(listText(["A"])).toBe("A");
    expect(listText(["A", "B"])).toBe("A and B");
    expect(storyText({ headline: { kind: "no_goal" }, aside: null })).toEqual({ headline: "No target set yet. Your teacher sets it with you.", aside: null });
  });
});
