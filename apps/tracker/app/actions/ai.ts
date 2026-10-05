"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiConfigured } from "@/lib/ai/config";
import { askModel } from "@/lib/ai/draft";
import { buildUserMessage, stripPersonalData, toDraftItems, type DraftItem } from "@/lib/ai/prompt";
import { applyChangeSet, ChangeItem, loadCourseContext, type CourseContext } from "@/lib/data/change-set";
import { dbMessage } from "@/lib/data/errors";
import { getViewer, loadBundle } from "@/lib/data/queries";
import { TUNING } from "@/lib/domain/tuning";
import { points, shortDate } from "@/lib/format";
import { failed, type Result } from "@/lib/result";

// AI paste, preview, confirm, save (ADRs 0026, 0027). The model only drafts.
// The draft is stored server-side; confirm applies the teacher's selection
// from that stored draft, never from the browser.

export type PreviewItem = {
  index: number;
  kind: "add" | "score";
  title: string;
  detail: string;
  before: string | null;
  after: string;
  source: string;
};

export type DraftPreview =
  | { ok: true; draftId: string; items: PreviewItem[]; notes: string[] }
  | { ok: false; error: string };

const StoredDraft = z.object({
  courseId: z.guid(),
  items: z.array(z.unknown()),
  notes: z.array(z.string()),
});

async function staff() {
  const viewer = await getViewer();
  return viewer.kind === "staff" ? viewer : null;
}

function scoreText(earned: number | null, possible: number, excused: boolean): string {
  if (excused) return "Excused";
  return earned === null ? `Unmarked, out of ${points(possible)}` : `${points(earned)} / ${points(possible)}`;
}

function preview(items: DraftItem[], ctx: CourseContext): PreviewItem[] {
  const category = new Map(ctx.categories.map((c) => [c.id, c.name]));
  return items.map((item, index) => {
    if (item.op === "add_assessment") {
      return {
        index, kind: "add", title: item.title, detail: `New · ${category.get(item.categoryId) ?? ""} · ${shortDate(item.dueDate)}`,
        before: null, after: scoreText(item.scoreEarned, item.scorePossible, false), source: item.source,
      };
    }
    const current = ctx.assessments.find((a) => a.id === item.assessmentId);
    return {
      index, kind: "score", title: current?.title ?? "", detail: "Score",
      before: current ? scoreText(current.scoreEarned, current.scorePossible, current.excused) : null,
      after: scoreText(item.scoreEarned, item.scorePossible, item.excused), source: item.source,
    };
  });
}

export async function draftFromPaste(courseId: string, form: FormData): Promise<DraftPreview> {
  if (!aiConfigured()) return { ok: false, error: "AI drafting is not set up." };
  const v = await staff();
  if (!v) return { ok: false, error: "You don't have access to that." };
  const text = String(form.get("text") ?? "").trim();
  if (text.length === 0) return { ok: false, error: "Paste some text first." };
  if (text.length > TUNING.aiMaxPasteChars) return { ok: false, error: `Paste at most ${TUNING.aiMaxPasteChars} characters at a time.` };

  const ctx = await loadCourseContext(v.db, courseId);
  if (!ctx) return { ok: false, error: "You don't have access to that." };
  if (ctx.categories.length === 0) return { ok: false, error: "Add syllabus categories before drafting." };
  const bundle = await loadBundle(v.db, ctx.studentId);
  const course = bundle?.courses.find((c) => c.id === courseId);
  if (!bundle || !course) return { ok: false, error: "You don't have access to that." };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await v.db.tracker
    .from("ai_drafts").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).gte("created_at", since);
  if (countError) return { ok: false, error: dbMessage(countError) };
  if ((count ?? 0) >= TUNING.aiDailyDraftsPerOrg) return { ok: false, error: "Daily AI draft limit reached. Enter changes by hand or try tomorrow." };

  const row = await v.db.tracker
    .from("ai_drafts")
    .insert({ org_id: ctx.orgId, student_id: ctx.studentId, course_id: courseId, input_chars: text.length })
    .select("id")
    .single();
  if (row.error || !row.data) return { ok: false, error: dbMessage(row.error) };
  const draftId = row.data.id as string;

  const categories = bundle.categories
    .filter((c) => c.versionId === course.activeVersionId)
    .map((c) => ({ id: c.id, name: c.name, weight: c.weight }));
  const pasted = stripPersonalData(text, bundle.student.firstName, bundle.student.lastInitial);
  const message = buildUserMessage({ code: course.code, name: course.name, categories }, ctx, pasted);
  const answer = await askModel(message.text);
  if (!answer.ok) {
    await v.db.tracker.from("ai_drafts").update({ status: "failed", model: answer.model, error: answer.error.slice(0, 500) }).eq("id", draftId);
    return { ok: false, error: answer.error };
  }

  const { items, notes } = toDraftItems(answer.output, message.refs, ctx);
  const saved = await v.db.tracker
    .from("ai_drafts")
    .update({
      status: "drafted", model: answer.model, input_tokens: answer.inputTokens, output_tokens: answer.outputTokens,
      draft: { courseId, items, notes },
    })
    .eq("id", draftId);
  if (saved.error) return { ok: false, error: dbMessage(saved.error) };
  return { ok: true, draftId, items: preview(items, ctx), notes };
}

const ConfirmInput = z.object({ draftId: z.guid(), selected: z.array(z.number().int().min(0)).max(200) });

/** Save the teacher's selection from a stored draft. A draft is saved at most once. */
export async function confirmDraft(draftId: string, selected: number[]): Promise<Result> {
  const v = await staff();
  if (!v) return failed("You don't have access to that.");
  const input = ConfirmInput.safeParse({ draftId, selected });
  if (!input.success) return failed("Something went wrong. Try again.");

  const { data } = await v.db.tracker.from("ai_drafts").select("draft, status").eq("id", draftId).maybeSingle();
  if (!data || data.status !== "drafted") return failed("This draft was already saved or discarded.");
  const stored = StoredDraft.safeParse(data.draft);
  if (!stored.success) return failed("This draft can't be read. Draft it again.");
  const items = [...new Set(input.data.selected)]
    .sort((a, b) => a - b)
    .map((i) => stored.data.items[i])
    .filter((item) => item !== undefined)
    .map((item) => ChangeItem.safeParse(item));
  if (items.length === 0) return failed("Tick at least one change to save.");
  if (items.some((i) => !i.success)) return failed("This draft can't be read. Draft it again.");

  // Claim the draft first, so a double click can't save it twice.
  const claim = await v.db.tracker
    .from("ai_drafts").update({ status: "applied" }).eq("id", draftId).eq("status", "drafted").select("id");
  if (claim.error) return failed(dbMessage(claim.error));
  if ((claim.data ?? []).length === 0) return failed("This draft was already saved or discarded.");

  const ctx = await loadCourseContext(v.db, stored.data.courseId);
  if (!ctx) return failed("You don't have access to that.");
  const result = await applyChangeSet(v.db, ctx, items.map((i) => i.data as ChangeItem));
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
  return error ? failed(dbMessage(error)) : { ok: true, message: "Discarded" };
}
