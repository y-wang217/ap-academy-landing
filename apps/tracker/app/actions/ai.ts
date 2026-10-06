"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiConfigured } from "@/lib/ai/config";
import { askModel, type Attachment } from "@/lib/ai/draft";
import { buildUserMessage, stripPersonalData, toDraftItems, type DraftItem } from "@/lib/ai/prompt";
import { isTranscriptName, transcriptWords } from "@/lib/ai/transcript";
import { ChangeItem, applyChangeSet, contextFromBundle, dependencies, localIndex, localPart, subsetChangeSet, validateChangeSet, type StudentContext } from "@/lib/data/change-set";
import { dbMessage } from "@/lib/data/errors";
import { getViewer, loadBundle } from "@/lib/data/queries";
import { TUNING } from "@/lib/domain/tuning";
import { points, shortDate } from "@/lib/format";
import { failed, type Result } from "@/lib/result";

// AI draft, preview, confirm, save (ADRs 0026, 0028, 0029). The model only
// drafts. The draft is stored server-side; confirm applies the teacher's
// selection from that stored draft, never from the browser.

export type PreviewItem = {
  index: number;
  kind: "add" | "change" | "remove";
  /** What the change is about: course code, category name, assessment or task title, "Goal". */
  title: string;
  detail: string;
  before: string | null;
  after: string;
  source: string;
  certain: boolean;
  /** For an uncertain change: what to confirm. */
  check: string | null;
  /** Earlier items this one needs (a new course for its categories, say). */
  dependsOn: number[];
};

export type DraftPreview =
  | { ok: true; draftId: string; items: PreviewItem[]; notes: string[] }
  | { ok: false; error: string };

const StoredDraft = z.object({
  studentId: z.guid(),
  items: z.array(z.unknown()),
  notes: z.array(z.string()),
});

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

async function staff() {
  const viewer = await getViewer();
  return viewer.kind === "staff" ? viewer : null;
}

function scoreText(earned: number | null, possible: number, excused: boolean): string {
  if (excused) return "Excused";
  return earned === null ? `Unmarked, out of ${points(possible)}` : `${points(earned)} / ${points(possible)}`;
}

const STATUS = { planned: "planned", active: "active", completed: "completed" } as const;
const METHOD = { mean_of_percentages: "average of percentages", pooled_points: "total points" } as const;

/** The preview rows: each change against the current value. Pure over the context. */
function preview(items: DraftItem[], ctx: StudentContext): PreviewItem[] {
  const courseLabel = (ref: string) => {
    if (ref.startsWith("$")) {
      const made = items[localIndex(ref)];
      return made?.op === "add_course" ? made.code : "new course";
    }
    return ctx.courses.find((c) => c.id === ref)?.code ?? "";
  };
  const categoryLabel = (ref: string) => {
    if (ref.startsWith("$")) {
      const made = items[localIndex(ref)];
      const j = localPart(ref);
      if (j !== null) return made?.op === "revise_syllabus" ? made.categories[j]?.name ?? "new category" : "new category";
      return made?.op === "add_category" ? made.name : "new category";
    }
    return ctx.categories.find((c) => c.id === ref)?.name ?? "";
  };
  const join = (parts: (string | null | undefined)[]) => parts.filter((p): p is string => !!p).join(" · ");
  const courseFields = (c: { code?: string; name?: string; term?: string; status?: string; inSixPlan?: boolean; targetGrade?: number | null }) =>
    join([
      c.name, c.term || null, c.status ? STATUS[c.status as keyof typeof STATUS] : null,
      c.inSixPlan === undefined ? null : c.inSixPlan ? "in the six-course plan" : "not in the six-course plan",
      c.targetGrade === undefined ? null : c.targetGrade === null ? "no target" : `target ${points(c.targetGrade)}%`,
    ]);
  const categoryFields = (c: { weight?: number; aggregationMethod?: keyof typeof METHOD; needsReview?: boolean }) =>
    join([
      c.weight === undefined ? null : `${points(c.weight)}%`, c.aggregationMethod ? METHOD[c.aggregationMethod] : null,
      c.needsReview === undefined ? null : c.needsReview ? "needs review" : "reviewed",
    ]);
  const taskFields = (t: { kind?: string; reason?: string | null; pinned?: boolean; courseId?: string | null }) =>
    join([
      t.courseId === undefined ? null : t.courseId === null ? "no course" : courseLabel(t.courseId),
      t.kind === undefined ? null : t.kind === "school" ? "school work" : "extra practice",
      t.pinned === undefined ? null : t.pinned ? "pinned" : "not pinned", t.reason ?? null,
    ]);

  return items.map((item, index) => {
    const common = { index, source: item.source, certain: item.certain, check: item.check ?? null, dependsOn: dependencies(item) };
    switch (item.op) {
      case "set_goal":
        return { ...common, kind: "change", title: "Goal", detail: join([item.program, item.school, item.applicationYear ? `apply ${item.applicationYear}` : null]), before: null, after: `Target ${points(item.targetSixAvg)}%` };
      case "add_course":
        return { ...common, kind: "add", title: item.code, detail: "New course", before: null, after: courseFields(item) };
      case "update_course": {
        const c = ctx.courses.find((x) => x.id === item.courseId);
        const patch = fieldsOf(item, "courseId");
        return { ...common, kind: "change", title: c?.code ?? courseLabel(item.courseId), detail: "Course", before: c ? courseFields(pick(c, patch)) : null, after: courseFields(patch) };
      }
      case "remove_course":
        return { ...common, kind: "remove", title: courseLabel(item.courseId), detail: "Remove the course and everything in it", before: null, after: "Removed" };
      case "add_category":
        return { ...common, kind: "add", title: item.name, detail: `New category · ${courseLabel(item.courseId)}`, before: null, after: categoryFields(item) };
      case "update_category": {
        const c = ctx.categories.find((x) => x.id === item.categoryId);
        const patch = fieldsOf(item, "categoryId");
        return { ...common, kind: "change", title: item.name ?? c?.name ?? categoryLabel(item.categoryId), detail: c ? `Category · ${courseLabel(c.courseId)}` : "Category", before: c ? categoryFields(pick(c, patch)) : null, after: categoryFields(patch) };
      }
      case "remove_category":
        return { ...common, kind: "remove", title: categoryLabel(item.categoryId), detail: "Remove the category", before: null, after: "Removed" };
      case "add_assessment":
        return { ...common, kind: "add", title: item.title, detail: `New · ${courseLabel(item.courseId)} · ${categoryLabel(item.categoryId)} · ${shortDate(item.dueDate)}`, before: null, after: scoreText(item.scoreEarned, item.scorePossible, item.excused) };
      case "update_assessment": {
        const a = ctx.assessments.find((x) => x.id === item.assessmentId);
        const scored = item.scoreEarned !== undefined || item.scorePossible !== undefined || item.excused !== undefined;
        const details = join([
          a ? courseLabel(a.courseId) : null,
          item.title !== undefined ? `renamed to "${item.title}"` : null,
          item.categoryId !== undefined ? `moved to ${categoryLabel(item.categoryId)}` : null,
          item.dueDate !== undefined ? `due ${shortDate(item.dueDate)}` : null,
        ]);
        return {
          ...common, kind: "change", title: a?.title ?? "", detail: details || "Score",
          before: a && scored ? scoreText(a.scoreEarned, a.scorePossible, a.excused) : null,
          after: scored && a ? scoreText(item.scoreEarned !== undefined ? item.scoreEarned : a.scoreEarned, item.scorePossible ?? a.scorePossible, item.excused ?? a.excused) : "Updated",
        };
      }
      case "remove_assessment":
        return { ...common, kind: "remove", title: ctx.assessments.find((x) => x.id === item.assessmentId)?.title ?? "", detail: "Remove the assessment", before: null, after: "Removed" };
      case "add_task":
        return { ...common, kind: "add", title: item.title, detail: "New priority", before: null, after: taskFields(item) };
      case "update_task": {
        const t = ctx.tasks.find((x) => x.id === item.taskId);
        const patch = fieldsOf(item, "taskId");
        return { ...common, kind: "change", title: item.title ?? t?.title ?? "", detail: "Priority", before: t ? taskFields(pick(t, patch)) : null, after: taskFields(patch) || "Updated" };
      }
      case "remove_task":
        return { ...common, kind: "remove", title: ctx.tasks.find((x) => x.id === item.taskId)?.title ?? "", detail: "Remove the priority", before: null, after: "Removed" };
      case "revise_syllabus": {
        const course = ctx.courses.find((c) => c.id === item.courseId);
        const current = ctx.categories.filter((c) => c.versionId === course?.activeVersionId);
        const nameOf = (id: string) => current.find((c) => c.id === id)?.name ?? "";
        const version = (n: number) => `${points(n)}%`;
        const before = current.map((c) => `${c.name} ${version(c.weight)}`).join(" · ");
        const after = item.categories
          .map((c) => {
            const merged = c.from.map(nameOf).filter((name) => name !== c.name);
            const tag = c.from.length === 0 ? " (new)" : merged.length > 0 ? ` (with ${merged.join(", ")})` : "";
            return `${c.name} ${version(c.weight)}${tag}`;
          })
          .join(" · ");
        return { ...common, kind: "change", title: `${course?.code ?? ""} syllabus`, detail: "New syllabus version. Past marks move with their categories", before, after };
      }
    }
  });
}

/** An update item's fields, without the op and the row it names. */
function fieldsOf<T extends { op: string }>(item: T, idKey: keyof T): Omit<T, "op" | typeof idKey> {
  const out = { ...item } as Partial<T>;
  delete out.op;
  delete out[idKey];
  return out as Omit<T, "op" | typeof idKey>;
}

/** The current values of the fields a patch touches. */
function pick<T extends object>(row: T, patch: object): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) if (key in row) out[key] = row[key];
  return out;
}

export type DraftScope = { studentId: string; courseId?: string | null };

/**
 * Draft changes from what the teacher sent: text (material or a request) and
 * attachments (photos, PDFs, transcript files). Nothing is written.
 */
export async function draftChanges(scope: DraftScope, form: FormData): Promise<DraftPreview> {
  if (!aiConfigured()) return { ok: false, error: "AI drafting is not set up." };
  const v = await staff();
  if (!v) return { ok: false, error: "You don't have access to that." };
  if (!z.guid().safeParse(scope.studentId).success) return { ok: false, error: "You don't have access to that." };

  // What was sent: words from the text box and transcript files, and the files the model reads itself.
  const texts = [String(form.get("text") ?? "").trim()];
  const attachments: Attachment[] = [];
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > TUNING.aiMaxFiles) return { ok: false, error: `Attach at most ${TUNING.aiMaxFiles} files at a time.` };
  for (const file of files) {
    if (file.size > TUNING.aiMaxFileBytes) return { ok: false, error: `${file.name} is too large. Files can be up to ${Math.round(TUNING.aiMaxFileBytes / 1024 / 1024)} MB.` };
    if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
      attachments.push({ kind: "image", mediaType: file.type as ImageType, data: Buffer.from(await file.arrayBuffer()).toString("base64") });
    } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      attachments.push({ kind: "pdf", data: Buffer.from(await file.arrayBuffer()).toString("base64") });
    } else if (isTranscriptName(file.name) || file.type.startsWith("text/")) {
      texts.push(transcriptWords(await file.text()));
    } else {
      return { ok: false, error: `${file.name}: send a photo, a PDF, or a transcript (.vtt, .srt or .txt).` };
    }
  }
  const text = texts.filter(Boolean).join("\n\n");
  if (text.length === 0 && attachments.length === 0) return { ok: false, error: "Write what changed, or attach a photo or a transcript." };
  if (text.length > TUNING.aiMaxTextChars) return { ok: false, error: `That is too long (${text.length.toLocaleString()} characters). Send at most ${TUNING.aiMaxTextChars.toLocaleString()} at a time.` };

  const bundle = await loadBundle(v.db, scope.studentId).catch(() => null);
  if (!bundle || bundle.student.orgId !== v.orgId) return { ok: false, error: "You don't have access to that." };
  const ctx = contextFromBundle(bundle);
  const courseId = scope.courseId && ctx.courses.some((c) => c.id === scope.courseId) ? scope.courseId : null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await v.db.tracker
    .from("ai_drafts").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).gte("created_at", since);
  if (countError) return { ok: false, error: dbMessage(countError) };
  if ((count ?? 0) >= TUNING.aiDailyDraftsPerOrg) return { ok: false, error: "Daily AI draft limit reached. Enter changes by hand or try tomorrow." };

  const row = await v.db.tracker
    .from("ai_drafts")
    .insert({ org_id: ctx.orgId, student_id: ctx.studentId, course_id: courseId, input_chars: text.length, input_files: attachments.length })
    .select("id")
    .single();
  if (row.error || !row.data) return { ok: false, error: dbMessage(row.error) };
  const draftId = row.data.id as string;

  const sent = stripPersonalData(text, bundle.student.firstName, bundle.student.lastInitial);
  const message = buildUserMessage(bundle, sent, courseId, attachments.length);
  const answer = await askModel(message.text, attachments);
  if (!answer.ok) {
    await v.db.tracker.from("ai_drafts").update({ status: "failed", model: answer.model, error: answer.error.slice(0, 500) }).eq("id", draftId);
    return { ok: false, error: answer.error };
  }

  const { items, notes } = toDraftItems(answer.output, message.refs, ctx, bundle.goal);
  const saved = await v.db.tracker
    .from("ai_drafts")
    .update({
      status: "drafted", model: answer.model, input_tokens: answer.inputTokens, output_tokens: answer.outputTokens,
      draft: { studentId: ctx.studentId, items, notes },
    })
    .eq("id", draftId);
  if (saved.error) return { ok: false, error: dbMessage(saved.error) };
  revalidatePath("/", "layout");
  return { ok: true, draftId, items: preview(items, ctx), notes };
}

const ConfirmInput = z.object({ draftId: z.guid(), selected: z.array(z.number().int().min(0)).max(200) });

/**
 * Save the teacher's selection from a stored draft. A change that another
 * selected change depends on is saved with it. A draft is saved at most once.
 */
export async function confirmDraft(draftId: string, selected: number[]): Promise<Result> {
  const v = await staff();
  if (!v) return failed("You don't have access to that.");
  const input = ConfirmInput.safeParse({ draftId, selected });
  if (!input.success) return failed("Something went wrong. Try again.");

  const { data } = await v.db.tracker.from("ai_drafts").select("draft, status").eq("id", draftId).maybeSingle();
  if (!data || data.status !== "drafted") return failed("This draft was already saved or discarded.");
  const stored = StoredDraft.safeParse(data.draft);
  if (!stored.success) return failed("This draft can't be read. Draft it again.");
  const parsed = stored.data.items.map((item) => ChangeItem.safeParse(item));
  if (parsed.some((p) => !p.success)) return failed("This draft can't be read. Draft it again.");
  const all = parsed.map((p) => p.data as ChangeItem);
  const items = subsetChangeSet(all, input.data.selected.filter((i) => i < all.length));
  if (items.length === 0) return failed("Tick at least one change to save.");

  // Claim the draft first, so a double click can't save it twice.
  const claim = await v.db.tracker
    .from("ai_drafts").update({ status: "applied" }).eq("id", draftId).eq("status", "drafted").select("id");
  if (claim.error) return failed(dbMessage(claim.error));
  if ((claim.data ?? []).length === 0) return failed("This draft was already saved or discarded.");

  const bundle = await loadBundle(v.db, stored.data.studentId).catch(() => null);
  if (!bundle || bundle.student.orgId !== v.orgId) return failed("You don't have access to that.");
  const ctx = contextFromBundle(bundle);
  const checked = validateChangeSet(items, ctx);
  const result = checked.error ? { applied: 0, error: checked.error } : await applyChangeSet(v.db, ctx, items);
  revalidatePath("/", "layout");
  if (result.error) {
    await v.db.tracker.from("ai_drafts").update({ error: result.error.slice(0, 500) }).eq("id", draftId);
    return failed(result.error);
  }
  return { ok: true, message: result.applied === 1 ? "Saved 1 change" : `Saved ${result.applied} changes` };
}

export async function discardDraft(draftId: string): Promise<Result> {
  const v = await staff();
  if (!v) return failed("You don't have access to that.");
  if (!z.guid().safeParse(draftId).success) return failed("Something went wrong. Try again.");
  const { error } = await v.db.tracker.from("ai_drafts").update({ status: "discarded" }).eq("id", draftId).eq("status", "drafted");
  revalidatePath("/", "layout");
  return error ? failed(dbMessage(error)) : { ok: true, message: "Discarded" };
}
