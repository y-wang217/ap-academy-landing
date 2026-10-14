import { getServiceClient } from "@ap-academy/db/service";
import { createDailyTaskStore } from "@/lib/data/daily-task";
import { createScheduleStore } from "@/lib/data/schedule";
import { getStaffList, getStudentNames } from "@/lib/notion/cached";
import { readWorkConfig } from "@/lib/notion/config";
import { buildDailyTaskDeps } from "@/lib/scheduler/daily-task-wiring";
import { handleDailyTaskRun } from "@/lib/scheduler/daily-task-handlers";

export const dynamic = "force-dynamic";

/**
 * The scheduled entry point (REQ-8). It authenticates itself with a bearer
 * secret, because the tracker's proxy lets this one path through without a
 * session. This is the only file that imports the service-role client, and it
 * reads one org's class rows and the two daily-task tables with it.
 */
export async function POST(request: Request) {
  return handleDailyTaskRun({
    authorization: request.headers.get("authorization"),
    env: { secret: process.env.SCHEDULER_CRON_SECRET, orgId: process.env.DAILY_TASK_ORG_ID, time: process.env.DAILY_TASK_TIME },
    build: (orgId) => {
      const client = getServiceClient();
      const config = readWorkConfig();
      if (!client || !config) return null;
      const tracker = client.schema("tracker");
      return buildDailyTaskDeps({
        store: createDailyTaskStore(tracker, orgId),
        schedule: createScheduleStore(async () => ({ db: { supabase: client, tracker }, orgId, userId: "scheduled-run" })),
        config,
        fetchStaff: getStaffList,
        studentNames: async () => new Map(await getStudentNames()),
      });
    },
  });
}
