import { getServiceClient } from "@ap-academy/db/service";
import { createDailyTaskStore } from "@/lib/data/daily-task";
import { createPeopleStore } from "@/lib/data/people";
import { createScheduleStore } from "@/lib/data/schedule";
import { readWorkConfig } from "@/lib/notion/config";
import { buildDailyTaskDeps } from "@/lib/scheduler/daily-task-wiring";
import { handleDailyTaskRun } from "@/lib/scheduler/daily-task-handlers";
import { syncPeopleFor } from "@/lib/scheduler/people-sync-wiring";

export const dynamic = "force-dynamic";

/**
 * The scheduled entry point (REQ-8). It authenticates itself with a bearer
 * secret, because the tracker's proxy lets this one path through without a
 * session. This is the only file that imports the service-role client, and it
 * reads one org's class rows, the two daily-task tables and the people copy
 * with it, and runs the hourly people sync for that org (REQ-38).
 */
export async function POST(request: Request) {
  return handleDailyTaskRun({
    authorization: request.headers.get("authorization"),
    env: { secret: process.env.SCHEDULER_CRON_SECRET, orgId: process.env.DAILY_TASK_ORG_ID, time: process.env.DAILY_TASK_TIME },
    syncPeople: async (orgId) => {
      const client = getServiceClient();
      return client ? syncPeopleFor(client.schema("tracker"), orgId, "schedule") : "not_configured";
    },
    build: (orgId) => {
      const client = getServiceClient();
      const config = readWorkConfig();
      if (!client || !config) return null;
      const tracker = client.schema("tracker");
      const people = createPeopleStore(tracker, orgId);
      return buildDailyTaskDeps({
        store: createDailyTaskStore(tracker, orgId),
        schedule: createScheduleStore(async () => ({ db: { supabase: client, tracker }, orgId, userId: "scheduled-run" })),
        config,
        fetchStaff: people.listStaff,
        studentNames: people.studentNames,
      });
    },
  });
}
