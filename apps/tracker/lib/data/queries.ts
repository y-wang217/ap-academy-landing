import { z } from "zod";
import { getDb, type Db } from "./client";

const uuidLike = z.guid();
import {
  AssessmentRow, CategoryRow, CourseRow, FlagRow, GoalRow, StudentRow, TaskRow, VersionRow,
  type Assessment, type Category, type Course, type Flag, type Goal, type Student, type Task, type Version,
} from "./schemas";

export type Viewer =
  | { kind: "not_configured" }
  | { kind: "signed_out" }
  | { kind: "staff"; userId: string; email: string; orgId: string; db: Db }
  | { kind: "student"; userId: string; email: string; studentId: string; db: Db }
  | { kind: "none"; userId: string; email: string };

/**
 * Who is looking. Claims a pending invite first (ADR 0016), so a student's
 * first visit lands straight on their dashboard. Staff wins over student.
 */
export async function getViewer(): Promise<Viewer> {
  const db = await getDb();
  if (!db) return { kind: "not_configured" };
  const { data: auth } = await db.supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { kind: "signed_out" };
  const email = user.email ?? "";

  await db.tracker.rpc("claim_student_invites");

  const { data: memberships } = await db.tracker.from("memberships").select("role, org_id").eq("user_id", user.id);
  const staff = (memberships ?? []).find((m) => m.role === "owner" || m.role === "teacher");
  if (staff) return { kind: "staff", userId: user.id, email, orgId: staff.org_id, db };

  const { data: student } = await db.tracker.from("students").select("id").eq("user_id", user.id).maybeSingle();
  const id = z.object({ id: z.guid() }).safeParse(student);
  if (id.success) return { kind: "student", userId: user.id, email, studentId: id.data.id, db };
  return { kind: "none", userId: user.id, email };
}

const STUDENT_COLUMNS = "id, org_id, teacher_id, user_id, email, first_name, last_initial, grade_level, student_number, status, published_at, updated_at";

function parseRows<T extends z.ZodTypeAny>(schema: T, rows: unknown): z.output<T>[] {
  return z.array(schema).parse(rows ?? []);
}

export async function listStudents(db: Db, orgId: string): Promise<Student[]> {
  const { data, error } = await db.tracker
    .from("students").select(STUDENT_COLUMNS).eq("org_id", orgId)
    .order("status").order("first_name");
  if (error) throw new Error(error.message);
  return parseRows(StudentRow, data);
}

export type Bundle = {
  student: Student;
  goal: Goal | null;
  courses: Course[];
  versions: Version[];
  categories: Category[];
  assessments: Assessment[];
  tasks: Task[];
  flags: Flag[];
};

/** Everything about one student the caller may see. null when RLS hides it. */
export async function loadBundle(db: Db, studentId: string): Promise<Bundle | null> {
  const t = db.tracker;
  const [student, goal, courses, versions, categories, assessments, tasks, flags] = await Promise.all([
    t.from("students").select(STUDENT_COLUMNS).eq("id", studentId).maybeSingle(),
    t.from("goals").select("id, school, program, application_year, target_six_avg, benchmark_note, updated_at").eq("student_id", studentId).maybeSingle(),
    t.from("courses").select("id, code, name, term, status, in_six_plan, target_grade, active_syllabus_version_id, position, updated_at").eq("student_id", studentId).order("position").order("code"),
    t.from("syllabus_versions").select("id, course_id, version, confirmed_at").eq("student_id", studentId),
    t.from("categories").select("id, course_id, syllabus_version_id, name, weight, aggregation_method, needs_review, position").eq("student_id", studentId).order("position"),
    t.from("assessments").select("id, course_id, category_id, title, kind, due_date, held_on, student_done_at, score_earned, score_possible, excused, graded_at, updated_at").eq("student_id", studentId).order("title"),
    t.from("tasks").select("id, course_id, title, kind, pinned, rank, reason, suggestion_key, done_at, created_at, updated_at").eq("student_id", studentId),
    t.from("grade_flags").select("id, assessment_id, reason, created_at, resolved_at").eq("student_id", studentId).is("resolved_at", null),
  ]);
  for (const r of [student, goal, courses, versions, categories, assessments, tasks, flags]) {
    if (r.error) throw new Error(r.error.message);
  }
  if (!student.data) return null;
  return {
    student: StudentRow.parse(student.data),
    goal: goal.data ? GoalRow.parse(goal.data) : null,
    courses: parseRows(CourseRow, courses.data),
    versions: parseRows(VersionRow, versions.data),
    categories: parseRows(CategoryRow, categories.data),
    assessments: parseRows(AssessmentRow, assessments.data),
    tasks: parseRows(TaskRow, tasks.data),
    flags: parseRows(FlagRow, flags.data),
  };
}

/** Open grade flags per student in an org, for the teacher's student list. */
export async function openFlagCounts(db: Db, orgId: string): Promise<Map<string, number>> {
  const { data, error } = await db.tracker.from("grade_flags").select("student_id").eq("org_id", orgId).is("resolved_at", null);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of z.array(z.object({ student_id: z.guid() })).parse(data ?? [])) {
    counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1);
  }
  return counts;
}

export const DraftRow = z
  .object({
    id: uuidLike, course_id: uuidLike.nullable(), requested_by: uuidLike, status: z.enum(["requested", "drafted", "failed", "applied", "discarded"]),
    input_chars: z.coerce.number(), input_files: z.coerce.number(), model: z.string().nullable(), error: z.string().nullable(),
    draft: z.object({ items: z.array(z.unknown()), notes: z.array(z.string()) }).nullable().catch(null), created_at: z.string(),
  })
  .transform((r) => ({
    id: r.id, courseId: r.course_id, requestedBy: r.requested_by, status: r.status, inputChars: r.input_chars, inputFiles: r.input_files,
    model: r.model, error: r.error, itemCount: r.draft?.items.length ?? 0, noteCount: r.draft?.notes.length ?? 0, createdAt: r.created_at,
  }));
export type DraftRecord = z.output<typeof DraftRow>;

/** A student's AI draft records, newest first (ADR 0026). Never the drafts themselves. */
export async function listDrafts(db: Db, studentId: string, limit = 20): Promise<DraftRecord[]> {
  const { data, error } = await db.tracker
    .from("ai_drafts")
    .select("id, course_id, requested_by, status, input_chars, input_files, model, error, draft, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return parseRows(DraftRow, data);
}
