import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import type { StudentContext } from "../data/change-set";
import { AiWireOutput, buildUserMessage, fromWire, stripPersonalData, toDraftItems, type AiOutput, type PromptStudent } from "./prompt";

const COURSE = "30000000-0000-0000-0000-000000000001";
const LOCKED = "30000000-0000-0000-0000-000000000002";
const V1 = "40000000-0000-0000-0000-000000000001";
const V2 = "40000000-0000-0000-0000-000000000002";
const CAT_TESTS = "50000000-0000-0000-0000-000000000001";
const CAT_LABS = "50000000-0000-0000-0000-000000000002";
const CAT_OLD = "50000000-0000-0000-0000-000000000009";
const CAT_LOCKED = "50000000-0000-0000-0000-000000000003";
const A_TEST = "60000000-0000-0000-0000-000000000001";
const A_LAB = "60000000-0000-0000-0000-000000000002";
const TASK = "70000000-0000-0000-0000-000000000001";

const student: PromptStudent = {
  goal: { school: "University of Waterloo", program: "Software Engineering", applicationYear: 2027, targetSixAvg: 95, benchmarkNote: null },
  courses: [
    { id: COURSE, code: "SCH4U", name: "Chemistry", term: "Fall", status: "active", inSixPlan: true, targetGrade: 90, activeVersionId: V1 },
    { id: LOCKED, code: "MHF4U", name: "Functions", term: "", status: "active", inSixPlan: true, targetGrade: null, activeVersionId: V2 },
  ],
  versions: [{ id: V1, confirmedAt: null }, { id: V2, confirmedAt: "2026-10-01T00:00:00Z" }],
  categories: [
    { id: CAT_TESTS, courseId: COURSE, versionId: V1, name: "Tests", weight: 70, aggregationMethod: "mean_of_percentages", needsReview: false },
    { id: CAT_LABS, courseId: COURSE, versionId: V1, name: "Labs", weight: 30, aggregationMethod: "mean_of_percentages", needsReview: false },
    { id: CAT_OLD, courseId: COURSE, versionId: "40000000-0000-0000-0000-000000000000", name: "Old version", weight: 100, aggregationMethod: "mean_of_percentages", needsReview: false },
    { id: CAT_LOCKED, courseId: LOCKED, versionId: V2, name: "Overall", weight: 100, aggregationMethod: "mean_of_percentages", needsReview: false },
  ],
  assessments: [
    { id: A_TEST, courseId: COURSE, categoryId: CAT_TESTS, title: "Unit 1 Test", dueDate: null, scoreEarned: null, scorePossible: 40, excused: false },
    { id: A_LAB, courseId: COURSE, categoryId: CAT_LABS, title: "Lab 1", dueDate: "2026-10-01", scoreEarned: 18, scorePossible: 20, excused: false },
  ],
  tasks: [
    { id: TASK, courseId: COURSE, title: "Review moles", kind: "school", reason: null, pinned: false, doneAt: null },
    { id: "70000000-0000-0000-0000-000000000002", courseId: null, title: "Done already", kind: "school", reason: null, pinned: false, doneAt: "2026-10-01T00:00:00Z" },
  ],
};

const ctx: StudentContext = {
  studentId: "20000000-0000-0000-0000-000000000001",
  orgId: "10000000-0000-0000-0000-000000000001",
  courses: student.courses.map((c) => ({ ...c, confirmed: c.id === LOCKED })),
  categories: student.categories,
  assessments: student.assessments,
  tasks: student.tasks.filter((t) => t.doneAt === null).map((t, rank) => ({ ...t, rank })),
};

type AiWireOutputItem = AiWireOutput["items"][number];

const row = (o: Partial<AiOutput["items"][number]>): AiOutput["items"][number] => ({
  op: "update_assessment", ref: null, new_ref: null, course: null, category: null,
  school: null, program: null, application_year: null, target_six_avg: null, benchmark_note: null,
  code: null, name: null, term: null, status: null, in_six_plan: null, target_grade: null,
  weight: null, aggregation_method: null, needs_review: null,
  title: null, due_date: null, score_earned: null, score_possible: null, excused: null,
  kind: null, reason: null, pinned: null, certain: true, source: "line", ...o,
});

describe("stripPersonalData", () => {
  it("replaces the first name, with or without the last initial, in any case", () => {
    expect(stripPersonalData("Sam L. got 31/40. SAM did well. Samuel is someone else.", "Sam", "L")).toBe(
      "the student got 31/40. the student did well. Samuel is someone else.",
    );
  });
  it("handles accented names and names with regex characters", () => {
    expect(stripPersonalData("Zoë: 18/20", "Zoë", "K")).toBe("the student: 18/20");
    expect(stripPersonalData("A.J. scored 9", "A.J.", "B")).toBe("the student scored 9");
  });
  it("removes email addresses", () => {
    expect(stripPersonalData("From sam.l@school.ca: Unit 1 31/40", "Sam", "L")).toBe("From [email]: Unit 1 31/40");
  });
});

describe("buildUserMessage", () => {
  const { text, refs } = buildUserMessage(student, "Unit 1 Test 31/40", COURSE, 2);
  it("uses refs, not row ids, and only the active syllabus's categories", () => {
    expect(text).toContain('"ref": "C1"');
    expect(text).toContain('"ref": "K2"');
    expect(text).toContain('"ref": "A2"');
    expect(text).toContain('"ref": "T1"');
    expect(text).toContain('"ref": "G"');
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(text).not.toContain("Old version");
    expect(text).not.toContain("Done already");
    expect(refs.courses.get("C2")).toBe(LOCKED);
    expect(refs.categories.get("K3")).toBe(CAT_LOCKED);
    expect(refs.assessments.get("A1")).toBe(A_TEST);
    expect(refs.tasks.get("T1")).toBe(TASK);
  });
  it("says which course the teacher is looking at, how many files came, and marks the confirmed syllabus", () => {
    expect(text).toContain("looking at course C1");
    expect(text).toContain("2 attached files are the material.");
    expect(text).toContain('"syllabus_confirmed": true');
    expect(text).toContain("<sent>\nUnit 1 Test 31/40\n</sent>");
  });
  it("says so when only files were sent", () => {
    expect(buildUserMessage(student, "   ", null, 1).text).toContain("The tutor sent no words, only the attached material.");
  });
});

describe("toDraftItems", () => {
  const draft = (items: AiOutput["items"], unmatched: string[] = []) =>
    toDraftItems({ items, unmatched }, buildUserMessage(student, "x").refs, ctx, student.goal);

  it("maps scores, new work and tasks to change items, carrying source and certainty", () => {
    const out = draft([
      row({ op: "update_assessment", ref: "A1", score_earned: 31, score_possible: 40, source: "Unit 1 Test 31/40" }),
      row({ op: "add_assessment", course: "C1", category: "K2", title: "Lab 2", due_date: "2026-10-20", score_possible: 20, certain: false, source: "Lab 2 due Oct 20" }),
      row({ op: "add_task", course: "C1", title: "Redo the stoichiometry sheet", kind: "supplemental", source: "extra practice" }),
    ]);
    expect(out.notes).toEqual([]);
    expect(out.items).toEqual([
      { op: "update_assessment", assessmentId: A_TEST, scoreEarned: 31, source: "Unit 1 Test 31/40", certain: true },
      { op: "add_assessment", courseId: COURSE, categoryId: CAT_LABS, title: "Lab 2", dueDate: "2026-10-20", scorePossible: 20, scoreEarned: null, excused: false, source: "Lab 2 due Oct 20", certain: false },
      { op: "add_task", courseId: COURSE, title: "Redo the stoichiometry sheet", kind: "supplemental", reason: null, pinned: false, source: "extra practice", certain: true },
    ]);
  });

  it("finds the course from the category when the model gives only the category", () => {
    const out = draft([row({ op: "add_assessment", category: "K1", title: "Quiz", score_earned: 9, score_possible: 10 })]);
    expect(out.items[0]).toMatchObject({ op: "add_assessment", courseId: COURSE, categoryId: CAT_TESTS, scoreEarned: 9 });
  });

  it("links a new course, its categories and its first mark through new_ref", () => {
    const out = draft([
      row({ op: "add_course", new_ref: "N1", code: "sph4u", name: "Physics", target_grade: 88, source: "taking physics, aiming for 88" }),
      row({ op: "add_category", course: "N1", new_ref: "N2", name: "Tests", weight: 60 }),
      row({ op: "add_category", course: "N1", name: "Labs", weight: 40 }),
      row({ op: "add_assessment", course: "N1", category: "N2", title: "Unit 1 Test", score_earned: 42, score_possible: 50 }),
      row({ op: "add_task", course: "N1", title: "Read chapter 2" }),
    ]);
    expect(out.notes).toEqual([]);
    expect(out.items.map((i) => i.op)).toEqual(["add_course", "add_category", "add_category", "add_assessment", "add_task"]);
    expect(out.items[0]).toMatchObject({ code: "SPH4U", name: "Physics", targetGrade: 88, status: "active", inSixPlan: true });
    expect(out.items[1]).toMatchObject({ courseId: "$0", name: "Tests", weight: 60 });
    expect(out.items[3]).toMatchObject({ courseId: "$0", categoryId: "$1", scoreEarned: 42, scorePossible: 50 });
    expect(out.items[4]).toMatchObject({ courseId: "$0" });
  });

  it("fills the goal from the current one when the model gives only what changed", () => {
    const out = draft([row({ op: "set_goal", target_six_avg: 93, source: "lowering the target to 93" })]);
    expect(out.items[0]).toMatchObject({ op: "set_goal", school: "University of Waterloo", program: "Software Engineering", applicationYear: 2027, targetSixAvg: 93 });
  });

  it("drops what does not change anything, and a second change to the same row", () => {
    const out = draft([
      row({ op: "update_assessment", ref: "A2", score_earned: 18, score_possible: 20 }),
      row({ op: "set_goal", school: "University of Waterloo", program: "Software Engineering", target_six_avg: 95, application_year: 2027 }),
      row({ op: "update_course", ref: "C1", code: "SCH4U", target_grade: 90 }),
      row({ op: "update_assessment", ref: "A1", score_earned: 30, score_possible: 40 }),
      row({ op: "update_assessment", ref: "A1", score_earned: 35, score_possible: 40 }),
    ]);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ assessmentId: A_TEST, scoreEarned: 30 });
    expect(out.notes).toEqual([]);
  });

  it("keeps only the fields of an update that differ from the row", () => {
    const out = draft([row({ op: "update_course", ref: "C1", code: "SCH4U", name: "Chemistry", status: "completed", target_grade: 90 })]);
    expect(out.items[0]).toEqual({ op: "update_course", courseId: COURSE, status: "completed", source: "line", certain: true });
  });

  it("sends anything it cannot place or that is out of range to notes, never to items", () => {
    const out = draft(
      [
        row({ op: "update_assessment", ref: "A9", score_earned: 1, score_possible: 10, source: "no such ref" }),
        row({ op: "add_assessment", course: "C1", category: "K9", title: "X", score_possible: 10, source: "bad category" }),
        row({ op: "add_assessment", course: "C1", category: "K1", title: "", score_possible: 10, source: "no title" }),
        row({ op: "add_assessment", course: "C1", category: "K1", title: "Quiz", score_possible: 0, source: "zero possible" }),
        row({ op: "add_category", course: "C2", name: "Labs", weight: 10, source: "locked syllabus" }),
        row({ op: "add_assessment", course: "C1", category: "N7", title: "Quiz", score_possible: 10, source: "unknown new_ref" }),
        row({ op: "remove_task", ref: "T1", source: "drop the task" }),
      ],
      ["Field trip money due Friday"],
    );
    expect(out.items).toEqual([{ op: "remove_task", taskId: TASK, source: "drop the task", certain: true }]);
    expect(out.notes).toEqual([
      "Field trip money due Friday",
      "no such ref (no such assessment)",
      "bad category (no category matched)",
      "no title (Required)",
      "zero possible (Must be more than 0)",
      "locked syllabus (MHF4U's syllabus was confirmed at publish and can't be changed yet.)",
      "unknown new_ref (no category matched)",
    ]);
  });

  it("treats a percentage as out of 100, a blank date as none, and a score as not excused", () => {
    const out = draft([
      row({ op: "update_assessment", ref: "A1", score_earned: 35, excused: null }),
      row({ op: "add_assessment", course: "C1", category: "K1", title: "Quiz", due_date: "Oct 3", score_earned: 88 }),
    ]);
    expect(out.items[0]).toMatchObject({ op: "update_assessment", scoreEarned: 35 });
    expect(out.items[0]).not.toHaveProperty("scorePossible");
    expect(out.items[1]).toMatchObject({ op: "add_assessment", dueDate: null, scorePossible: 100, scoreEarned: 88 });
  });
});

describe("the answer schema sent to the API", () => {
  type Schema = { anyOf?: unknown[]; type?: unknown; properties?: Record<string, Schema>; required?: string[]; items?: Schema; $defs?: Record<string, Schema> };
  // Walk every object property in the schema the SDK actually sends.
  const params = (s: Schema, out: { schema: Schema; required: boolean }[] = []) => {
    for (const [key, child] of Object.entries(s.properties ?? {})) {
      out.push({ schema: child, required: (s.required ?? []).includes(key) });
      params(child, out);
    }
    if (s.items) params(s.items, out);
    for (const def of Object.values(s.$defs ?? {})) params(def, out);
    return out;
  };
  const all = params(betaZodOutputFormat(AiWireOutput).schema as Schema);

  // The API rejects every request (400) past these limits, files or not.
  it("has at most 16 union-typed parameters", () => {
    expect(all.filter((p) => p.schema.anyOf || Array.isArray(p.schema.type)).length).toBeLessThanOrEqual(16);
  });
  it("has at most 24 optional parameters", () => {
    expect(all.filter((p) => !p.required).length).toBeLessThanOrEqual(24);
  });
});

describe("fromWire", () => {
  it("reads empty text and empty choices as not given, and keeps the rest", () => {
    const wire = {
      ...row({ op: "add_course", code: "SBI4U", status: "active", in_six_plan: true }),
      ref: "", new_ref: " N1 ", course: "", category: "", school: "", program: "", benchmark_note: "",
      code: "SBI4U", name: "", term: " ", status: "active", aggregation_method: "", title: "", due_date: "", kind: "", reason: "",
    } as AiWireOutputItem;
    const out = fromWire({ items: [wire], unmatched: ["x"] });
    expect(out.unmatched).toEqual(["x"]);
    expect(out.items[0]).toMatchObject({ op: "add_course", new_ref: "N1", code: "SBI4U", status: "active", in_six_plan: true });
    for (const key of ["ref", "course", "name", "term", "aggregation_method", "kind", "due_date"] as const) expect(out.items[0][key]).toBeNull();
  });
});
