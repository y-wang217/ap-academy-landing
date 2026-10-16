import type { Assessment, Category, Course, Task } from "../data/schemas";
import type { BundleLike } from "./student-view";

export const TODAY = "2026-10-04";
export const stamp = "2026-10-01T00:00:00Z";

export function course(id: string, o: Partial<Course> = {}): Course {
  return { id, code: id.toUpperCase(), name: id, term: "", status: "active", inSixPlan: true, targetGrade: 95, activeVersionId: `v-${id}`, position: 0, updatedAt: stamp, ...o };
}
export function category(id: string, courseId: string, weight: number): Category {
  return { id, courseId, versionId: `v-${courseId}`, name: id, weight, aggregationMethod: "mean_of_percentages", needsReview: false, position: 0 };
}
export function assessment(id: string, courseId: string, categoryId: string, earned: number | null, possible: number, due: string, o: Partial<Assessment> = {}): Assessment {
  return { id, courseId, categoryId, title: id, kind: "assignment", dueDate: due, heldOn: null, studentDoneAt: null, scoreEarned: earned, scorePossible: possible, excused: false, gradedAt: earned === null ? null : stamp, updatedAt: stamp, ...o };
}
export function task(id: string, o: Partial<Task> = {}): Task {
  return { id, courseId: null, title: id, kind: "school", pinned: false, rank: 0, reason: null, suggestionKey: null, doneAt: null, createdAt: stamp, updatedAt: stamp, ...o };
}

export function bundle(): BundleLike {
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
