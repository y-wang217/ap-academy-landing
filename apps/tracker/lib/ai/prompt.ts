/**
 * What goes to the model and how its answer becomes a change set (ADRs
 * 0026, 0029). Pure: no SDK, no database. The model sees short refs (C1,
 * K1, A1, T1, G), never row ids, and never the student's name or email.
 */
import { z } from "zod";
import {
  AggregationMethod, ChangeItem, CourseStatus, RevisedCategory, TaskKind, isLocalRef, itemProblem, localIndex, localPart, mapLocalRefs,
  subsetChangeSet, type StudentContext,
} from "../data/change-set";

const OPS = [
  "set_goal",
  "add_course", "update_course", "remove_course",
  "add_category", "update_category", "remove_category",
  "add_assessment", "update_assessment", "remove_assessment",
  "add_task", "update_task", "remove_task",
] as const;

/**
 * The schema the model answers in. Kept flat and loose; every field is checked
 * after. The API compiles at most 16 nullable (union-typed) fields per
 * request, so text and choice fields say "none" with "" rather than null, and
 * only numbers and booleans are nullable. `fromWire` turns "" back into null.
 */
const text = (description?: string) => (description ? z.string().describe(`${description}. "" when not given`) : z.string().describe('"" when not given'));
const choice = <T extends string>(values: readonly T[], description?: string) =>
  z.enum(["", ...values] as ["" | T, ...("" | T)[]]).describe(description ? `${description}. "" when not given` : '"" when not given');

export const AiWireOutput = z.object({
  items: z.array(
    z.object({
      op: z.enum(OPS),
      ref: text("For update_* and remove_*: the ref of the existing row (C1, K1, A1, T1)"),
      new_ref: text("For add_*: a short name you choose for the new row (N1, N2, ...) so later items can refer to it"),
      course: text("Course ref (C1 or a new_ref) for add_category, add_assessment, add_task, update_task"),
      category: text("Category ref (K1 or a new_ref) for add_assessment or update_assessment"),
      school: text(),
      program: text(),
      application_year: z.number().nullable(),
      target_six_avg: z.number().nullable().describe("Target six-course average, 0 to 100"),
      benchmark_note: text(),
      code: text("Course code like MHF4U"),
      name: text("Course name, or category name"),
      term: text(),
      status: choice(CourseStatus.options),
      in_six_plan: z.boolean().nullable(),
      target_grade: z.number().nullable().describe("Course target, 0 to 100"),
      weight: z.number().nullable().describe("Category weight, 0 to 100"),
      aggregation_method: choice(AggregationMethod.options),
      needs_review: z.boolean().nullable(),
      title: text("Assessment or task title"),
      due_date: text("YYYY-MM-DD"),
      score_earned: z.number().nullable().describe("Marks earned, or null when not marked yet"),
      score_possible: z.number().nullable().describe("Marks possible. 100 when only a percentage is given"),
      excused: z.boolean().nullable().describe("true when the work is excused or exempt"),
      kind: choice(TaskKind.options, "school for school work, supplemental for extra practice"),
      reason: text("Why this task matters, for a task"),
      pinned: z.boolean().nullable(),
      certain: z.boolean().describe("true when the material clearly supports this exact change; false when the teacher should check it"),
      check: text("When certain is false: what the tutor should check, in a few words"),
      source: z.string().describe("The words of the material or request this change comes from, copied exactly"),
    }),
  ),
  unmatched: z.array(z.string()).describe("Things in the material or request about this student's work that could not be turned into a change with confidence"),
});
export type AiWireOutput = z.output<typeof AiWireOutput>;

type Unset<T> = { [K in keyof T]: T[K] extends string ? Exclude<T[K], ""> | null : T[K] };
const TEXT_FIELDS = [
  "ref", "new_ref", "course", "category", "school", "program", "benchmark_note", "code", "name", "term",
  "status", "aggregation_method", "title", "due_date", "kind", "reason", "check",
] as const;

/** The model's answer with "not given" as null, which is what `toDraftItems` reads. */
export type AiOutput = {
  items: (Unset<Omit<AiWireOutput["items"][number], "op" | "source">> & Pick<AiWireOutput["items"][number], "op" | "source">)[];
  unmatched: string[];
};

export function fromWire(wire: AiWireOutput): AiOutput {
  return {
    unmatched: wire.unmatched,
    items: wire.items.map((item) => {
      const out: Record<string, unknown> = { ...item };
      for (const key of TEXT_FIELDS) {
        const value = item[key].trim();
        out[key] = value === "" ? null : value;
      }
      return out as AiOutput["items"][number];
    }),
  };
}
type RawItem = AiOutput["items"][number];

export const SYSTEM_PROMPT = `You turn what a tutor sends about one student into proposed changes to a grade tracker. The tutor reviews every change before anything is saved, so propose only what the material supports.

The tutor sends the student as it is now (refs, never ids) and then either material to read, a request, or both:
- Material: notes from a trial lesson, a transcript of a lesson, a school course outline, a grade portal or report card screenshot, an email. Turn every fact about this student's goal, courses, syllabus categories, marks, upcoming work and priorities into changes.
- A request: plain words like "move the physics test to Friday, she got 38 out of 42" or "add MCV4U as a planned course". Do exactly what it asks, as changes.

Ops: set_goal; add_course, update_course, remove_course; add_category, update_category, remove_category; add_assessment, update_assessment, remove_assessment; add_task, update_task, remove_task.
- update_* and remove_* name the existing row in ref. In update_*, leave a field null to keep it as it is.
- add_* may give new_ref (N1, N2, ...) so a later item can name the new row in course or category. An add comes before the items that name its new_ref.
- add_course needs a course code. When the tutor names a subject without one, give the usual Ontario code for the student's grade_level (grade 12 Biology is SBI4U, grade 12 English is ENG4U, grade 11 Chemistry is SCH3U), put the subject in name, and set certain false. One add_course per course.
- Categories are a course's syllabus: name and weight, weights adding up to 100. Change any syllabus with add_category, update_category and remove_category, confirmed or not; a confirmed one (syllabus_confirmed true) is saved as a new version, and past marks move with their categories. When a category goes away but its work counts somewhere else ("labs now count as tests"), give remove_category the receiving category in category.
- Marks: give score_earned and score_possible as numbers. A percentage alone means score_possible 100. Blank, dash or "not marked" means score_earned null. "Excused", "EX" or "exempt" means excused true. To set a mark on an existing assessment use update_assessment with score_possible given.
- Match existing rows by meaning, not exact words ("Unit 3 Test" and "U3 test" are the same). Leave out a change that would not change anything.
- Ignore course averages, term marks, comments and anything about other students.
- certain is true only when the material clearly states this exact change. A guess at a category, a date, a weight or a course is certain false, and check says in a few words what to confirm ("Biology or English?").
- The tutor wants everything the tracker can hold turned into changes, so the material never has to be typed in by hand. When you can't tell where something goes, make your best guess as a change with certain false; don't also put it in unmatched.
- unmatched is only for what no change can hold: something with no place in the tracker, or material that contradicts itself.`;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Remove the student's name and any email address before the text leaves (ADR 0026). */
export function stripPersonalData(text: string, firstName: string, lastInitial: string): string {
  let out = text.replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu, "[email]");
  const first = firstName.trim();
  if (first.length > 0) {
    const name = escapeRegExp(first);
    const initial = escapeRegExp(lastInitial.trim());
    // Letter-aware word edges, so accented names (Zoë, Émile) are caught too.
    const edge = (body: string) => new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "giu");
    if (initial) out = out.replace(edge(`${name}\\s+${initial}\\.?`), "the student");
    out = out.replace(edge(name), "the student");
  }
  return out;
}

/** What the prompt needs about a student. A data Bundle satisfies it. */
export type PromptStudent = {
  student: { gradeLevel: number };
  goal: { school: string; program: string; applicationYear: number | null; targetSixAvg: number; benchmarkNote: string | null } | null;
  courses: { id: string; code: string; name: string; term: string; status: "planned" | "active" | "completed"; inSixPlan: boolean; targetGrade: number | null; activeVersionId: string | null }[];
  versions: { id: string; confirmedAt: string | null }[];
  categories: { id: string; courseId: string; versionId: string; name: string; weight: number; aggregationMethod: "mean_of_percentages" | "pooled_points"; needsReview: boolean }[];
  assessments: { id: string; courseId: string; categoryId: string; title: string; dueDate: string | null; scoreEarned: number | null; scorePossible: number; excused: boolean }[];
  tasks: { id: string; courseId: string | null; title: string; kind: "school" | "supplemental"; reason: string | null; pinned: boolean; doneAt: string | null }[];
};

export type Refs = { courses: Map<string, string>; categories: Map<string, string>; assessments: Map<string, string>; tasks: Map<string, string> };

/** The user text: the student as refs, then what the teacher sent. */
export function buildUserMessage(student: PromptStudent, sent: string, focusCourseId: string | null = null, attachmentCount = 0): { text: string; refs: Refs } {
  const refs: Refs = { courses: new Map(), categories: new Map(), assessments: new Map(), tasks: new Map() };
  const refOf = { course: new Map<string, string>(), category: new Map<string, string>() };
  const confirmed = new Set(student.versions.filter((v) => v.confirmedAt !== null).map((v) => v.id));
  let k = 0;
  let a = 0;
  let t = 0;
  const courses = student.courses.map((c, i) => {
    const ref = `C${i + 1}`;
    refs.courses.set(ref, c.id);
    refOf.course.set(c.id, ref);
    const categories = student.categories
      .filter((cat) => cat.courseId === c.id && cat.versionId === c.activeVersionId)
      .map((cat) => {
        const r = `K${++k}`;
        refs.categories.set(r, cat.id);
        refOf.category.set(cat.id, r);
        return { ref: r, name: cat.name, weight: cat.weight, aggregation_method: cat.aggregationMethod, needs_review: cat.needsReview };
      });
    const assessments = student.assessments
      .filter((x) => x.courseId === c.id)
      .map((x) => {
        const r = `A${++a}`;
        refs.assessments.set(r, x.id);
        return { ref: r, title: x.title, category: refOf.category.get(x.categoryId) ?? null, due_date: x.dueDate, score_earned: x.scoreEarned, score_possible: x.scorePossible, excused: x.excused };
      });
    return {
      ref, code: c.code, name: c.name, term: c.term, status: c.status, in_six_plan: c.inSixPlan, target_grade: c.targetGrade,
      syllabus_confirmed: c.activeVersionId !== null && confirmed.has(c.activeVersionId), categories, assessments,
    };
  });
  const tasks = student.tasks
    .filter((task) => task.doneAt === null)
    .map((task) => {
      const r = `T${++t}`;
      refs.tasks.set(r, task.id);
      return { ref: r, title: task.title, kind: task.kind, course: task.courseId ? refOf.course.get(task.courseId) ?? null : null, reason: task.reason, pinned: task.pinned };
    });
  const goal = student.goal
    ? { ref: "G", school: student.goal.school, program: student.goal.program, application_year: student.goal.applicationYear, target_six_avg: student.goal.targetSixAvg, benchmark_note: student.goal.benchmarkNote }
    : null;
  const focus = focusCourseId ? refOf.course.get(focusCourseId) : undefined;
  const parts = [
    `The student as it is now:\n${JSON.stringify({ grade_level: student.student.gradeLevel, goal, courses, tasks }, null, 1)}`,
    focus ? `The tutor is looking at course ${focus}; material without a course named is about it.` : null,
    attachmentCount > 0 ? `${attachmentCount} attached file${attachmentCount === 1 ? "" : "s"} are the material.` : null,
    sent.trim().length > 0 ? `From the tutor:\n<sent>\n${sent}\n</sent>` : "The tutor sent no words, only the attached material.",
  ];
  return { text: parts.filter((p): p is string => p !== null).join("\n\n"), refs };
}

export type DraftItem = ChangeItem & { source: string; certain: boolean; check?: string };

const isoDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const given = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

/** Keep only the fields of a patch that differ from the row as it is. */
function prune<T extends Record<string, unknown>>(patch: T, current: Record<string, unknown>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined && patch[key] !== current[key as string]) out[key] = patch[key];
  }
  return out;
}

/**
 * The model's answer as change items. Anything that doesn't map to this
 * student or fails the same bounds as the forms goes to notes, never to items.
 */
export function toDraftItems(output: AiOutput, refs: Refs, ctx: StudentContext, goal: PromptStudent["goal"]): { items: DraftItem[]; notes: string[] } {
  const items: DraftItem[] = [];
  const notes = output.unmatched.map((line) => line.trim()).filter(Boolean);
  /** `sub`: a category of a new syllabus version, addressed as `$index.sub`. */
  const newRefs = new Map<string, { index: number; kind: "course" | "category" | "assessment" | "task"; sub?: number }>();
  const touched = new Set<string>();
  /** new_refs of adds that became notes, so their dependents say why. */
  const failed = new Set<string>();
  /** Category changes on a confirmed course, gathered into one new version per course (ADR 0030). */
  const revisions = new Map<string, Revision>();

  const resolve = (ref: string | null, kind: "course" | "category" | "assessment" | "task"): string | null => {
    if (!ref) return null;
    const key = ref.trim();
    const made = newRefs.get(key);
    if (made) {
      if (made.kind !== kind) return null;
      return made.sub === undefined ? `$${made.index}` : `$${made.index}.${made.sub}`;
    }
    const table = kind === "course" ? refs.courses : kind === "category" ? refs.categories : kind === "assessment" ? refs.assessments : refs.tasks;
    return table.get(key) ?? null;
  };
  const current = {
    course: (id: string | null) => ctx.courses.find((c) => c.id === id),
    category: (id: string | null) => ctx.categories.find((c) => c.id === id),
    assessment: (id: string | null) => ctx.assessments.find((x) => x.id === id),
    task: (id: string | null) => ctx.tasks.find((x) => x.id === id),
  };

  /** The confirmed course a category op is about, or null when it goes the ordinary way. */
  const confirmedCourseOf = (raw: RawItem): string | null => {
    const confirmed = (id: string | null | undefined) => (id && !isLocalRef(id) && current.course(id)?.confirmed ? id : null);
    if (raw.op === "add_category") return confirmed(resolve(raw.course, "course"));
    if (raw.op !== "update_category" && raw.op !== "remove_category") return null;
    const ref = resolve(raw.ref, "category");
    if (!ref) return null;
    if (isLocalRef(ref)) {
      const made = items[localIndex(ref)];
      return localPart(ref) !== null && made?.op === "revise_syllabus" ? made.courseId : null;
    }
    return confirmed(current.category(ref)?.courseId);
  };
  const revisionFor = (courseId: string): Revision => {
    const existing = revisions.get(courseId);
    if (existing) return existing;
    const course = current.course(courseId);
    const entries: RevisionEntry[] = ctx.categories
      .filter((c) => c.versionId === course?.activeVersionId)
      .map((c) => ({ name: c.name, weight: c.weight, aggregationMethod: c.aggregationMethod, needsReview: c.needsReview, from: [c.id], removed: false }));
    const revision: Revision = { index: items.length, courseId, entries, changed: false, sources: [], certain: true, checks: [] };
    // Holds the item's place so later items can name its categories; filled in below.
    items.push({ op: "revise_syllabus", courseId, categories: entries, notes: null, source: "", certain: true });
    revisions.set(courseId, revision);
    return revision;
  };

  for (const raw of output.items) {
    const source = raw.source.trim().slice(0, 300);
    const fail = (why: string) => {
      notes.push(source ? `${source} (${why})` : why);
      if (raw.new_ref) failed.add(raw.new_ref.trim());
    };
    const blocked = [raw.course, raw.category].find((r) => r && failed.has(r.trim()));
    if (blocked) {
      fail("needs a new course or category that could not be added");
      continue;
    }
    const revisedCourse = confirmedCourseOf(raw);
    if (revisedCourse) {
      const revision = revisionFor(revisedCourse);
      const outcome = revise(revision, raw, (ref) => resolve(ref, "category"));
      if (typeof outcome === "string") {
        fail(outcome);
        continue;
      }
      if (outcome === null) continue; // nothing would change
      revision.changed = true;
      revision.sources.push(source);
      revision.certain &&= raw.certain;
      if (!raw.certain && raw.check) revision.checks.push(raw.check);
      if (raw.new_ref && outcome.added !== undefined) newRefs.set(raw.new_ref.trim(), { index: revision.index, kind: "category", sub: outcome.added });
      continue;
    }
    const candidate = toCandidate(raw, resolve, current, goal);
    if (typeof candidate === "string") {
      fail(candidate);
      continue;
    }
    if (candidate === null) continue; // nothing would change
    const parsed = ChangeItem.safeParse(candidate);
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? "a value is out of range");
      continue;
    }
    const item = parsed.data;
    const problem = itemProblem(item, ctx, [...items, item], items.length);
    if (problem) {
      fail(problem);
      continue;
    }
    const key = touchKey(item);
    if (key) {
      if (touched.has(key)) continue;
      touched.add(key);
    }
    const check = raw.certain ? null : raw.check?.slice(0, 200);
    items.push({ ...item, source, certain: raw.certain, ...(check ? { check } : {}) });
    if (raw.new_ref && item.op.startsWith("add_")) {
      newRefs.set(raw.new_ref.trim(), { index: items.length - 1, kind: item.op.slice(4) as "course" | "category" | "assessment" | "task" });
    }
  }

  // Each new version, checked whole; what fails goes to notes with what needed it.
  const dropped = new Set<number>();
  const positions = new Map<number, Map<number, number>>();
  for (const revision of revisions.values()) {
    if (!revision.changed) {
      dropped.add(revision.index);
      continue;
    }
    const source = [...new Set(revision.sources.filter(Boolean))].join("; ").slice(0, 300);
    const parsed = ChangeItem.safeParse({
      op: "revise_syllabus", courseId: revision.courseId, notes: source || null,
      categories: revision.entries
        .filter((e) => !e.removed)
        .map((e) => ({ name: e.name, weight: e.weight, aggregationMethod: e.aggregationMethod, needsReview: e.needsReview, from: e.from })),
    });
    const problem = parsed.success ? itemProblem(parsed.data, ctx) : (parsed.error.issues[0]?.message ?? "a value is out of range");
    if (!parsed.success || problem) {
      notes.push(source ? `${source} (${problem})` : (problem ?? ""));
      dropped.add(revision.index);
      continue;
    }
    const position = new Map<number, number>();
    revision.entries.forEach((e, k) => !e.removed && position.set(k, position.size));
    positions.set(revision.index, position);
    const check = revision.certain ? null : [...new Set(revision.checks)].join(" ").slice(0, 200);
    items[revision.index] = { ...parsed.data, source, certain: revision.certain, ...(check ? { check } : {}) };
  }
  if (revisions.size === 0) return { items, notes };

  const keep: number[] = [];
  items.forEach((item, i) => {
    if (dropped.has(i)) return;
    let broken = false;
    const renumbered = mapLocalRefs(item, (ref) => {
      const k = localIndex(ref);
      const j = localPart(ref);
      const to = j === null ? j : positions.get(k)?.get(j);
      if (dropped.has(k) || to === undefined) broken = true;
      return to === null || to === undefined ? ref : `$${k}.${to}`;
    });
    if (broken) {
      dropped.add(i);
      notes.push(item.source ? `${item.source} (needs a syllabus change that could not be drafted)` : "needs a syllabus change that could not be drafted");
      return;
    }
    items[i] = renumbered;
    keep.push(i);
  });
  return { items: subsetChangeSet(items, keep), notes };
}

type RevisionEntry = RevisedCategory & { removed: boolean };
type Revision = { index: number; courseId: string; entries: RevisionEntry[]; changed: boolean; sources: string[]; certain: boolean; checks: string[] };

/**
 * One category op applied to a course's new version. Returns the position
 * of an added category, a reason it can't apply, or null when it changes nothing.
 */
function revise(revision: Revision, raw: RawItem, resolve: (ref: string | null) => string | null): { added?: number } | string | null {
  const entryOf = (ref: string | null) => {
    if (!ref) return undefined;
    const entry = isLocalRef(ref) ? revision.entries[localPart(ref) ?? -1] : revision.entries.find((e) => !e.removed && e.from.includes(ref));
    return entry && !entry.removed ? entry : undefined;
  };
  const valid = (c: RevisedCategory) => {
    const parsed = RevisedCategory.safeParse(c);
    return parsed.success ? null : (parsed.error.issues[0]?.message ?? "a value is out of range");
  };
  switch (raw.op) {
    case "add_category": {
      if (!given(raw.weight)) return "a new category needs a weight";
      const entry: RevisionEntry = {
        name: (raw.name ?? "").trim(), weight: raw.weight, aggregationMethod: raw.aggregation_method ?? "mean_of_percentages",
        needsReview: raw.needs_review ?? false, from: [], removed: false,
      };
      const why = valid(entry);
      if (why) return why;
      revision.entries.push(entry);
      return { added: revision.entries.length - 1 };
    }
    case "update_category": {
      const entry = entryOf(resolve(raw.ref));
      if (!entry) return "no such category";
      const next = {
        ...entry,
        ...(raw.name ? { name: raw.name.trim() } : {}),
        ...(given(raw.weight) ? { weight: raw.weight } : {}),
        ...(raw.aggregation_method ? { aggregationMethod: raw.aggregation_method } : {}),
        ...(given(raw.needs_review) ? { needsReview: raw.needs_review } : {}),
      };
      const why = valid(next);
      if (why) return why;
      const same = next.name === entry.name && next.weight === entry.weight && next.aggregationMethod === entry.aggregationMethod && next.needsReview === entry.needsReview;
      if (same) return null;
      Object.assign(entry, next);
      return {};
    }
    case "remove_category": {
      const entry = entryOf(resolve(raw.ref));
      if (!entry) return "no such category";
      const target = raw.category ? entryOf(resolve(raw.category)) : null;
      if (raw.category && (!target || target === entry)) return "no category matched for its work";
      if (target) target.from.push(...entry.from);
      entry.from = [];
      entry.removed = true;
      return {};
    }
    default:
      return "not a category change";
  }
}

/** One update or remove per row per draft. */
function touchKey(item: ChangeItem): string | null {
  switch (item.op) {
    case "set_goal": return "goal";
    case "update_course": case "remove_course": return `course:${item.courseId}`;
    case "update_category": case "remove_category": return `category:${item.categoryId}`;
    case "update_assessment": case "remove_assessment": return `assessment:${item.assessmentId}`;
    case "update_task": case "remove_task": return `task:${item.taskId}`;
    default: return null;
  }
}

type Resolve = (ref: string | null, kind: "course" | "category" | "assessment" | "task") => string | null;
type Current = {
  course: (id: string | null) => StudentContext["courses"][number] | undefined;
  category: (id: string | null) => StudentContext["categories"][number] | undefined;
  assessment: (id: string | null) => StudentContext["assessments"][number] | undefined;
  task: (id: string | null) => StudentContext["tasks"][number] | undefined;
};

/** A raw item as a change-item candidate, a reason it can't be one, or null when it changes nothing. */
function toCandidate(raw: RawItem, resolve: Resolve, current: Current, goal: PromptStudent["goal"]): unknown | string | null {
  const existing = (id: string | null) => (id && !id.startsWith("$") ? id : null);
  switch (raw.op) {
    case "set_goal": {
      const school = raw.school ?? goal?.school;
      const program = raw.program ?? goal?.program;
      const targetSixAvg = raw.target_six_avg ?? goal?.targetSixAvg;
      if (!given(school) || !given(program) || !given(targetSixAvg)) return "the goal needs a school, a program and a target average";
      const item = {
        op: "set_goal", school, program, targetSixAvg,
        applicationYear: raw.application_year ?? goal?.applicationYear ?? null,
        benchmarkNote: raw.benchmark_note ?? goal?.benchmarkNote ?? null,
      };
      const same = goal && item.school === goal.school && item.program === goal.program && item.targetSixAvg === goal.targetSixAvg
        && item.applicationYear === goal.applicationYear && item.benchmarkNote === goal.benchmarkNote;
      return same ? null : item;
    }
    case "add_course":
      if (!raw.code) return "a new course needs a course code, like SBI4U";
      return {
        op: "add_course", code: raw.code ?? "", name: raw.name ?? raw.code ?? "", term: raw.term ?? "", status: raw.status ?? "active",
        inSixPlan: raw.in_six_plan ?? true, targetGrade: raw.target_grade,
      };
    case "update_course": {
      const courseId = resolve(raw.ref, "course");
      const row = current.course(existing(courseId));
      if (!courseId || !row) return "no such course";
      const patch = prune(
        { code: raw.code ?? undefined, name: raw.name ?? undefined, term: raw.term ?? undefined, status: raw.status ?? undefined, inSixPlan: raw.in_six_plan ?? undefined, targetGrade: raw.target_grade ?? undefined },
        { code: row.code, name: row.name, term: row.term, status: row.status, inSixPlan: row.inSixPlan, targetGrade: row.targetGrade },
      );
      return Object.keys(patch).length === 0 ? null : { op: "update_course", courseId, ...patch };
    }
    case "remove_course": {
      const courseId = resolve(raw.ref, "course");
      return courseId ? { op: "remove_course", courseId } : "no such course";
    }
    case "add_category": {
      const courseId = resolve(raw.course, "course");
      if (!courseId) return "no course for this category";
      return { op: "add_category", courseId, name: raw.name ?? "", weight: raw.weight, aggregationMethod: raw.aggregation_method ?? "mean_of_percentages", needsReview: raw.needs_review ?? false };
    }
    case "update_category": {
      const categoryId = resolve(raw.ref, "category");
      const row = current.category(existing(categoryId));
      if (!categoryId || !row) return "no such category";
      const patch = prune(
        { name: raw.name ?? undefined, weight: raw.weight ?? undefined, aggregationMethod: raw.aggregation_method ?? undefined, needsReview: raw.needs_review ?? undefined },
        { name: row.name, weight: row.weight, aggregationMethod: row.aggregationMethod, needsReview: row.needsReview },
      );
      return Object.keys(patch).length === 0 ? null : { op: "update_category", categoryId, ...patch };
    }
    case "remove_category": {
      const categoryId = resolve(raw.ref, "category");
      return categoryId ? { op: "remove_category", categoryId } : "no such category";
    }
    case "add_assessment": {
      const categoryId = resolve(raw.category, "category");
      const courseId = resolve(raw.course, "course") ?? (categoryId ? current.category(existing(categoryId))?.courseId ?? null : null);
      if (!courseId) return "no course for this work";
      if (!categoryId) return "no category matched";
      return {
        op: "add_assessment", courseId, categoryId, title: (raw.title ?? "").trim(), dueDate: isoDate(raw.due_date),
        scorePossible: raw.score_possible ?? 100, scoreEarned: raw.score_earned, excused: raw.excused ?? false,
      };
    }
    case "update_assessment": {
      const assessmentId = resolve(raw.ref, "assessment");
      const row = current.assessment(existing(assessmentId));
      if (!assessmentId || !row) return "no such assessment";
      const categoryId = raw.category ? resolve(raw.category, "category") : null;
      if (raw.category && !categoryId) return "no category matched";
      const score =
        given(raw.score_possible) ? { scoreEarned: raw.score_earned, scorePossible: raw.score_possible, excused: raw.excused ?? false }
        : given(raw.score_earned) ? { scoreEarned: raw.score_earned, excused: raw.excused ?? false }
        : given(raw.excused) ? { excused: raw.excused }
        : {};
      const patch = prune(
        { title: raw.title ?? undefined, categoryId: categoryId ?? undefined, dueDate: given(raw.due_date) ? isoDate(raw.due_date) : undefined, ...score },
        { title: row.title, categoryId: row.categoryId, dueDate: row.dueDate, scoreEarned: row.scoreEarned, scorePossible: row.scorePossible, excused: row.excused },
      );
      return Object.keys(patch).length === 0 ? null : { op: "update_assessment", assessmentId, ...patch };
    }
    case "remove_assessment": {
      const assessmentId = resolve(raw.ref, "assessment");
      return assessmentId ? { op: "remove_assessment", assessmentId } : "no such assessment";
    }
    case "add_task": {
      const courseId = raw.course ? resolve(raw.course, "course") : null;
      if (raw.course && !courseId) return "no such course";
      return { op: "add_task", courseId, title: (raw.title ?? "").trim(), kind: raw.kind ?? "school", reason: raw.reason, pinned: raw.pinned ?? false };
    }
    case "update_task": {
      const taskId = resolve(raw.ref, "task");
      const row = current.task(existing(taskId));
      if (!taskId || !row) return "no such task";
      const courseId = raw.course ? resolve(raw.course, "course") : undefined;
      if (raw.course && !courseId) return "no such course";
      const patch = prune(
        { title: raw.title ?? undefined, courseId, reason: raw.reason ?? undefined, pinned: raw.pinned ?? undefined },
        { title: row.title, courseId: row.courseId, reason: row.reason, pinned: row.pinned },
      );
      return Object.keys(patch).length === 0 ? null : { op: "update_task", taskId, ...patch };
    }
    case "remove_task": {
      const taskId = resolve(raw.ref, "task");
      return taskId ? { op: "remove_task", taskId } : "no such task";
    }
  }
}
