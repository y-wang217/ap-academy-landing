import type { SchedulerIdentity } from "./guard";

/**
 * Wraps an identity resolver so the first admin result in a request schedules
 * one background drain of that org's outbox (REQ-35 AC9). Teachers, signed-out
 * and unconfigured callers never schedule one: they have no access to the
 * outbox. Resolving more than once still schedules once. The identity passes
 * through unchanged. Pure, so it is tested without Next.
 */
export function withBackgroundDrain(
  identity: () => Promise<SchedulerIdentity>,
  schedule: (orgId: string) => void,
): () => Promise<SchedulerIdentity> {
  let scheduled = false;
  return async () => {
    const who = await identity();
    if (who.scope === "admin" && !scheduled) {
      scheduled = true;
      try {
        schedule(who.orgId);
      } catch {
        // A drain that cannot be scheduled leaves the rows owed for the next request.
      }
    }
    return who;
  };
}
