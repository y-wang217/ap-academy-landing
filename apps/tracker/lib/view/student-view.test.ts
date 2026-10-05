import { describe, expect, it } from "vitest";
import type { Assessment, Category, Course, Task } from "../data/schemas";
import { buildStudentView, type BundleLike } from "./student-view";

const TODAY = "2026-10-04";
const stamp = "2026-10-01T00:00:00Z";

function course(id: string, o: Partial<Course> = {}): Course {
  return { id, code: id.toUpperCase(), name: id, term: "", status: "active", inSixPlan: true, targetGrade: 95, activeVersionId: `v-${id}`, position: 0, updatedAt: stamp, ...o };
}
function category(id: string, courseId: string, weight: number): Category {
  return { id, courseId, versionId: `v-${courseId}`, name: id, weight, aggregationMethod: "mean_of_percentages", needsReview: false, position: 0 };
}
function assessment(id: string, courseId: string, categoryId: string, earned: number | null, possible: number, due: string, o: Partial<Assessment> = {}): Assessment {
  return { id, courseId, categoryId, title: id, dueDate: due, studentDoneAt: null, scoreEarned: earned, scorePossible: possible, excused: false, gradedAt: earned === null ? null : stamp, updatedAt: stamp, ...o };
}
function task(id: string, o: Partial<Task> = {}): Task {
  return { id, courseId: null, title: id, kind: "school", pinned: false, rank: 0, reason: null, suggestionKey: null, doneAt: null, createdAt: stamp, updatedAt: stamp, ...o };
}

function bundle(): BundleLike {
  return {
    student: { id: "s", orgId: "o", teacherId: "t", userId: "u", email: "s@example.com", firstName: "Sam", lastInitial: "L", gradeLevel: 11, studentNumber: 1, status: "active", publishedAt: stamp, updatedAt: stamp },
    goal: { id: "g", school: "Waterloo", program: "SE", applicationYear: 2027, targetSixAvg: 95, benchmarkNote: null, updatedAt: stamp },
    courses: [course("mhf"), course("sch", { targetGrade: null })],
    versions: [
      { id: "v-mhf", courseId: "mhf", version: 1, confirmedAt: stamp },
      { id: "v-sch", courseId: "sch", version: 1, confirmedAt: stamp },
    ],
    categories: [category("tests", "mhf", 50), category("assign", "mhf", 20), category("final", "mhf", 20), category("part", "mhf", 10), category("all", "sch", 100)],
    assessments: [
      assessment("t1", "mhf", "tests", 30, 32, "2026-09-10"),
      assessment("t2", "mhf", "tests", 41, 42, "2026-09-20"),
      assessment("a1", "mhf", "assign", 10, 10, "2026-09-11"),
      assessment("a2", "mhf", "assign", 9, 10, "2026-09-12"),
      assessment("a3", "mhf", "assign", 10, 10, "2026-09-13"),
      assessment("p1", "mhf", "part", 3, 3, "2026-09-14"),
      assessment("u1", "mhf", "tests", null, 50, "2026-10-10"),
      assessment("late", "sch", "all", null, 20, "2026-10-01", { studentDoneAt: stamp }),
    ],
    tasks: [task("pinned", { pinned: true, rank: 3 }), task("extra", { kind: "supplemental" }), task("done", { doneAt: stamp })],
    flags: [],
  };
}

describe("buildStudentView", () => {
  const view = buildStudentView(bundle(), TODAY);

  it("grades each course with the engine (the reference example)", () => {
    expect(view.courses[0].result.grade?.toFixed(1)).toBe("96.5");
    expect(view.courses[1].result.grade).toBeNull();
  });

  it("reports six-course progress over graded courses only", () => {
    expect(view.progress.gradedCount).toBe(1);
    expect(view.progress.label).toBe("Average of 1 graded course");
    expect(view.progress.target).toBe(95);
  });

  it("derives states and lists upcoming work", () => {
    expect(view.upcoming.map((a) => a.id)).toEqual(["u1"]);
    expect(view.courses[1].awaiting.map((a) => a.id)).toEqual(["late"]);
    expect(view.courses[0].graded).toHaveLength(6);
  });

  it("keeps supplemental work out of priorities and hides done tasks", () => {
    expect(view.priorities.map((t) => t.id)).toEqual(["pinned"]);
    expect(view.supplemental.map((t) => t.id)).toEqual(["extra"]);
  });

  it("has no gap when a course has no target", () => {
    expect(view.courses[1].gapToTarget).toBeNull();
    expect(view.courses[0].gapToTarget).toBeCloseTo(view.courses[0].result.grade! - 95, 10);
  });

  it("suggests nothing while every course is on target", () => {
    expect(view.suggestions).toEqual([]);
  });

  it("words a suggestion's reason and hides it once it is an open task", () => {
    const b = bundle();
    b.courses[0] = course("mhf", { targetGrade: 99 });
    const v = buildStudentView(b, TODAY);
    expect(v.suggestions.map((s) => [s.key, s.title, s.reason])).toEqual([
      ["prepare:u1", "Prepare for u1", "MHF is 2.5% below target and u1 is due in 6 days."],
    ]);
    b.tasks.push(task("added", { suggestionKey: "prepare:u1" }));
    expect(buildStudentView(b, TODAY).suggestions).toEqual([]);
    b.tasks[b.tasks.length - 1] = task("added", { suggestionKey: "prepare:u1", doneAt: stamp });
    expect(buildStudentView(b, TODAY).suggestions).toHaveLength(1);
  });

  it("attaches open flags to their assessment and lists them for the teacher", () => {
    const b = bundle();
    b.flags = [
      { id: "f2", assessmentId: "late", reason: "returned", createdAt: "2026-10-03T00:00:00Z", resolvedAt: null },
      { id: "f1", assessmentId: "t1", reason: "score_differs", createdAt: "2026-10-02T00:00:00Z", resolvedAt: null },
    ];
    const v = buildStudentView(b, TODAY);
    expect(v.flagged.map((a) => a.id)).toEqual(["t1", "late"]);
    expect(v.courses[0].graded.find((a) => a.id === "t1")?.openFlag?.reason).toBe("score_differs");
    expect(v.courses[0].graded.find((a) => a.id === "t2")?.openFlag).toBeNull();
  });
});
