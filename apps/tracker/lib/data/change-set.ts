/**
 * One shape for assessment edits, AI and manual alike (ADR 0027). Every item
 * is checked against the course's own rows before anything is written, with
 * the same bounds the forms and the database use.
 */
import { z } from "zod";
import type { Db } from "./client";
import { dbMessage } from "./errors";

// numeric(8, 3) in the schema.
const MAX_POINTS = 99999;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

export const AddAssessmentItem = z.object({
  op: z.literal("add_assessment"),
  title: z.string().trim().min(1, "Required").max(120, "At most 120 characters"),
  categoryId: z.guid("Pick a category"),
  dueDate: isoDate.nullable(),
  scorePossible: z.number().gt(0, "Must be more than 0").max(MAX_POINTS),
  scoreEarned: z.number().min(0, "Cannot be negative").max(MAX_POINTS).nullable(),
});

export const SetScoreItem = z.object({
  op: z.literal("set_score"),
  assessmentId: z.guid(),
  scoreEarned: z.number().min(0, "Cannot be negative").max(MAX_POINTS).nullable(),
  scorePossible: z.number().gt(0, "Must be more than 0").max(MAX_POINTS),
  excused: z.boolean(),
});

export const ChangeItem = z.discriminatedUnion("op", [AddAssessmentItem, SetScoreItem]);
export type ChangeItem = z.output<typeof ChangeItem>;

export type CourseContext = {
  courseId: string;
  orgId: string;
  studentId: string;
  /** Categories of the course's active syllabus version. */
  categories: { id: string; name: string }[];
  assessments: { id: string; title: string; scoreEarned: number | null; scorePossible: number; excused: boolean }[];
};

/** Why an item can't be applied to this course, or null when it can. */
export function itemProblem(item: ChangeItem, ctx: CourseContext): string | null {
  if (item.op === "add_assessment") {
    return ctx.categories.some((c) => c.id === item.categoryId) ? null : "Pick a category from this course.";
  }
  return ctx.assessments.some((a) => a.id === item.assessmentId) ? null : "That assessment is not in this course.";
}

const ContextRows = z.object({
  course: z.object({ org_id: z.guid(), student_id: z.guid(), active_syllabus_version_id: z.guid().nullable() }),
  categories: z.array(z.object({ id: z.guid(), name: z.string(), syllabus_version_id: z.guid() })),
  assessments: z.array(
    z.object({ id: z.guid(), title: z.string(), score_earned: z.union([z.null(), z.coerce.number()]), score_possible: z.coerce.number(), excused: z.boolean() }),
  ),
});

/** The course's rows that items are checked against. null when RLS hides the course. */
export async function loadCourseContext(db: Db, courseId: string): Promise<CourseContext | null> {
  const t = db.tracker;
  const [course, categories, assessments] = await Promise.all([
    t.from("courses").select("org_id, student_id, active_syllabus_version_id").eq("id", courseId).maybeSingle(),
    t.from("categories").select("id, name, syllabus_version_id").eq("course_id", courseId).order("position"),
    t.from("assessments").select("id, title, score_earned, score_possible, excused").eq("course_id", courseId).order("due_date", { nullsFirst: false }).order("title"),
  ]);
  if (course.error || categories.error || assessments.error) throw new Error((course.error ?? categories.error ?? assessments.error)?.message);
  if (!course.data) return null;
  const rows = ContextRows.parse({ course: course.data, categories: categories.data ?? [], assessments: assessments.data ?? [] });
  return {
    courseId,
    orgId: rows.course.org_id,
    studentId: rows.course.student_id,
    categories: rows.categories.filter((c) => c.syllabus_version_id === rows.course.active_syllabus_version_id).map((c) => ({ id: c.id, name: c.name })),
    assessments: rows.assessments.map((a) => ({ id: a.id, title: a.title, scoreEarned: a.score_earned, scorePossible: a.score_possible, excused: a.excused })),
  };
}

export type ApplyResult = { applied: number; error: string | null };

/**
 * Validate every item, then write them one by one. Stops at the first
 * failure and says how many were saved; nothing is reported as saved that
 * wasn't (non-negotiable 6).
 */
export async function applyChangeSet(db: Db, ctx: CourseContext, items: readonly ChangeItem[]): Promise<ApplyResult> {
  for (const item of items) {
    const parsed = ChangeItem.safeParse(item);
    if (!parsed.success) return { applied: 0, error: parsed.error.issues[0]?.message ?? "A change is not valid." };
    const problem = itemProblem(parsed.data, ctx);
    if (problem) return { applied: 0, error: problem };
  }

  let applied = 0;
  for (const item of items) {
    const { error, missing } =
      item.op === "add_assessment"
        ? await insertAssessment(db, ctx, item)
        : await updateScore(db, ctx, item);
    if (error || missing) {
      const why = missing ? "That assessment was removed." : dbMessage(error);
      return { applied, error: applied > 0 ? `Saved ${applied} of ${items.length}. Then: ${why}` : why };
    }
    applied++;
  }
  return { applied, error: null };
}

type WriteOutcome = { error: { code?: string | null; message?: string | null } | null; missing: boolean };

async function insertAssessment(db: Db, ctx: CourseContext, item: z.output<typeof AddAssessmentItem>): Promise<WriteOutcome> {
  const { error } = await db.tracker.from("assessments").insert({
    org_id: ctx.orgId, student_id: ctx.studentId, course_id: ctx.courseId, category_id: item.categoryId,
    title: item.title, due_date: item.dueDate, score_possible: item.scorePossible, score_earned: item.scoreEarned,
  });
  return { error, missing: false };
}

async function updateScore(db: Db, ctx: CourseContext, item: z.output<typeof SetScoreItem>): Promise<WriteOutcome> {
  const { data, error } = await db.tracker
    .from("assessments")
    .update({ score_earned: item.scoreEarned, score_possible: item.scorePossible, excused: item.excused })
    .eq("id", item.assessmentId)
    .eq("course_id", ctx.courseId)
    .select("id");
  return { error, missing: !error && (data ?? []).length === 0 };
}
