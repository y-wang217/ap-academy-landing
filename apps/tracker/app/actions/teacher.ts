"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateSyllabus } from "@/lib/domain/grades";
import { orderTasks } from "@/lib/domain/priorities";
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
// RLS has the final say. Nothing here uses a service-role key.

async function staff() {
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
async function parent(v: NonNullable<Awaited<ReturnType<typeof staff>>>, table: string, id: string) {
  const columns = table === "students" ? "org_id, student_id:id" : table === "courses" ? "org_id, student_id, course_id:id" : "org_id, student_id, course_id";
  const { data } = await v.db.tracker.from(table).select(columns).eq("id", id).maybeSingle();
  return (data as { org_id: string; student_id: string; course_id?: string } | null) ?? null;
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
  const p = await parent(v, "students", studentId);
  if (!p) return NO_ACCESS;
  const { error } = await v.db.tracker.from("goals").upsert(
    {
      org_id: p.org_id, student_id: studentId, school: input.data.school, program: input.data.program,
      application_year: input.data.applicationYear, target_six_avg: input.data.targetSixAvg, benchmark_note: input.data.benchmarkNote,
    },
    { onConflict: "student_id" },
  );
  return error ? failed(dbMessage(error)) : done();
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
  const p = await parent(v, "students", studentId);
  if (!p) return NO_ACCESS;
  const { count } = await v.db.tracker.from("courses").select("id", { count: "exact", head: true }).eq("student_id", studentId);
  const course = await v.db.tracker
    .from("courses")
    .insert({
      org_id: p.org_id, student_id: studentId, code: input.data.code, name: input.data.name, term: input.data.term,
      status: input.data.status, in_six_plan: input.data.inSixPlan, position: count ?? 0,
    })
    .select("id")
    .single();
  if (course.error || !course.data) return failed(dbMessage(course.error));
  const courseId = course.data.id as string;
  // Every course gets syllabus version 1 straight away (ADR 0018).
  const version = await v.db.tracker
    .from("syllabus_versions")
    .insert({ org_id: p.org_id, student_id: studentId, course_id: courseId, version: 1 })
    .select("id")
    .single();
  if (version.error || !version.data) return failed(dbMessage(version.error));
  const link = await v.db.tracker.from("courses").update({ active_syllabus_version_id: version.data.id }).eq("id", courseId);
  return link.error ? failed(dbMessage(link.error)) : done("Course added");
}

export async function updateCourse(courseId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(CourseInput, form);
  if (!input.ok) return input.result;
  const { error } = await v.db.tracker
    .from("courses")
    .update({ code: input.data.code, name: input.data.name, term: input.data.term, status: input.data.status, in_six_plan: input.data.inSixPlan })
    .eq("id", courseId);
  return error ? failed(dbMessage(error)) : done();
}

export async function deleteCourse(courseId: string): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const { error } = await v.db.tracker.from("courses").delete().eq("id", courseId);
  return error ? failed(dbMessage(error)) : done("Course removed");
}

export async function saveTarget(courseId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(TargetInput, form);
  if (!input.ok) return input.result;
  const { error } = await v.db.tracker.from("courses").update({ target_grade: input.data.targetGrade }).eq("id", courseId);
  return error ? failed(dbMessage(error)) : done();
}

// Syllabus categories --------------------------------------------------------------

export async function addCategory(courseId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(CategoryInput, form);
  if (!input.ok) return input.result;
  const { data: course } = await v.db.tracker
    .from("courses").select("org_id, student_id, active_syllabus_version_id").eq("id", courseId).maybeSingle();
  if (!course?.active_syllabus_version_id) return NO_ACCESS;
  const { count } = await v.db.tracker.from("categories").select("id", { count: "exact", head: true }).eq("syllabus_version_id", course.active_syllabus_version_id as string);
  const { error } = await v.db.tracker.from("categories").insert({
    org_id: course.org_id, student_id: course.student_id, course_id: courseId,
    syllabus_version_id: course.active_syllabus_version_id, name: input.data.name, weight: input.data.weight,
    aggregation_method: input.data.aggregationMethod, needs_review: input.data.needsReview, position: count ?? 0,
  });
  return error ? failed(dbMessage(error)) : done("Category added");
}

export async function updateCategory(categoryId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(CategoryInput, form);
  if (!input.ok) return input.result;
  const { error } = await v.db.tracker
    .from("categories")
    .update({ name: input.data.name, weight: input.data.weight, aggregation_method: input.data.aggregationMethod, needs_review: input.data.needsReview })
    .eq("id", categoryId);
  return error ? failed(dbMessage(error)) : done();
}

export async function deleteCategory(categoryId: string): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const { error } = await v.db.tracker.from("categories").delete().eq("id", categoryId);
  if (error?.code === "23503") return failed("This category has assessments. Move or remove them first.");
  return error ? failed(dbMessage(error)) : done("Category removed");
}

// Assessments --------------------------------------------------------------------

export async function addAssessment(courseId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(AssessmentInput, form);
  if (!input.ok) return input.result;
  const p = await parent(v, "courses", courseId);
  if (!p) return NO_ACCESS;
  const { error } = await v.db.tracker.from("assessments").insert({
    org_id: p.org_id, student_id: p.student_id, course_id: courseId, category_id: input.data.categoryId,
    title: input.data.title, due_date: input.data.dueDate, score_possible: input.data.scorePossible,
    score_earned: input.data.scoreEarned,
  });
  if (error?.code === "23503") return failed("Pick a category from this course.", { categoryId: "Pick a category" });
  return error ? failed(dbMessage(error)) : done(input.data.scoreEarned === null ? "Added" : "Grade added");
}

/** Enter a score on the same record the student saw as upcoming. */
export async function saveScore(assessmentId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(ScoreInput, form);
  if (!input.ok) return input.result;
  const { data, error } = await v.db.tracker
    .from("assessments")
    .update({ score_earned: input.data.scoreEarned, score_possible: input.data.scorePossible, excused: input.data.excused })
    .eq("id", assessmentId)
    .select("id");
  if (!error && (data ?? []).length === 0) return NO_ACCESS;
  return error ? failed(dbMessage(error)) : done();
}

export async function deleteAssessment(assessmentId: string): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const { error } = await v.db.tracker.from("assessments").delete().eq("id", assessmentId);
  return error ? failed(dbMessage(error)) : done("Removed");
}

// Tasks: priorities and supplemental work ----------------------------------------------

export async function addTask(studentId: string, form: FormData): Promise<Result> {
  const v = await staff();
  if (!v) return NO_ACCESS;
  const input = parse(TaskInput, form);
  if (!input.ok) return input.result;
  const p = await parent(v, "students", studentId);
  if (!p) return NO_ACCESS;
  const { data: last } = await v.db.tracker
    .from("tasks").select("rank").eq("student_id", studentId).order("rank", { ascending: false }).limit(1).maybeSingle();
  const { error } = await v.db.tracker.from("tasks").insert({
    org_id: p.org_id, student_id: studentId, course_id: input.data.courseId, title: input.data.title,
    kind: input.data.kind, reason: input.data.reason, pinned: input.data.pinned, rank: Number(last?.rank ?? -1) + 1,
  });
  return error ? failed(dbMessage(error)) : done("Added");
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
  const { error } = await v.db.tracker.from("tasks").update({ pinned }).eq("id", taskId);
  return error ? failed(dbMessage(error)) : done(pinned ? "Pinned" : "Unpinned");
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
  const { error } = await v.db.tracker.from("tasks").delete().eq("id", taskId);
  return error ? failed(dbMessage(error)) : done("Removed");
}
