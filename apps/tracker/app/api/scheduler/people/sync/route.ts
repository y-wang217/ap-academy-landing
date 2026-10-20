import { getDb } from "@/lib/data/client";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handlePeopleSyncNow, handlePeopleSyncStatus, type PeopleDeps } from "@/lib/scheduler/people-handlers";
import { syncPeopleFor } from "@/lib/scheduler/people-sync-wiring";

export const dynamic = "force-dynamic";

/** The owner's people sync (REQ-38). Under /api/scheduler, so the origin check applies to the POST. */
function deps(): PeopleDeps {
  const base = realScheduleDeps();
  return {
    identity: base.identity,
    peopleStore: base.peopleStore!,
    syncPeople: async (orgId) => {
      const db = await getDb();
      return db ? syncPeopleFor(db.tracker, orgId, "owner") : "not_configured";
    },
    now: () => new Date(),
  };
}

export async function GET() {
  return handlePeopleSyncStatus(deps());
}

export async function POST() {
  return handlePeopleSyncNow(deps());
}
