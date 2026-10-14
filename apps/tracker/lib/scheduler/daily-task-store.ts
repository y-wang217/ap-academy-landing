import type { StoredTeacher } from "../domain/schedule/daily-texts";

export type DailyTaskState = "pending" | "ready" | "failed";
export type DailyTaskRow = {
  id: string;
  localDate: string;
  notionPageId: string | null;
  notionPageUrl: string | null;
  notionLogId: string | null;
  state: DailyTaskState;
  lastError: string | null;
  refreshCount: number;
  updatedAt: string;
};
export type DailyTaskPatch = Partial<Pick<DailyTaskRow, "notionPageId" | "notionPageUrl" | "notionLogId" | "state" | "lastError" | "refreshCount">> & { releaseLease?: boolean };

/**
 * Storage for the daily teacher-texts task, scoped to one org and the
 * `teacher_texts` kind. Holds operational state only: IDs, hashes and a short
 * error. No student names, no message text (tracker ADR 0039).
 */
export type DailyTaskStore = {
  get(date: string): Promise<DailyTaskRow | null>;
  /** Takes the date's lease (creating the row if missing). Null when someone else holds it. */
  claim(date: string, leaseSeconds: number): Promise<DailyTaskRow | null>;
  save(id: string, patch: DailyTaskPatch): Promise<void>;
  listTeachers(taskId: string): Promise<StoredTeacher[]>;
  saveTeacher(taskId: string, teacher: StoredTeacher): Promise<void>;
};
