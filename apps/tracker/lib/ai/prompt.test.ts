import { describe, expect, it } from "vitest";
import type { CourseContext } from "../data/change-set";
import { buildUserMessage, stripPersonalData, toDraftItems, type AiOutput } from "./prompt";

const CAT_TESTS = "50000000-0000-0000-0000-000000000001";
const CAT_LABS = "50000000-0000-0000-0000-000000000002";
const CAT_OLD = "50000000-0000-0000-0000-000000000009";
const A_TEST = "60000000-0000-0000-0000-000000000001";
const A_LAB = "60000000-0000-0000-0000-000000000002";

const ctx: CourseContext = {
  courseId: "30000000-0000-0000-0000-000000000001",
  orgId: "10000000-0000-0000-0000-000000000001",
  studentId: "20000000-0000-0000-0000-000000000001",
  categories: [
    { id: CAT_TESTS, name: "Tests" },
    { id: CAT_LABS, name: "Labs" },
  ],
  assessments: [
    { id: A_TEST, title: "Unit 1 Test", scoreEarned: null, scorePossible: 40, excused: false },
    { id: A_LAB, title: "Lab 1", scoreEarned: 18, scorePossible: 20, excused: false },
  ],
};
const course = {
  code: "SCH4U",
  name: "Chemistry",
  categories: [
    { id: CAT_TESTS, name: "Tests", weight: 70 },
    { id: CAT_LABS, name: "Labs", weight: 30 },
    { id: CAT_OLD, name: "Old version", weight: 100 },
  ],
};

const row = (o: Partial<AiOutput["items"][number]>): AiOutput["items"][number] => ({
  op: "set_score", assessment: null, category: null, title: null, due_date: null,
  score_earned: null, score_possible: null, excused: null, source: "line", ...o,
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
  const { text, refs } = buildUserMessage(course, ctx, "Unit 1 Test 31/40");
  it("uses refs, not row ids, and only the active syllabus's categories", () => {
    expect(text).toContain('"ref": "A1"');
    expect(text).toContain('"ref": "C2"');
    expect(text).not.toContain(A_TEST);
    expect(text).not.toContain(CAT_TESTS);
    expect(text).not.toContain("Old version");
    expect(refs.assessments.get("A2")).toBe(A_LAB);
    expect(refs.categories.get("C1")).toBe(CAT_TESTS);
  });
  it("puts the pasted text last, fenced", () => {
    expect(text.endsWith("<pasted>\nUnit 1 Test 31/40\n</pasted>")).toBe(true);
  });
});

describe("toDraftItems", () => {
  const { refs } = buildUserMessage(course, ctx, "");

  it("maps refs back to rows and keeps the source line", () => {
    const out = toDraftItems(
      {
        items: [
          row({ assessment: "A1", score_earned: 31, score_possible: 40, source: "Unit 1 Test 31/40" }),
          row({ op: "add_assessment", category: "C2", title: "Lab 2", due_date: "2026-10-20", score_earned: null, score_possible: 25, source: "Lab 2 due Oct 20" }),
        ],
        unmatched: ["Field trip form"],
      },
      refs,
      ctx,
    );
    expect(out.items).toEqual([
      { op: "set_score", assessmentId: A_TEST, scoreEarned: 31, scorePossible: 40, excused: false, source: "Unit 1 Test 31/40" },
      { op: "add_assessment", title: "Lab 2", categoryId: CAT_LABS, dueDate: "2026-10-20", scorePossible: 25, scoreEarned: null, source: "Lab 2 due Oct 20" },
    ]);
    expect(out.notes).toEqual(["Field trip form"]);
  });

  it("sends anything it cannot trust to notes, never to items", () => {
    const out = toDraftItems(
      {
        items: [
          row({ assessment: "A9", score_earned: 10, score_possible: 10, source: "made-up ref" }),
          row({ assessment: A_TEST, score_earned: 10, score_possible: 10, source: "a raw id" }),
          row({ op: "add_assessment", category: "C9", title: "X", score_possible: 10, source: "bad category" }),
          row({ assessment: "A1", score_earned: -5, score_possible: 40, source: "negative" }),
          row({ assessment: "A1", score_earned: 5, score_possible: 0, source: "zero total" }),
          row({ op: "add_assessment", category: "C1", title: "", score_possible: 10, source: "no title" }),
        ],
        unmatched: [],
      },
      refs,
      ctx,
    );
    expect(out.items).toEqual([]);
    expect(out.notes).toEqual(["made-up ref", "a raw id", "bad category", "negative", "zero total", "no title"]);
  });

  it("drops a score that would not change, and a second change to the same row", () => {
    const out = toDraftItems(
      {
        items: [
          row({ assessment: "A2", score_earned: 18, score_possible: 20, source: "Lab 1 18/20" }),
          row({ assessment: "A1", score_earned: 30, score_possible: 40, source: "first" }),
          row({ assessment: "A1", score_earned: 31, score_possible: 40, source: "second" }),
        ],
        unmatched: [],
      },
      refs,
      ctx,
    );
    expect(out.items.map((i) => i.source)).toEqual(["first"]);
  });

  it("defaults: a missing total keeps the current one; a bad date becomes no date", () => {
    const out = toDraftItems(
      {
        items: [
          row({ assessment: "A1", score_earned: 35, score_possible: null, source: "Unit 1: 35" }),
          row({ op: "add_assessment", category: "C1", title: "Quiz", due_date: "Oct 3", score_earned: 9, score_possible: null, source: "Quiz 9%" }),
        ],
        unmatched: [],
      },
      refs,
      ctx,
    );
    expect(out.items[0]).toMatchObject({ op: "set_score", scorePossible: 40, scoreEarned: 35 });
    expect(out.items[1]).toMatchObject({ op: "add_assessment", dueDate: null, scorePossible: 100 });
  });
});
