"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateSyllabus } from "@/lib/domain/grades";
import { orderTasks } from "@/lib/domain/priorities";
import { CATEGORY_PROBLEM, applyChangeSet, contextFromBundle, type ChangeItem, type StudentContext } from "@/lib/data/change-set";
import { dbMessage } from "@/lib/data/errors";
import { getViewer, loadBundle } from "@/lib/data/queries";
import {
  AssessmentInput, CategoryInput, CourseInput, GoalInput, ScoreInput, StudentInput, TargetInput, TaskInput,
  fieldErrors, formObject,
} from "@/lib/data/schemas";
import { failed, type Result } from "@/lib/result";
import { todayIso } from "@/lib/time";
import { buildStudentView } from "@/lib/view/student-view";
import { z } from "zod";

// Every action: Zod first, then the signed-in staff member's own client, so
// RLS has the final say. Nothing here uses a service-role key. Edits to the
// student's data go through the one change-set path (ADRs 0027, 0029).

type Staff = Extract<Awaited<ReturnType<typeof getViewer>>, { kind: "staff" }>;

async function staff(): Promise<Staff | null> {
  const viewer = await getViewer();
  return viewer.kind === "staff" ? viewer : null;
}

function parse<T extends z.ZodTypeAny>(schema: T, form: FormData): { ok: true; data: z.output<T> } | { ok: false; result: Result } {
  const parsed = schema.safeParse(formObject(form));
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, result: failed("Check the highlighted fields.", fieldErrors(parsed.error)) };
}

const NO_ACCESS = failed("You don't have access to that.");

function done(message = "Saved"): Result {
  revalidatePath("/", "layout");
  return { ok: true, message };
}

/** org_id, student_id (and course_id) of a row the caller can see. */
async function parent(v: Staff, table: string, id: string) {
  const columns = table === "students" ? "org_id, student_id:id" : table === "courses" ? "org_id, student_id, course_id:id" : "org_id, student_id, course_id";
  const { data } = await v.db.tracker.from(table).select(columns).eq("id", id).maybeSingle();
  return (data as { org_id: string; student_id: string; course_id?: string } | null) ?? null;
}

/** The student's rows a change set is checked against, or null when hidden. */
async function context(v: Staff, studentId: string): Promise<StudentContext | null> {
  if (!z.guid().safeParse(studentId).success) return null;
  const bundle = await loadBundle(v.db, studentId).catch(() => null);
  return bundle ? contextFromBundle(bundle) : null;
}

/** A one-item change set, the same path an AI draft takes. */
async function applyOne(v: Staff, studentId: string, item: ChangeItem, message: string): Promise<Result> {
  const ctx = await context(v, studentId);
  if (!ctx) return NO_ACCESS;
  const { error } = await applyChangeSet(v.db, ctx, [item]);
  return error ? failed(error) : done(message);
}

/** The same, for a row whose student we look up first. */
async function applyToRow(v: Staff, table: string, id: string, item: ChangeItem, message: string): Promise<Result> {
  const p = await parent(v, table, id);
  if (!p) return NO_ACCESS;
  return applyOne(v, p.student_id, item, message);
}

// Students ---------------------------------------------------------------------

export async function createStudent(form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(StudentInput, form);
  if (!input.ok) return input.result;
  const { data, error } = await v.db.tracker
    .from("students")
    .insert({
      org_id: v.orgId, teacher_id: v.userId, email: input.data.email, first_name: input.data.firstName,
      last_initial: input.data.lastInitial, grade_level: input.data.gradeLevel,
    })
    .select("id")
    .single();
  if (error || !data) {
    return error?.code === "23505" ? failed("A student with that email already exists.", { email: "Already used" }) : failed(dbMessage(error));
  }
  revalidatePath("/", "layout");
  redirect(`/students/${data.id as string}/setup/goal`);
}

export async function updateStudent(studentId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(StudentInput, form);
  if (!input.ok) return input.result;
  const { error } = await v.db.tracker
    .from("students")
    .update({ email: input.data.email, first_name: input.data.firstName, last_initial: input.data.lastInitial, grade_level: input.data.gradeLevel })
    .eq("id", studentId);
  return error ? failed(dbMessage(error)) : done();
}

export async function saveGoal(studentId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(GoalInput, form);
  if (!input.ok) return input.result;
  return applyOne(v, studentId, { op: "set_goal", ...input.data }, "Saved");
}

/**
 * Publish (wizard review step): confirm every course's syllabus, then make the
 * student visible. The database refuses a syllabus whose weights don't add up
 * to 100, so a refusal here stops before the student can see anything.
 */
export async function publishStudent(studentId: string): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const bundle = await loadBundle(v.db, studentId);
  if (!bundle) return NO_ACCESS;
  if (!bundle.goal) return failed("Add a goal before publishing.");
  if (bundle.courses.length === 0) return failed("Add at least one course before publishing.");
  for (const course of bundle.courses) {
    const categories = bundle.categories.filter((c) => c.versionId === course.activeVersionId);
    if (!course.activeVersionId || validateSyllabus(categories).length > 0) {
      return failed(`${course.code}: category weights must add up to 100 before publishing.`);
    }
  }
  for (const course of bundle.courses) {
    const { error } = await v.db.tracker
      .from("syllabus_versions")
      .update({ confirmed_at: new Date().toISOString(), confirmed_by: v.userId })
      .eq("id", course.activeVersionId as string)
      .is("confirmed_at", null);
    if (error) return failed(`${course.code}: ${dbMessage(error)}`);
  }
  const { error } = await v.db.tracker
    .from("students")
    .update({ published_at: new Date().toISOString(), status: "active" })
    .eq("id", studentId);
  return error ? failed(dbMessage(error)) : done("Published");
}

export async function setStudentStatus(studentId: string, status: "active" | "archived"): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const { error } = await v.db.tracker.from("students").update({ status }).eq("id", studentId);
  return error ? failed(dbMessage(error)) : done(status === "archived" ? "Archived" : "Restored");
}

// Courses ----------------------------------------------------------------------

export async function addCourse(studentId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(CourseInput, form);
  if (!input.ok) return input.result;
  return applyOne(v, studentId, { op: "add_course", ...input.data, targetGrade: null }, "Course added");
}

export async function updateCourse(courseId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(CourseInput, form);
  if (!input.ok) return input.result;
  return applyToRow(v, "courses", courseId, { op: "update_course", courseId, ...input.data }, "Saved");
}

export async function deleteCourse(courseId: string): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  return applyToRow(v, "courses", courseId, { op: "remove_course", courseId }, "Course removed");
}

export async function saveTarget(courseId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(TargetInput, form);
  if (!input.ok) return input.result;
  return applyToRow(v, "courses", courseId, { op: "update_course", courseId, targetGrade: input.data.targetGrade }, "Saved");
}

// Syllabus categories --------------------------------------------------------------

export async function addCategory(courseId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(CategoryInput, form);
  if (!input.ok) return input.result;
  return applyToRow(v, "courses", courseId, { op: "add_category", courseId, ...input.data }, "Category added");
}

export async function updateCategory(categoryId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(CategoryInput, form);
  if (!input.ok) return input.result;
  return applyToRow(v, "categories", categoryId, { op: "update_category", categoryId, ...input.data }, "Saved");
}

export async function deleteCategory(categoryId: string): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  return applyToRow(v, "categories", categoryId, { op: "remove_category", categoryId }, "Category removed");
}

// Assessments --------------------------------------------------------------------

export async function addAssessment(courseId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(AssessmentInput, form);
  if (!input.ok) return input.result;
  const item: ChangeItem = { op: "add_assessment", courseId, ...input.data, excused: false };
  const result = await applyToRow(v, "courses", courseId, item, input.data.scoreEarned === null ? "Added" : "Grade added");
  return !result.ok && result.error === CATEGORY_PROBLEM ? failed(result.error, { categoryId: "Pick a category" }) : result;
}

/** Enter a score on the same record the student saw as upcoming. */
export async function saveScore(assessmentId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(ScoreInput, form);
  if (!input.ok) return input.result;
  return applyToRow(v, "assessments", assessmentId, { op: "update_assessment", assessmentId, ...input.data }, "Saved");
}

export async function deleteAssessment(assessmentId: string): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  return applyToRow(v, "assessments", assessmentId, { op: "remove_assessment", assessmentId }, "Removed");
}

// Tasks: priorities and supplemental work ----------------------------------------------

export async function addTask(studentId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(TaskInput, form);
  if (!input.ok) return input.result;
  return applyOne(v, studentId, { op: "add_task", ...input.data }, "Added");
}

/**
 * Add a rule-based suggestion as an ordinary school task (ADR 0024). The
 * suggestion is recomputed here from current data, so the stored title and
 * reason are what the rules say now, not what the page showed earlier.
 */
export async function addSuggestedTask(studentId: string, key: string): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const id = z.guid().safeParse(studentId);
  if (!id.success || !/^(prepare|review):[0-9a-f-]{36}$/i.test(key)) return failed("Something went wrong. Try again.");
  const bundle = await loadBundle(v.db, studentId);
  if (!bundle) return NO_ACCESS;
  const suggestion = buildStudentView(bundle, todayIso()).suggestions.find((s) => s.key === key);
  if (!suggestion) {
    revalidatePath("/", "layout");
    return failed("That suggestion no longer applies.");
  }
  const rank = bundle.tasks.reduce((max, t) => Math.max(max, t.rank), -1) + 1;
  const { error } = await v.db.tracker.from("tasks").insert({
    org_id: bundle.student.orgId, student_id: studentId, course_id: suggestion.courseId, title: suggestion.title,
    kind: "school", reason: suggestion.reason, pinned: false, rank, suggestion_key: suggestion.key,
  });
  if (error) return failed(dbMessage(error));
  return done("Added to priorities");
}

export async function setTaskPinned(taskId: string, pinned: boolean): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  return applyToRow(v, "tasks", taskId, { op: "update_task", taskId, pinned }, pinned ? "Pinned" : "Unpinned");
}

/** Swap a task with its neighbour in the student's ordered open list. */
export async function moveTask(taskId: string, direction: "up" | "down"): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const p = await parent(v, "tasks", taskId);
  if (!p) return NO_ACCESS;
  const bundle = await loadBundle(v.db, p.student_id);
  if (!bundle) return NO_ACCESS;
  const task = bundle.tasks.find((t) => t.id === taskId);
  if (!task) return NO_ACCESS;
  const list = orderTasks(bundle.tasks.filter((t) => t.kind === task.kind));
  const i = list.findIndex((t) => t.id === taskId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return done();
  const ranks = list.map((_, k) => k);
  [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
  for (let k = 0; k < list.length; k++) {
    if (list[k].rank === ranks[k]) continue;
    const { error } = await v.db.tracker.from("tasks").update({ rank: ranks[k] }).eq("id", list[k].id);
    if (error) return failed(dbMessage(error));
  }
  return done("Moved");
}

export async function deleteTask(taskId: string): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  return applyToRow(v, "tasks", taskId, { op: "remove_task", taskId }, "Removed");
}

// Grade flags ----------------------------------------------------------------------

/** Mark a student's flag resolved (ADR 0025). Fix the score first; this never changes it. */
export async function resolveFlag(flagId: string): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  if (!z.guid().safeParse(flagId).success) return failed("Something went wrong. Try again.");
  const { data, error } = await v.db.tracker
    .from("grade_flags")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", flagId)
    .is("resolved_at", null)
    .select("id");
  if (error) return failed(dbMessage(error));
  if ((data ?? []).length === 0) {
    revalidatePath("/", "layout");
    return failed("This flag was already resolved or withdrawn.");
  }
  return done("Resolved");
}
