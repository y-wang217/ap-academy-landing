/** Plain-language reasons for priority suggestions (ADR 0024). Stored with the task. */
import type { Suggestion } from "../domain/suggestions";
import { percent } from "../format";

function when(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function suggestionReason(s: Suggestion, courseCode: string): string {
  const behind = `${courseCode} is ${percent(s.gap)} below target`;
  return s.kind === "prepare"
    ? `${behind} and ${s.assessmentTitle} is due ${when(s.daysUntil)}.`
    : `${behind}. ${s.categoryName} is the lowest category at ${percent(s.categoryPercent)}.`;
}
