/**
 * One shape for every teacher edit, AI and manual alike (ADRs 0027, 0029).
 * A change set belongs to one student. Every item is checked against the
 * student's own rows before anything is written, with the same bounds the
 * forms and the database use. An item may name a row an earlier item of the
 * same set creates, as `$k` (k = that item's index).
 */
import { z } from "zod";
import type { Db } from "./client";
import { dbMessage } from "./errors";
import type { Bundle } from "./queries";

// numeric(8, 3) in the schema.
const MAX_POINTS = 99999;
const uuid = z.guid();
/** A row id, or `$k`: the row created by item k of the same set. */
const rowRef = z.union([uuid, z.string().regex(/^\$\d+$/)]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const percent = z.number().min(0, "0 to 100").max(100, "0 to 100");
const text = (max: number) => z.string().trim().min(1, "Required").max(max, `At most ${max} characters`);
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable();
const possible = z.number().gt(0, "Must be more than 0").max(MAX_POINTS);
const earned = z.number().min(0, "Cannot be negative").max(MAX_POINTS).nullable();

export const CourseStatus = z.enum(["planned", "active", "completed"]);
export const AggregationMethod = z.enum(["mean_of_percentages", "pooled_points"]);
export const TaskKind = z.enum(["school", "supplemental"]);

export const SetGoalItem = z.object({
  op: z.literal("set_goal"),
  school: text(120),
  program: text(120),
  applicationYear: z.number().int().min(2020).max(2100).nullable(),
  targetSixAvg: percent,
  benchmarkNote: optionalText(500),
});

export const AddCourseItem = z.object({
  op: z.literal("add_course"),
  code: text(20).transform((v) => v.toUpperCase()),
  name: text(120),
  term: z.string().trim().max(40).default(""),
  status: CourseStatus.default("active"),
  inSixPlan: z.boolean().default(true),
  targetGrade: percent.nullable().default(null),
});

const atLeastOneField = (item: Record<string, unknown>, keys: string[]) => keys.some((k) => item[k] !== undefined);
const NO_CHANGE = "Nothing to change";

export const UpdateCourseItem = z
  .object({
    op: z.literal("update_course"),
    courseId: rowRef,
    code: text(20).transform((v) => v.toUpperCase()).optional(),
    name: text(120).optional(),
    term: z.string().trim().max(40).optional(),
    status: CourseStatus.optional(),
    inSixPlan: z.boolean().optional(),
    targetGrade: percent.nullable().optional(),
  })
  .refine((i) => atLeastOneField(i, ["code", "name", "term", "status", "inSixPlan", "targetGrade"]), NO_CHANGE);

export const RemoveCourseItem = z.object({ op: z.literal("remove_course"), courseId: rowRef });

export const AddCategoryItem = z.object({
  op: z.literal("add_category"),
  courseId: rowRef,
  name: text(60),
  weight: percent,
  aggregationMethod: AggregationMethod.default("mean_of_percentages"),
  needsReview: z.boolean().default(false),
});

export const UpdateCategoryItem = z
  .object({
    op: z.literal("update_category"),
    categoryId: rowRef,
    name: text(60).optional(),
    weight: percent.optional(),
    aggregationMethod: AggregationMethod.optional(),
    needsReview: z.boolean().optional(),
  })
  .refine((i) => atLeastOneField(i, ["name", "weight", "aggregationMethod", "needsReview"]), NO_CHANGE);

export const RemoveCategoryItem = z.object({ op: z.literal("remove_category"), categoryId: rowRef });

export const AddAssessmentItem = z.object({
  op: z.literal("add_assessment"),
  courseId: rowRef,
  categoryId: rowRef,
  title: text(120),
  dueDate: isoDate.nullable().default(null),
  scorePossible: possible,
  scoreEarned: earned.default(null),
  excused: z.boolean().default(false),
});

export const UpdateAssessmentItem = z
  .object({
    op: z.literal("update_assessment"),
    assessmentId: rowRef,
    title: text(120).optional(),
    categoryId: rowRef.optional(),
    dueDate: isoDate.nullable().optional(),
    scoreEarned: earned.optional(),
    scorePossible: possible.optional(),
    excused: z.boolean().optional(),
  })
  .refine((i) => atLeastOneField(i, ["title", "categoryId", "dueDate", "scoreEarned", "scorePossible", "excused"]), NO_CHANGE);

export const RemoveAssessmentItem = z.object({ op: z.literal("remove_assessment"), assessmentId: rowRef });

export const AddTaskItem = z.object({
  op: z.literal("add_task"),
  courseId: rowRef.nullable().default(null),
  title: text(160),
  kind: TaskKind.default("school"),
  reason: optionalText(300).default(null),
  pinned: z.boolean().default(false),
});

export const UpdateTaskItem = z
  .object({
    op: z.literal("update_task"),
    taskId: rowRef,
    title: text(160).optional(),
    courseId: rowRef.nullable().optional(),
    reason: optionalText(300).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((i) => atLeastOneField(i, ["title", "courseId", "reason", "pinned"]), NO_CHANGE);

export const RemoveTaskItem = z.object({ op: z.literal("remove_task"), taskId: rowRef });

export const ChangeItem = z.discriminatedUnion("op", [
  SetGoalItem,
  AddCourseItem, UpdateCourseItem, RemoveCourseItem,
  AddCategoryItem, UpdateCategoryItem, RemoveCategoryItem,
  AddAssessmentItem, UpdateAssessmentItem, RemoveAssessmentItem,
  AddTaskItem, UpdateTaskItem, RemoveTaskItem,
]);
export type ChangeItem = z.output<typeof ChangeItem>;
export type ChangeOp = ChangeItem["op"];

export type StudentContext = {
  studentId: string;
  orgId: string;
  courses: { id: string; code: string; name: string; term: string; status: "planned" | "active" | "completed"; inSixPlan: boolean; targetGrade: number | null; activeVersionId: string | null; confirmed: boolean }[];
  /** Every category, any version; `versionId` says which. */
  categories: { id: string; courseId: string; versionId: string; name: string; weight: number; aggregationMethod: "mean_of_percentages" | "pooled_points"; needsReview: boolean }[];
  assessments: { id: string; courseId: string; categoryId: string; title: string; dueDate: string | null; scoreEarned: number | null; scorePossible: number; excused: boolean }[];
  tasks: { id: string; courseId: string | null; title: string; kind: "school" | "supplemental"; reason: string | null; pinned: boolean; rank: number }[];
};

/** The rows items are checked against, from one student's bundle. */
export function contextFromBundle(bundle: Bundle): StudentContext {
  const confirmed = new Set(bundle.versions.filter((v) => v.confirmedAt !== null).map((v) => v.id));
  return {
    studentId: bundle.student.id,
    orgId: bundle.student.orgId,
    courses: bundle.courses.map((c) => ({
      id: c.id, code: c.code, name: c.name, term: c.term, status: c.status, inSixPlan: c.inSixPlan, targetGrade: c.targetGrade,
      activeVersionId: c.activeVersionId, confirmed: c.activeVersionId !== null && confirmed.has(c.activeVersionId),
    })),
    categories: bundle.categories.map((c) => ({
      id: c.id, courseId: c.courseId, versionId: c.versionId, name: c.name, weight: c.weight, aggregationMethod: c.aggregationMethod, needsReview: c.needsReview,
    })),
    assessments: bundle.assessments.map((a) => ({
      id: a.id, courseId: a.courseId, categoryId: a.categoryId, title: a.title, dueDate: a.dueDate,
      scoreEarned: a.scoreEarned, scorePossible: a.scorePossible, excused: a.excused,
    })),
    tasks: bundle.tasks.map((t) => ({ id: t.id, courseId: t.courseId, title: t.title, kind: t.kind, reason: t.reason, pinned: t.pinned, rank: t.rank })),
  };
}

// References --------------------------------------------------------------------

export const isLocalRef = (ref: string) => ref.startsWith("$");
export const localIndex = (ref: string) => Number(ref.slice(1));

type Kind = "course" | "category" | "assessment" | "task";
const ADD_OF: Record<Kind, ChangeOp> = { course: "add_course", category: "add_category", assessment: "add_assessment", task: "add_task" };

/** The refs an item carries, with the kind of row each must name. */
export function itemRefs(item: ChangeItem): { ref: string; kind: Kind }[] {
  switch (item.op) {
    case "set_goal":
      return [];
    case "add_course":
      return [];
    case "update_course":
    case "remove_course":
      return [{ ref: item.courseId, kind: "course" }];
    case "add_category":
      return [{ ref: item.courseId, kind: "course" }];
    case "update_category":
    case "remove_category":
      return [{ ref: item.categoryId, kind: "category" }];
    case "add_assessment":
      return [{ ref: item.courseId, kind: "course" }, { ref: item.categoryId, kind: "category" }];
    case "update_assessment":
      return [{ ref: item.assessmentId, kind: "assessment" }, ...(item.categoryId ? [{ ref: item.categoryId, kind: "category" as const }] : [])];
    case "remove_assessment":
      return [{ ref: item.assessmentId, kind: "assessment" }];
    case "add_task":
      return item.courseId ? [{ ref: item.courseId, kind: "course" }] : [];
    case "update_task":
      return [{ ref: item.taskId, kind: "task" }, ...(item.courseId ? [{ ref: item.courseId, kind: "course" as const }] : [])];
    case "remove_task":
      return [{ ref: item.taskId, kind: "task" }];
  }
}

/** Indexes of the earlier items this item's `$k` refs point at. */
export function dependencies(item: ChangeItem): number[] {
  return [...new Set(itemRefs(item).map((r) => r.ref).filter(isLocalRef).map(localIndex))];
}

/** The course a category ref belongs to: an id, a `$k`, or null when unknown. */
function courseOfCategory(ref: string, index: number, items: readonly ChangeItem[], ctx: StudentContext): string | null {
  if (isLocalRef(ref)) {
    const k = localIndex(ref);
    const earlier = k < index ? items[k] : undefined;
    return earlier?.op === "add_category" ? earlier.courseId : null;
  }
  return ctx.categories.find((c) => c.id === ref)?.courseId ?? null;
}

function courseOf(kind: Kind, ref: string, index: number, items: readonly ChangeItem[], ctx: StudentContext): string | null {
  if (kind === "course") return ref;
  if (kind === "category") return courseOfCategory(ref, index, items, ctx);
  if (kind === "assessment") return ctx.assessments.find((a) => a.id === ref)?.courseId ?? null;
  return null;
}

export const CATEGORY_PROBLEM = "Pick a category from this course.";
const CONFIRMED = (code: string) => `${code}'s syllabus was confirmed at publish and can't be changed yet.`;

/**
 * Why item `index` can't be applied to this student, or null when it can.
 * Earlier items of the same set are in scope for `$k` refs.
 */
export function itemProblem(item: ChangeItem, ctx: StudentContext, items: readonly ChangeItem[] = [item], index = 0): string | null {
  for (const { ref, kind } of itemRefs(item)) {
    if (isLocalRef(ref)) {
      const k = localIndex(ref);
      if (k >= index || items[k]?.op !== ADD_OF[kind]) return `Change ${index + 1} refers to a ${kind} that is not added before it.`;
      continue;
    }
    const known =
      kind === "course" ? ctx.courses.some((c) => c.id === ref)
      : kind === "category" ? ctx.categories.some((c) => c.id === ref)
      : kind === "assessment" ? ctx.assessments.some((a) => a.id === ref)
      : ctx.tasks.some((t) => t.id === ref);
    if (!known) return `That ${kind} is not this student's.`;
  }

  // A category must be on its course's active syllabus, and that syllabus must still be open.
  const categoryCheck = (categoryRef: string, courseRef: string | null) => {
    if (isLocalRef(categoryRef)) {
      const owner = courseOfCategory(categoryRef, index, items, ctx);
      return courseRef !== null && owner !== courseRef ? CATEGORY_PROBLEM : null;
    }
    const category = ctx.categories.find((c) => c.id === categoryRef);
    const course = category ? ctx.courses.find((c) => c.id === category.courseId) : undefined;
    if (!category || !course || category.versionId !== course.activeVersionId) return CATEGORY_PROBLEM;
    if (courseRef !== null && course.id !== courseRef) return CATEGORY_PROBLEM;
    return null;
  };
  const openSyllabus = (courseRef: string) => {
    if (isLocalRef(courseRef)) return null;
    const course = ctx.courses.find((c) => c.id === courseRef);
    if (!course?.activeVersionId) return "This course has no syllabus version.";
    return course.confirmed ? CONFIRMED(course.code) : null;
  };

  switch (item.op) {
    case "add_category":
      return openSyllabus(item.courseId);
    case "update_category":
    case "remove_category": {
      const owner = courseOf("category", item.categoryId, index, items, ctx);
      return owner === null ? CATEGORY_PROBLEM : categoryCheck(item.categoryId, owner) ?? openSyllabus(owner);
    }
    case "add_assessment":
      return categoryCheck(item.categoryId, item.courseId);
    case "update_assessment":
      return item.categoryId ? categoryCheck(item.categoryId, courseOf("assessment", item.assessmentId, index, items, ctx)) : null;
    default:
      return null;
  }
}

/** Every item parsed and checked in order. null when the set is sound. */
export function validateChangeSet(items: readonly unknown[], ctx: StudentContext): { items: ChangeItem[]; error: string | null } {
  const parsed: ChangeItem[] = [];
  for (const [i, raw] of items.entries()) {
    const result = ChangeItem.safeParse(raw);
    if (!result.success) return { items: parsed, error: `Change ${i + 1}: ${result.error.issues[0]?.message ?? "not valid"}` };
    parsed.push(result.data);
    const problem = itemProblem(result.data, ctx, parsed, i);
    if (problem) return { items: parsed, error: problem };
  }
  return { items: parsed, error: null };
}

/**
 * The items at `selected` positions, with `$k` refs renumbered. An item's
 * dependencies are included whether or not they were selected, so a
 * partial confirmation never breaks a reference (ADR 0029).
 */
export function subsetChangeSet(items: readonly ChangeItem[], selected: readonly number[]): ChangeItem[] {
  const keep = new Set<number>();
  const add = (i: number) => {
    if (keep.has(i) || items[i] === undefined) return;
    keep.add(i);
    dependencies(items[i]).forEach(add);
  };
  selected.forEach(add);
  const order = [...keep].sort((a, b) => a - b);
  const position = new Map(order.map((old, i) => [old, i]));
  const remap = (ref: string) => (isLocalRef(ref) ? `$${position.get(localIndex(ref)) ?? -1}` : ref);
  return order.map((i) => {
    const item = items[i];
    switch (item.op) {
      case "update_course": case "remove_course": case "add_category":
        return { ...item, courseId: remap(item.courseId) };
      case "update_category": case "remove_category":
        return { ...item, categoryId: remap(item.categoryId) };
      case "add_assessment":
        return { ...item, courseId: remap(item.courseId), categoryId: remap(item.categoryId) };
      case "update_assessment":
        return { ...item, assessmentId: remap(item.assessmentId), ...(item.categoryId ? { categoryId: remap(item.categoryId) } : {}) };
      case "remove_assessment":
        return { ...item, assessmentId: remap(item.assessmentId) };
      case "add_task":
        return { ...item, courseId: item.courseId ? remap(item.courseId) : null };
      case "update_task":
        return { ...item, taskId: remap(item.taskId), ...(item.courseId ? { courseId: remap(item.courseId) } : {}) };
      case "remove_task":
        return { ...item, taskId: remap(item.taskId) };
      default:
        return item;
    }
  });
}

// Apply ---------------------------------------------------------------------------

export type ApplyResult = { applied: number; error: string | null };

type DbError = { code?: string | null; message?: string | null } | null;
type Outcome = { error: DbError; missing?: boolean; id?: string; plain?: string };

/**
 * Validate every item, then write them one by one. Stops at the first
 * failure and says how many were saved; nothing is reported as saved that
 * wasn't (non-negotiable 6).
 */
export async function applyChangeSet(db: Db, ctx: StudentContext, rawItems: readonly unknown[]): Promise<ApplyResult> {
  const { items, error } = validateChangeSet(rawItems, ctx);
  if (error) return { applied: 0, error };

  const t = db.tracker;
  const base = { org_id: ctx.orgId, student_id: ctx.studentId };
  const created: string[] = [];
  const resolve = (ref: string) => (isLocalRef(ref) ? created[localIndex(ref)] : ref);
  const resolveOrNull = (ref: string | null | undefined) => (ref === null || ref === undefined ? ref : resolve(ref));
  /** Active syllabus version per course, including courses this set creates. */
  const versionOf = new Map(ctx.courses.filter((c) => c.activeVersionId).map((c) => [c.id, c.activeVersionId as string]));
  let coursePosition = ctx.courses.length;
  const categoryCount = new Map<string, number>();
  for (const c of ctx.categories) categoryCount.set(c.versionId, (categoryCount.get(c.versionId) ?? 0) + 1);
  let taskRank = ctx.tasks.reduce((max, task) => Math.max(max, task.rank), -1) + 1;

  const one = async (item: ChangeItem): Promise<Outcome> => {
    switch (item.op) {
      case "set_goal": {
        const { error } = await t.from("goals").upsert(
          { ...base, school: item.school, program: item.program, application_year: item.applicationYear, target_six_avg: item.targetSixAvg, benchmark_note: item.benchmarkNote },
          { onConflict: "student_id" },
        );
        return { error };
      }
      case "add_course": {
        const course = await t
          .from("courses")
          .insert({ ...base, code: item.code, name: item.name, term: item.term, status: item.status, in_six_plan: item.inSixPlan, target_grade: item.targetGrade, position: coursePosition })
          .select("id")
          .single();
        if (course.error || !course.data) return { error: course.error };
        coursePosition++;
        const courseId = course.data.id as string;
        // Every course gets syllabus version 1 straight away (ADR 0018).
        const version = await t.from("syllabus_versions").insert({ ...base, course_id: courseId, version: 1 }).select("id").single();
        if (version.error || !version.data) return { error: version.error };
        const versionId = version.data.id as string;
        const link = await t.from("courses").update({ active_syllabus_version_id: versionId }).eq("id", courseId);
        if (link.error) return { error: link.error };
        versionOf.set(courseId, versionId);
        return { error: null, id: courseId };
      }
      case "update_course": {
        const patch = {
          ...(item.code !== undefined && { code: item.code }),
          ...(item.name !== undefined && { name: item.name }),
          ...(item.term !== undefined && { term: item.term }),
          ...(item.status !== undefined && { status: item.status }),
          ...(item.inSixPlan !== undefined && { in_six_plan: item.inSixPlan }),
          ...(item.targetGrade !== undefined && { target_grade: item.targetGrade }),
        };
        const { data, error } = await t.from("courses").update(patch).eq("id", resolve(item.courseId)).select("id");
        return { error, missing: !error && (data ?? []).length === 0 };
      }
      case "remove_course": {
        const { error } = await t.from("courses").delete().eq("id", resolve(item.courseId));
        return { error };
      }
      case "add_category": {
        const courseId = resolve(item.courseId);
        const versionId = versionOf.get(courseId);
        if (!versionId) return { error: null, plain: "This course has no syllabus version." };
        const position = categoryCount.get(versionId) ?? 0;
        const { data, error } = await t
          .from("categories")
          .insert({ ...base, course_id: courseId, syllabus_version_id: versionId, name: item.name, weight: item.weight, aggregation_method: item.aggregationMethod, needs_review: item.needsReview, position })
          .select("id")
          .single();
        if (error || !data) return { error };
        categoryCount.set(versionId, position + 1);
        return { error: null, id: data.id as string };
      }
      case "update_category": {
        const patch = {
          ...(item.name !== undefined && { name: item.name }),
          ...(item.weight !== undefined && { weight: item.weight }),
          ...(item.aggregationMethod !== undefined && { aggregation_method: item.aggregationMethod }),
          ...(item.needsReview !== undefined && { needs_review: item.needsReview }),
        };
        const { data, error } = await t.from("categories").update(patch).eq("id", resolve(item.categoryId)).select("id");
        return { error, missing: !error && (data ?? []).length === 0 };
      }
      case "remove_category": {
        const { error } = await t.from("categories").delete().eq("id", resolve(item.categoryId));
        if (error?.code === "23503") return { error: null, plain: "This category has assessments. Move or remove them first." };
        return { error };
      }
      case "add_assessment": {
        const { data, error } = await t
          .from("assessments")
          .insert({
            ...base, course_id: resolve(item.courseId), category_id: resolve(item.categoryId), title: item.title, due_date: item.dueDate,
            score_possible: item.scorePossible, score_earned: item.scoreEarned, excused: item.excused,
          })
          .select("id")
          .single();
        return { error, id: data?.id as string | undefined };
      }
      case "update_assessment": {
        const patch = {
          ...(item.title !== undefined && { title: item.title }),
          ...(item.categoryId !== undefined && { category_id: resolve(item.categoryId) }),
          ...(item.dueDate !== undefined && { due_date: item.dueDate }),
          ...(item.scoreEarned !== undefined && { score_earned: item.scoreEarned }),
          ...(item.scorePossible !== undefined && { score_possible: item.scorePossible }),
          ...(item.excused !== undefined && { excused: item.excused }),
        };
        const { data, error } = await t.from("assessments").update(patch).eq("id", resolve(item.assessmentId)).select("id");
        return { error, missing: !error && (data ?? []).length === 0 };
      }
      case "remove_assessment": {
        const { error } = await t.from("assessments").delete().eq("id", resolve(item.assessmentId));
        return { error };
      }
      case "add_task": {
        const { data, error } = await t
          .from("tasks")
          .insert({ ...base, course_id: resolveOrNull(item.courseId), title: item.title, kind: item.kind, reason: item.reason, pinned: item.pinned, rank: taskRank })
          .select("id")
          .single();
        if (error || !data) return { error };
        taskRank++;
        return { error: null, id: data.id as string };
      }
      case "update_task": {
        const patch = {
          ...(item.title !== undefined && { title: item.title }),
          ...(item.courseId !== undefined && { course_id: resolveOrNull(item.courseId) }),
          ...(item.reason !== undefined && { reason: item.reason }),
          ...(item.pinned !== undefined && { pinned: item.pinned }),
        };
        const { data, error } = await t.from("tasks").update(patch).eq("id", resolve(item.taskId)).select("id");
        return { error, missing: !error && (data ?? []).length === 0 };
      }
      case "remove_task": {
        const { error } = await t.from("tasks").delete().eq("id", resolve(item.taskId));
        return { error };
      }
    }
  };

  let applied = 0;
  for (const item of items) {
    const outcome = await one(item);
    if (outcome.error || outcome.missing || outcome.plain) {
      const why = outcome.plain ?? (outcome.missing ? "That row was removed in the meantime." : dbMessage(outcome.error));
      return { applied, error: applied > 0 ? `Saved ${applied} of ${items.length}. Then: ${why}` : why };
    }
    created.push(outcome.id ?? "");
    applied++;
  }
  return { applied, error: null };
}
