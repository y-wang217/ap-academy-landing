import { buildTeacherDays, dailyTaskTitle, NO_CLASSES, planRefresh, RESEND_LABEL, type StoredTeacher, type TeacherDay } from "../domain/schedule/daily-texts";
import type { Occurrence } from "../domain/schedule/recurrence";
import { isActiveTeachingStaff } from "../domain/staff";
import type { StaffRecord } from "../notion/staff";
import type { LogInput, TaskPage, TeacherRender, ToDo } from "../notion/work";
import { localHhmm } from "../time";
import type { DailyTaskStore } from "./daily-task-store";
import { isAmbiguous } from "./notion-errors";

/** The Notion side, injected so tests never touch Notion. The real one wraps lib/notion/work.ts. */
export type DailyNotion = {
  find(title: string): Promise<TaskPage | null>;
  create(input: { date: string; title: string; intro: string; teachers: TeacherRender[] }): Promise<TaskPage>;
  list(pageId: string): Promise<{ introId: string | null; todos: ToDo[] }>;
  update(blockId: string, teacher: TeacherRender, label: string): Promise<string>;
  append(pageId: string, teacher: TeacherRender, label: string): Promise<{ blockId: string; lastEditedTime: string }>;
  updateIntro(blockId: string, text: string): Promise<void>;
  createLog(input: LogInput): Promise<string>;
  updateLog(logId: string, decisions: string): Promise<void>;
};
export type DailyTaskDeps = {
  store: DailyTaskStore;
  notion: DailyNotion;
  fetchStaff: () => Promise<StaffRecord[]>;
  studentNames: () => Promise<Map<string, string>>;
  /** Every occurrence on `date`, cancelled ones included. */
  occurrencesOn: (date: string) => Promise<Occurrence[]>;
  scheduleUrl: (staffId: string, date: string) => string;
  now: () => Date;
  /** The Work Log entry's Session link: the admin schedule page. */
  sessionLink: string;
};
/**
 * `uncertain`: a call that adds to Notion (a to-do, the Work Log entry) failed
 * in a way where Notion may have applied it anyway. It is never repeated
 * automatically; Charlie checks the task and retries (REQ-35 AC7).
 */
export type DailyTaskResult = "created" | "updated" | "unchanged" | "skipped" | "busy" | "failed" | "uncertain";
export type DailyTaskMode = "create" | "refresh_only";

const LEASE_SECONDS = 60;
const MAX_ERROR = 300;
const INTRO = "Nothing is sent automatically. Tick a teacher after you text them.";
const introText = (hhmm: string) => `${INTRO} Last updated ${hhmm}`;
const UNCERTAIN = "Notion may have saved this. Check the task, then retry.";

const render = (d: TeacherDay): TeacherRender => ({
  todoText: d.title,
  bullets: d.lines.length > 0 ? d.lines.map((l) => l.text) : [NO_CLASSES],
  linkLabel: `${d.name}'s schedule`,
  linkUrl: d.linkUrl,
  copyText: d.copyText,
});

/** A NotionError message is a status line and safe to keep; anything else may carry names, so it is replaced. */
function errorText(e: unknown): string {
  if (e instanceof Error && e.name === "NotionError") return e.message.slice(0, MAX_ERROR);
  return "Could not update the Notion task";
}

/**
 * Makes today's task exist (`create`) or refreshes it if it does (`refresh_only`).
 * Never throws: a failure is recorded on the row (state `failed`, short error,
 * no Notion payloads) and the caller's own write stands. Concurrent runs are
 * kept apart by a lease; a retry after a half-finished create adopts the page
 * it finds by exact title instead of making a second one (tracker ADR 0039).
 */
export async function ensureDailyTask(deps: DailyTaskDeps, input: { date: string; mode: DailyTaskMode }): Promise<DailyTaskResult> {
  return (await ensureDailyTaskDetail(deps, input)).result;
}

/** ensureDailyTask with the error behind a `failed`, which the outbox classifies for backoff (REQ-35). */
export async function ensureDailyTaskDetail(deps: DailyTaskDeps, input: { date: string; mode: DailyTaskMode }): Promise<{ result: DailyTaskResult; error?: unknown }> {
  const { date } = input;
  let existing;
  try {
    existing = await deps.store.get(date);
    if (input.mode === "refresh_only" && !existing?.notionPageId) return { result: "skipped" };
  } catch (e) {
    return { result: "failed", error: e };
  }
  let row;
  try {
    row = await deps.store.claim(date, LEASE_SECONDS);
  } catch (e) {
    return { result: "failed", error: e };
  }
  if (!row) return { result: "busy" };

  let result: DailyTaskResult = "unchanged";
  let refreshCount = row.refreshCount;
  // True while a call that adds to Notion is in flight: its failure may still have landed.
  let adding = false;
  try {
    const [staff, names, occurrences] = await Promise.all([deps.fetchStaff(), deps.studentNames(), deps.occurrencesOn(date)]);
    const days = buildTeacherDays({
      date,
      staff: staff.map((s) => ({ id: s.id, name: s.name, active: isActiveTeachingStaff(s) })),
      occurrences,
      studentNames: names,
      scheduleUrl: deps.scheduleUrl,
    });
    const hhmm = localHhmm(deps.now());
    let pageId = row.notionPageId;
    let pageUrl = row.notionPageUrl;
    let logId = row.notionLogId;

    if (!pageId) {
      const title = dailyTaskTitle(date);
      const found = await deps.notion.find(title);
      const page = found ?? (await deps.notion.create({ date, title, intro: introText(hhmm), teachers: days.map(render) }));
      pageId = page.pageId;
      pageUrl = page.pageUrl;
      await deps.store.save(row.id, { notionPageId: pageId, notionPageUrl: pageUrl });
      const { todos } = await deps.notion.list(pageId);
      // A page we just made has one to-do per teacher in order. An adopted page gets an empty fingerprint, so the refresh below rewrites it.
      if (todos.length !== days.length) throw new Error("existing task does not match");
      for (const [i, d] of days.entries()) {
        await deps.store.saveTeacher(row.id, {
          staffId: d.staffId, blockId: todos[i].id, writtenFingerprint: found ? "" : d.fingerprint, writtenAt: todos[i].lastEditedTime, acknowledgedFingerprint: null, labelled: false,
        });
      }
      result = "created";
    }
    if (!logId) {
      adding = true;
      logId = await deps.notion.createLog({
        summary: `Daily teacher texts task created for ${date}`, date, workPageId: pageId, sessionLink: deps.sessionLink, decisions: "Created. Nothing is sent automatically.",
      });
      adding = false;
      await deps.store.save(row.id, { notionLogId: logId });
    }

    const stored = await deps.store.listTeachers(row.id);
    const byStaff = new Map(stored.map((t) => [t.staffId, t]));
    const quiet = days.every((d) => byStaff.get(d.staffId)?.writtenFingerprint === d.fingerprint) && stored.every((t) => !t.labelled);
    if (!quiet) {
      const { introId, todos } = await deps.notion.list(pageId);
      const plan = planRefresh(stored, days, new Map(todos.map((t) => [t.id, { checked: t.checked, lastEditedTime: t.lastEditedTime }])));
      let wrote = 0;
      for (const p of plan) {
        const day = days.find((d) => d.staffId === p.staffId)!;
        const prev = byStaff.get(p.staffId);
        const label = p.label ? RESEND_LABEL : "";
        if (!p.write) {
          if (prev && p.acknowledged !== prev.acknowledgedFingerprint) await deps.store.saveTeacher(row.id, { ...prev, acknowledgedFingerprint: p.acknowledged });
          continue;
        }
        let next: StoredTeacher;
        if (p.isNew) {
          adding = true;
          const appended = await deps.notion.append(pageId, render(day), label);
          adding = false;
          next = { staffId: day.staffId, blockId: appended.blockId, writtenFingerprint: day.fingerprint, writtenAt: appended.lastEditedTime, acknowledgedFingerprint: null, labelled: false };
        } else {
          const edited = await deps.notion.update(prev!.blockId, render(day), label);
          next = { ...prev!, writtenFingerprint: day.fingerprint, writtenAt: edited, acknowledgedFingerprint: p.acknowledged, labelled: p.label };
        }
        await deps.store.saveTeacher(row.id, next);
        wrote++;
      }
      if (wrote > 0) {
        if (introId) await deps.notion.updateIntro(introId, introText(hhmm));
        refreshCount += 1;
        await deps.notion.updateLog(logId, `Refreshed ${refreshCount} ${refreshCount === 1 ? "time" : "times"}, last at ${hhmm}`);
        if (result !== "created") result = "updated";
      }
    }
    await deps.store.save(row.id, { state: "ready", lastError: null, refreshCount, releaseLease: true });
    return { result };
  } catch (e) {
    const uncertain = adding && isAmbiguous(e);
    await deps.store.save(row.id, { state: "failed", lastError: uncertain ? UNCERTAIN : errorText(e), refreshCount, releaseLease: true }).catch(() => undefined);
    return { result: uncertain ? "uncertain" : "failed", error: e };
  }
}
