import type { AvailabilityWindow } from "./availability";

export type CopyWindow = AvailabilityWindow & { id: string };
export type NewWindowFields = AvailabilityWindow;
export type CopyPlan = { deletes: string[]; creates: NewWindowFields[] };

const active = (w: AvailabilityWindow, today: string) => !w.effectiveUntil || w.effectiveUntil >= today;

/**
 * What it takes to copy one weekday's hours onto others: windows to delete and
 * windows to create. Pure, so the client only executes the plan. Add mode skips
 * hours already identical on the target day; replace mode clears the target day
 * first. Ended windows are neither copied nor deleted.
 */
export function planCopy(
  windows: CopyWindow[],
  sourceWeekday: number,
  targetWeekdays: number[],
  opts: { replace: boolean },
  today: string,
): CopyPlan {
  const source = windows.filter((w) => w.weekday === sourceWeekday && active(w, today));
  const deletes: string[] = [];
  const creates: NewWindowFields[] = [];
  for (const target of [...new Set(targetWeekdays)].filter((d) => d !== sourceWeekday)) {
    const existing = windows.filter((w) => w.weekday === target && active(w, today));
    if (opts.replace) deletes.push(...existing.map((w) => w.id));
    const seen = new Set(opts.replace ? [] : existing.map((w) => `${w.startTime}-${w.endTime}`));
    for (const s of source) {
      const key = `${s.startTime}-${s.endTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      creates.push({
        weekday: target, startTime: s.startTime, endTime: s.endTime,
        effectiveFrom: s.effectiveFrom > today ? s.effectiveFrom : today, effectiveUntil: s.effectiveUntil,
      });
    }
  }
  return { deletes, creates };
}
