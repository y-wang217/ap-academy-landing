import { addDays } from "../domain/schedule/wallclock";
import { loadConflicts, type ScheduleDeps } from "./schedule-handlers";

/**
 * The owner's home-page link and badge. null: no link (not the owner, or the
 * identity could not be resolved). A number: show the link, and the badge when
 * it is above 0. A failed conflicts load gives 0, so the student list always
 * renders.
 */
export async function outsideAvailabilityCount(deps: ScheduleDeps): Promise<number | null> {
  let who;
  try {
    who = await deps.identity();
  } catch {
    return null;
  }
  if (who.scope !== "admin") return null;
  const today = deps.today();
  try {
    return (await loadConflicts(deps, who, { from: today, to: addDays(today, 91) })).conflicts.length;
  } catch {
    return 0;
  }
}
