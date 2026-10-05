/**
 * Zod at the data boundary (ADR 0017): every row read from the database and
 * every form submitted to a server action is parsed here.
 */
import { z } from "zod";

// Any 8-4-4-4-12 UUID: Postgres accepts all versions, so the boundary does too.
const uuid = z.guid();
const num = z.coerce.number();
const numOrNull = z.union([z.null(), z.coerce.number()]);
const ts = z.string();

export const StudentRow = z
  .object({
    id: uuid, org_id: uuid, teacher_id: uuid, user_id: uuid.nullable(), email: z.string(),
    first_name: z.string(), last_initial: z.string(), grade_level: num, student_number: num,
    status: z.enum(["setup", "active", "archived"]), published_at: ts.nullable(), updated_at: ts,
  })
  .transform((r) => ({
    id: r.id, orgId: r.org_id, teacherId: r.teacher_id, userId: r.user_id, email: r.email,
    firstName: r.first_name, lastInitial: r.last_initial, gradeLevel: r.grade_level, studentNumber: r.student_number,
    status: r.status, publishedAt: r.published_at, updatedAt: r.updated_at,
  }));
export type Student = z.output<typeof StudentRow>;

export const GoalRow = z
  .object({
    id: uuid, school: z.string(), program: z.string(), application_year: numOrNull,
    target_six_avg: num, benchmark_note: z.string().nullable(), updated_at: ts,
  })
  .transform((r) => ({
    id: r.id, school: r.school, program: r.program, applicationYear: r.application_year,
    targetSixAvg: r.target_six_avg, benchmarkNote: r.benchmark_note, updatedAt: r.updated_at,
  }));
export type Goal = z.output<typeof GoalRow>;

export const CourseRow = z
  .object({
    id: uuid, code: z.string(), name: z.string(), term: z.string(),
    status: z.enum(["planned", "active", "completed"]), in_six_plan: z.boolean(),
    target_grade: numOrNull, active_syllabus_version_id: uuid.nullable(), position: num, updated_at: ts,
  })
  .transform((r) => ({
    id: r.id, code: r.code, name: r.name, term: r.term, status: r.status, inSixPlan: r.in_six_plan,
    targetGrade: r.target_grade, activeVersionId: r.active_syllabus_version_id, position: r.position, updatedAt: r.updated_at,
  }));
export type Course = z.output<typeof CourseRow>;

export const VersionRow = z
  .object({ id: uuid, course_id: uuid, version: num, confirmed_at: ts.nullable() })
  .transform((r) => ({ id: r.id, courseId: r.course_id, version: r.version, confirmedAt: r.confirmed_at }));
export type Version = z.output<typeof VersionRow>;

export const CategoryRow = z
  .object({
    id: uuid, course_id: uuid, syllabus_version_id: uuid, name: z.string(), weight: num,
    aggregation_method: z.enum(["mean_of_percentages", "pooled_points"]), needs_review: z.boolean(), position: num,
  })
  .transform((r) => ({
    id: r.id, courseId: r.course_id, versionId: r.syllabus_version_id, name: r.name, weight: r.weight,
    aggregationMethod: r.aggregation_method, needsReview: r.needs_review, position: r.position,
  }));
export type Category = z.output<typeof CategoryRow>;

export const AssessmentRow = z
  .object({
    id: uuid, course_id: uuid, category_id: uuid, title: z.string(), due_date: z.string().nullable(),
    student_done_at: ts.nullable(), score_earned: numOrNull, score_possible: num, excused: z.boolean(),
    graded_at: ts.nullable(), updated_at: ts,
  })
  .transform((r) => ({
    id: r.id, courseId: r.course_id, categoryId: r.category_id, title: r.title, dueDate: r.due_date,
    studentDoneAt: r.student_done_at, scoreEarned: r.score_earned, scorePossible: r.score_possible,
    excused: r.excused, gradedAt: r.graded_at, updatedAt: r.updated_at,
  }));
export type Assessment = z.output<typeof AssessmentRow>;

export const TaskRow = z
  .object({
    id: uuid, course_id: uuid.nullable(), title: z.string(), kind: z.enum(["school", "supplemental"]),
    pinned: z.boolean(), rank: num, reason: z.string().nullable(), suggestion_key: z.string().nullable(),
    done_at: ts.nullable(), created_at: ts, updated_at: ts,
  })
  .transform((r) => ({
    id: r.id, courseId: r.course_id, title: r.title, kind: r.kind, pinned: r.pinned, rank: r.rank,
    reason: r.reason, suggestionKey: r.suggestion_key, doneAt: r.done_at, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
export type Task = z.output<typeof TaskRow>;

export const FLAG_REASONS = ["score_differs", "returned", "other"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const FlagRow = z
  .object({
    id: uuid, assessment_id: uuid, reason: z.enum(FLAG_REASONS), created_at: ts, resolved_at: ts.nullable(),
  })
  .transform((r) => ({ id: r.id, assessmentId: r.assessment_id, reason: r.reason, createdAt: r.created_at, resolvedAt: r.resolved_at }));
export type Flag = z.output<typeof FlagRow>;

// Form inputs ------------------------------------------------------------------
// FormData values are strings; empty strings mean "not given".

const text = (max: number) => z.string().trim().min(1, "Required").max(max, `At most ${max} characters`);
const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v));
const optionalNumber = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Enter a number" });
      return z.NEVER;
    }
    return n;
  });
const requiredNumber = z
  .string()
  .trim()
  .min(1, "Required")
  .transform((v, ctx) => {
    const n = Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Enter a number" });
      return z.NEVER;
    }
    return n;
  });
const percentField = requiredNumber.pipe(z.number().min(0, "0 to 100").max(100, "0 to 100"));
const optionalPercent = optionalNumber.pipe(z.number().min(0).max(100).nullable());
const checkbox = z.union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()]).transform((v) => v === "on" || v === "true");
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").nullable());

export const StudentInput = z.object({
  firstName: text(50),
  lastInitial: z.string().trim().length(1, "One letter").regex(/^[A-Za-z]$/, "One letter").transform((v) => v.toUpperCase()),
  gradeLevel: requiredNumber.pipe(z.number().int().min(9).max(12)),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
});

export const GoalInput = z.object({
  school: text(120),
  program: text(120),
  applicationYear: optionalNumber.pipe(z.number().int().min(2020).max(2100).nullable()),
  targetSixAvg: percentField,
  benchmarkNote: optionalText(500),
});

export const CourseInput = z.object({
  code: text(20).transform((v) => v.toUpperCase()),
  name: text(120),
  term: optionalText(40).transform((v) => v ?? ""),
  status: z.enum(["planned", "active", "completed"]),
  inSixPlan: checkbox,
});

export const TargetInput = z.object({ targetGrade: optionalPercent });

export const CategoryInput = z.object({
  name: text(60),
  weight: requiredNumber.pipe(z.number().min(0, "0 to 100").max(100, "0 to 100")),
  aggregationMethod: z.enum(["mean_of_percentages", "pooled_points"]),
  needsReview: checkbox,
});

export const AssessmentInput = z.object({
  title: text(120),
  categoryId: z.guid("Pick a category"),
  dueDate: optionalDate,
  scorePossible: requiredNumber.pipe(z.number().gt(0, "Must be more than 0")),
  scoreEarned: optionalNumber.pipe(z.number().min(0, "Cannot be negative").nullable()),
});

export const ScoreInput = z.object({
  scoreEarned: optionalNumber.pipe(z.number().min(0, "Cannot be negative").nullable()),
  scorePossible: requiredNumber.pipe(z.number().gt(0, "Must be more than 0")),
  excused: checkbox,
});

export const TaskInput = z.object({
  title: text(160),
  kind: z.enum(["school", "supplemental"]),
  courseId: z.union([z.literal(""), z.guid()]).transform((v) => (v === "" ? null : v)),
  reason: optionalText(300),
  pinned: checkbox,
});

/** FormData to a plain object of strings, for Zod. */
export function formObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

/** The first message per field, for showing under inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
