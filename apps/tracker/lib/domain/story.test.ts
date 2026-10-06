import { describe, expect, it } from "vitest";
import { storyFacts, type StoryCourse, type StoryInput } from "./story";
import { TUNING } from "./tuning";

const TODAY = "2026-10-06";

const course = (code: string, grade: number | null, targetGrade: number | null = 92, trendDelta: number | null = 0): StoryCourse => ({ code, grade, targetGrade, trendDelta });

function input(courses: StoryCourse[], target: number | null = 93, over: Partial<StoryInput> = {}): StoryInput {
  const graded = courses.filter((c): c is StoryCourse & { grade: number } => c.grade !== null);
  const average = graded.length ? graded.reduce((s, c) => s + c.grade, 0) / graded.length : null;
  return {
    hasGoal: target !== null,
    progress: {
      gradedCount: graded.length, planCount: 6, averageOfGraded: average, target,
      gapToTarget: average !== null && target !== null ? average - target : null, complete: graded.length === 6 && courses.length === 6,
    },
    courses, upcoming: [], awaitingCount: 0, today: TODAY, ...over,
  };
}

describe("storyFacts headline", () => {
  it("no goal, then no marks", () => {
    expect(storyFacts(input([course("MHF4U", 90)], null)).headline).toEqual({ kind: "no_goal" });
    expect(storyFacts(input([course("MHF4U", null)])).headline).toEqual({ kind: "no_marks" });
  });

  it("six graded and on or above target", () => {
    const six = ["A", "B", "C", "D", "E", "F"].map((c) => course(c, 94));
    expect(storyFacts(input(six)).headline).toEqual({ kind: "six_on_target", average: 94, gap: 1 });
    expect(storyFacts(input(six.map((c) => ({ ...c, grade: 93 })))).headline).toMatchObject({ kind: "six_on_target", gap: 0 });
  });

  it("partial and on target names the courses without marks", () => {
    const h = storyFacts(input([course("MHF4U", 95), course("MCV4U", 93), course("SBI4U", null), course("ENG4U", null)])).headline;
    expect(h).toEqual({ kind: "partial_on_target", graded: 2, plan: 6, gap: 1, unmarked: ["SBI4U", "ENG4U"] });
  });

  it("below target with every course at its own target blames the targets", () => {
    const h = storyFacts(input([course("MHF4U", 90, 90), course("MCV4U", 91, 90)])).headline;
    expect(h).toEqual({ kind: "all_courses_on_target", gap: -2.5, target: 93, targetsAverage: 90 });
  });

  it("below target with no course targets at all states the gap plainly", () => {
    expect(storyFacts(input([course("MHF4U", 90, null)])).headline).toEqual({ kind: "below_target", graded: 1, plan: 6, gap: -3 });
  });

  it("one course below its target", () => {
    const h = storyFacts(input([course("MHF4U", 96, 95), course("SPH4U", 86, 92)])).headline;
    expect(h).toEqual({ kind: "one_course_below", code: "SPH4U", gap: 6 });
  });

  it("the mock: Physics is the biggest gap when it is twice the next", () => {
    const mock = [course("MHF4U", 96.5, 95), course("MCV4U", 93, 94), course("SPH4U", 86, 92), course("SCH4U", 89.3, 91), course("SBI4U", null), course("ENG4U", null)];
    const h = storyFacts(input(mock)).headline;
    expect(h).toEqual({ kind: "dominant_gap", code: "SPH4U", gap: 6, below: 3 });
  });

  it("several courses below, worst first, when none dominates", () => {
    const h = storyFacts(input([course("SPH4U", 88, 92), course("SCH4U", 87, 90), course("ENG4U", 89, 91)])).headline;
    expect(h).toEqual({ kind: "several_below", codes: ["SPH4U", "SCH4U", "ENG4U"] });
    expect(TUNING.storyDominantRatio).toBe(2);
  });

  it("ignores a shortfall display rounding would hide", () => {
    const h = storyFacts(input([course("MHF4U", 91.98, 92)], 95)).headline;
    expect(h).toEqual({ kind: "all_courses_on_target", gap: 91.98 - 95, target: 95, targetsAverage: 92 });
  });
});

describe("storyFacts aside", () => {
  const base = [course("MHF4U", 96.5, 95, 3.2), course("SPH4U", 86, 92, 1.5)];

  it("a big item soon comes first, soonest then largest", () => {
    const { aside } = storyFacts(input(base, 93, {
      upcoming: [
        { title: "Quiz", courseCode: "MHF4U", date: "2026-10-07", share: 4 },
        { title: "Unit 3 Test", courseCode: "MHF4U", date: "2026-10-09", share: 12 },
        { title: "Lab", courseCode: "SPH4U", date: "2026-10-09", share: 15 },
        { title: "Exam", courseCode: "SPH4U", date: "2026-10-20", share: 30 },
      ],
    }));
    expect(aside).toEqual({ kind: "big_test_soon", title: "Lab", date: "2026-10-09", share: 15, code: "SPH4U" });
  });

  it("otherwise the course that rose the most", () => {
    expect(storyFacts(input(base)).aside).toEqual({ kind: "rising", code: "MHF4U", delta: 3.2, window: TUNING.trendWindowMarks });
    expect(storyFacts(input([course("A", 90, 92, 0.5), course("B", 90, 92, null)])).aside).toBeNull();
  });

  it("otherwise results waiting, and nothing when there is nothing to say", () => {
    const flat = [course("MHF4U", 96.5, 95, 0)];
    expect(storyFacts(input(flat, 93, { awaitingCount: 2 })).aside).toEqual({ kind: "awaiting_many", count: 2 });
    expect(storyFacts(input(flat, 93, { awaitingCount: 1 })).aside).toBeNull();
  });
});
