import { describe, expect, it } from "vitest";
import { ChangeItem, dependencies, itemProblem, subsetChangeSet, validateChangeSet, type StudentContext } from "./change-set";

const COURSE = "30000000-0000-0000-0000-000000000001";
const LOCKED = "30000000-0000-0000-0000-000000000002";
const V1 = "40000000-0000-0000-0000-000000000001";
const V2 = "40000000-0000-0000-0000-000000000002";
const CAT_TESTS = "50000000-0000-0000-0000-000000000001";
const CAT_OLD = "50000000-0000-0000-0000-000000000009";
const CAT_LOCKED = "50000000-0000-0000-0000-000000000002";
const A_TEST = "60000000-0000-0000-0000-000000000001";
const TASK = "70000000-0000-0000-0000-000000000001";
const OTHER = "99999999-0000-0000-0000-000000000001";

const ctx: StudentContext = {
  studentId: "20000000-0000-0000-0000-000000000001",
  orgId: "10000000-0000-0000-0000-000000000001",
  courses: [
    { id: COURSE, code: "SCH4U", name: "Chemistry", term: "", status: "active", inSixPlan: true, targetGrade: 90, activeVersionId: V1, confirmed: false },
    { id: LOCKED, code: "MHF4U", name: "Functions", term: "", status: "active", inSixPlan: true, targetGrade: null, activeVersionId: V2, confirmed: true },
  ],
  categories: [
    { id: CAT_TESTS, courseId: COURSE, versionId: V1, name: "Tests", weight: 70, aggregationMethod: "mean_of_percentages", needsReview: false },
    { id: CAT_OLD, courseId: COURSE, versionId: "40000000-0000-0000-0000-000000000000", name: "Old", weight: 100, aggregationMethod: "mean_of_percentages", needsReview: false },
    { id: CAT_LOCKED, courseId: LOCKED, versionId: V2, name: "Overall", weight: 100, aggregationMethod: "mean_of_percentages", needsReview: false },
  ],
  assessments: [{ id: A_TEST, courseId: COURSE, categoryId: CAT_TESTS, title: "Unit 1 Test", dueDate: null, scoreEarned: null, scorePossible: 40, excused: false }],
  tasks: [{ id: TASK, courseId: null, title: "Review", kind: "school", reason: null, pinned: false, rank: 0 }],
};

describe("ChangeItem", () => {
  it("uses the form bounds and fills defaults", () => {
    const item = ChangeItem.parse({ op: "add_course", code: "mhf4u", name: "Functions" });
    expect(item).toMatchObject({ code: "MHF4U", term: "", status: "active", inSixPlan: true, targetGrade: null });
    expect(ChangeItem.safeParse({ op: "add_assessment", courseId: COURSE, categoryId: CAT_TESTS, title: "Quiz", scorePossible: 0 }).success).toBe(false);
    expect(ChangeItem.safeParse({ op: "set_goal", school: "UW", program: "SE", applicationYear: null, targetSixAvg: 150, benchmarkNote: null }).success).toBe(false);
  });
  it("refuses an update that changes nothing", () => {
    expect(ChangeItem.safeParse({ op: "update_course", courseId: COURSE }).success).toBe(false);
    expect(ChangeItem.safeParse({ op: "update_course", courseId: COURSE, targetGrade: null }).success).toBe(true);
  });
});

describe("itemProblem", () => {
  it("accepts rows of this student and refuses others", () => {
    expect(itemProblem({ op: "update_assessment", assessmentId: A_TEST, scoreEarned: 31, scorePossible: 40, excused: false }, ctx)).toBeNull();
    expect(itemProblem({ op: "update_assessment", assessmentId: OTHER, scoreEarned: 31 }, ctx)).toBe("That assessment is not this student's.");
    expect(itemProblem({ op: "remove_task", taskId: OTHER }, ctx)).toBe("That task is not this student's.");
  });
  it("wants a category from the course's active syllabus", () => {
    const base = { op: "add_assessment" as const, courseId: COURSE, title: "Quiz", dueDate: null, scorePossible: 10, scoreEarned: null, excused: false };
    expect(itemProblem({ ...base, categoryId: CAT_TESTS }, ctx)).toBeNull();
    expect(itemProblem({ ...base, categoryId: CAT_OLD }, ctx)).toBe("Pick a category from this course.");
    expect(itemProblem({ ...base, categoryId: CAT_LOCKED }, ctx)).toBe("Pick a category from this course.");
  });
  it("refuses category changes on a confirmed syllabus before the database does", () => {
    expect(itemProblem({ op: "add_category", courseId: LOCKED, name: "Labs", weight: 10, aggregationMethod: "mean_of_percentages", needsReview: false }, ctx)).toMatch(/MHF4U's syllabus was confirmed/);
    expect(itemProblem({ op: "update_category", categoryId: CAT_LOCKED, weight: 90 }, ctx)).toMatch(/confirmed/);
    expect(itemProblem({ op: "update_category", categoryId: CAT_TESTS, weight: 60 }, ctx)).toBeNull();
  });
  it("resolves $k refs against earlier items of the right kind", () => {
    const course: ChangeItem = { op: "add_course", code: "SPH4U", name: "Physics", term: "", status: "active", inSixPlan: true, targetGrade: 88 };
    const category = { op: "add_category" as const, courseId: "$0", name: "Tests", weight: 100, aggregationMethod: "mean_of_percentages" as const, needsReview: false };
    const work = { op: "add_assessment" as const, courseId: "$0", categoryId: "$1", title: "Unit 1", dueDate: null, scorePossible: 50, scoreEarned: 45, excused: false };
    const items: ChangeItem[] = [course, category, work];
    expect(validateChangeSet(items, ctx).error).toBeNull();
    expect(itemProblem(work, ctx, items, 2)).toBeNull();
    expect(itemProblem({ ...work, courseId: "$1" }, ctx, items, 2)).toMatch(/refers to a course that is not added before it/);
    expect(itemProblem({ ...category, courseId: "$1" }, ctx, items, 1)).toMatch(/not added before it/);
    expect(itemProblem({ ...work, courseId: COURSE }, ctx, items, 2)).toBe("Pick a category from this course.");
    expect(dependencies(work)).toEqual([0, 1]);
  });
});

describe("validateChangeSet", () => {
  it("names the first bad item", () => {
    const { error } = validateChangeSet([{ op: "add_course", code: "X", name: "Y" }, { op: "add_task", title: "" }], ctx);
    expect(error).toBe("Change 2: Required");
  });
});

describe("subsetChangeSet", () => {
  const items: ChangeItem[] = [
    { op: "add_course", code: "SPH4U", name: "Physics", term: "", status: "active", inSixPlan: true, targetGrade: null },
    { op: "update_task", taskId: TASK, pinned: true },
    { op: "add_category", courseId: "$0", name: "Tests", weight: 100, aggregationMethod: "mean_of_percentages", needsReview: false },
    { op: "add_assessment", courseId: "$0", categoryId: "$2", title: "Unit 1", dueDate: null, scorePossible: 50, scoreEarned: null, excused: false },
  ];
  it("keeps the selected items with their dependencies and renumbers refs", () => {
    const subset = subsetChangeSet(items, [3]);
    expect(subset.map((i) => i.op)).toEqual(["add_course", "add_category", "add_assessment"]);
    expect(subset[1]).toMatchObject({ courseId: "$0" });
    expect(subset[2]).toMatchObject({ courseId: "$0", categoryId: "$1" });
    expect(validateChangeSet(subset, ctx).error).toBeNull();
  });
  it("leaves out what was not selected and ignores unknown positions", () => {
    expect(subsetChangeSet(items, [1, 9]).map((i) => i.op)).toEqual(["update_task"]);
    expect(subsetChangeSet(items, [])).toEqual([]);
  });
});
