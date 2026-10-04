/** Ordering for tasks and upcoming work. Teacher pins always come first. Pure. */
import { TUNING } from "./tuning";

export type TaskInput = {
  id: string;
  kind: "school" | "supplemental";
  pinned: boolean;
  rank: number;
  doneAt: string | null;
  createdAt: string;
};

/** Open tasks: pinned first, then by rank, then oldest first. */
export function orderTasks<T extends TaskInput>(tasks: readonly T[]): T[] {
  return tasks
    .filter((t) => t.doneAt === null)
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.rank - b.rank || a.createdAt.localeCompare(b.createdAt));
}

/** Dashboard "next priorities": open school tasks only; supplemental work is kept separate. */
export function nextPriorities<T extends TaskInput>(tasks: readonly T[], limit: number = TUNING.prioritiesLimit): T[] {
  return orderTasks(tasks.filter((t) => t.kind === "school")).slice(0, limit);
}

export type UpcomingInput = { dueDate: string | null; scoreEarned: number | null; excused: boolean };

/** Ungraded, unexcused work due today or later, soonest first. */
export function upcomingWork<T extends UpcomingInput>(items: readonly T[], today: string, limit: number = TUNING.upcomingLimit): T[] {
  return items
    .filter((a) => !a.excused && a.scoreEarned === null && a.dueDate !== null && a.dueDate >= today)
    .slice()
    .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string))
    .slice(0, limit);
}
