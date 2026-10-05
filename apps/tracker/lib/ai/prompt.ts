/**
 * What goes to the model and how its answer becomes a change set (ADR 0026).
 * Pure: no SDK, no database. The model sees short refs (A1, C1), never row
 * ids, and never the student's name, email, school or program.
 */
import { z } from "zod";
import { ChangeItem, type CourseContext } from "../data/change-set";

/** The model's answer. Kept flat and loose; every field is checked after. */
export const AiOutput = z.object({
  items: z.array(
    z.object({
      op: z.enum(["add_assessment", "set_score"]),
      assessment: z.string().nullable().describe("Ref of the existing assessment (A1, A2, ...) for set_score, else null"),
      category: z.string().nullable().describe("Ref of the category (C1, C2, ...) for add_assessment, else null"),
      title: z.string().nullable().describe("Title for add_assessment, else null"),
      due_date: z.string().nullable().describe("YYYY-MM-DD, or null if not given"),
      score_earned: z.number().nullable().describe("Marks earned, or null when not marked yet"),
      score_possible: z.number().nullable().describe("Marks possible. 100 when only a percentage is given"),
      excused: z.boolean().nullable().describe("true when the work is excused or exempt"),
      source: z.string().describe("The line of the pasted text this change comes from, copied exactly"),
    }),
  ),
  unmatched: z.array(z.string()).describe("Lines about this course's work that could not be matched with confidence"),
});
export type AiOutput = z.output<typeof AiOutput>;

export const SYSTEM_PROMPT = `You turn text that a tutor pasted from a school grade portal, report card or email into proposed changes to one course in a grade tracker. The tutor reviews every change before anything is saved, so propose only what the text supports.

- Use set_score when a line is about an assessment already in the course (titles may differ slightly, like "Unit 3 Test" and "U3 test"). Use add_assessment for work that is not in the list, and pick the category it belongs to.
- Give score_earned and score_possible as numbers. A percentage on its own means score_possible 100. A blank, dash or "not marked" means score_earned null. "Excused", "EX" or "exempt" means excused true.
- Leave out an existing assessment whose score, total and excused state would not change.
- Ignore course averages, term marks, category weights, comments and anything about other students or other courses.
- If a line is about this course's work but you cannot tell which assessment or category it belongs to, put it in unmatched instead of guessing.
- For source, copy the line the change comes from.`;

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

export type Refs = { assessments: Map<string, string>; categories: Map<string, string> };

export type PromptCourse = { code: string; name: string; categories: { id: string; name: string; weight: number }[] };

/** The user message: the course as refs, then the pasted text. */
export function buildUserMessage(course: PromptCourse, ctx: CourseContext, pasted: string): { text: string; refs: Refs } {
  const refs: Refs = { assessments: new Map(), categories: new Map() };
  const categoryRef = new Map<string, string>();
  const categories = course.categories
    .filter((c) => ctx.categories.some((k) => k.id === c.id))
    .map((c, i) => {
      const ref = `C${i + 1}`;
      refs.categories.set(ref, c.id);
      categoryRef.set(c.id, ref);
      return { ref, name: c.name, weight: c.weight };
    });
  const assessments = ctx.assessments.map((a, i) => {
    const ref = `A${i + 1}`;
    refs.assessments.set(ref, a.id);
    return { ref, title: a.title, score_earned: a.scoreEarned, score_possible: a.scorePossible, excused: a.excused };
  });
  const course_ = { code: course.code, name: course.name, categories, assessments };
  const text = `The course as it is now:\n${JSON.stringify(course_, null, 1)}\n\nThe pasted text:\n<pasted>\n${pasted}\n</pasted>`;
  return { text, refs };
}

export type DraftItem = ChangeItem & { source: string };

/**
 * The model's answer as change items. Anything that doesn't map to this
 * course or fails the same bounds as the forms goes to notes, never to items.
 */
export function toDraftItems(output: AiOutput, refs: Refs, ctx: CourseContext): { items: DraftItem[]; notes: string[] } {
  const items: DraftItem[] = [];
  const notes = output.unmatched.map((line) => line.trim()).filter(Boolean);
  const seen = new Set<string>();

  for (const raw of output.items) {
    const source = raw.source.trim().slice(0, 300);
    let candidate: unknown;
    if (raw.op === "set_score") {
      const id = raw.assessment ? refs.assessments.get(raw.assessment.trim()) : undefined;
      const current = ctx.assessments.find((a) => a.id === id);
      if (!id || !current) {
        notes.push(source || "A score for an assessment that could not be matched");
        continue;
      }
      candidate = {
        op: "set_score",
        assessmentId: id,
        scoreEarned: raw.score_earned,
        scorePossible: raw.score_possible ?? current.scorePossible,
        excused: raw.excused ?? false,
      };
    } else {
      const categoryId = raw.category ? refs.categories.get(raw.category.trim()) : undefined;
      if (!categoryId) {
        notes.push(source || `${raw.title ?? "New work"}: no category matched`);
        continue;
      }
      candidate = {
        op: "add_assessment",
        title: (raw.title ?? "").trim(),
        categoryId,
        dueDate: raw.due_date && /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date) ? raw.due_date : null,
        scorePossible: raw.score_possible ?? 100,
        scoreEarned: raw.score_earned,
      };
    }
    const parsed = ChangeItem.safeParse(candidate);
    if (!parsed.success) {
      notes.push(source || "A change with values out of range");
      continue;
    }
    const item = parsed.data;
    if (item.op === "set_score") {
      const current = ctx.assessments.find((a) => a.id === item.assessmentId);
      const unchanged = current && current.scoreEarned === item.scoreEarned && current.scorePossible === item.scorePossible && current.excused === item.excused;
      if (unchanged || seen.has(item.assessmentId)) continue;
      seen.add(item.assessmentId);
    }
    items.push({ ...item, source });
  }
  return { items, notes };
}
