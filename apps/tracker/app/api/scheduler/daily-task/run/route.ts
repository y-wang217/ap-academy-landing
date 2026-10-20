import { getServiceClient } from "@ap-academy/db/service";
import { createDailyTaskStore } from "@/lib/data/daily-task";
import { createOutboxStore } from "@/lib/data/outbox";
import { createScheduleStore } from "@/lib/data/schedule";
import { getStaffList, getStudentNames } from "@/lib/notion/cached";
import { readStudentsConfig, readWorkConfig } from "@/lib/notion/config";
import { fetchScheduledStudents, fetchStudentSchedule, writeWeeklySchedule } from "@/lib/notion/students";
import { sleep } from "@/lib/scheduler/outbox";
import { todayIso } from "@/lib/time";
import { buildDailyTaskDeps } from "@/lib/scheduler/daily-task-wiring";
import { handleDailyTaskRun } from "@/lib/scheduler/daily-task-handlers";

export const dynamic = "force-dynamic";

/**
 * The scheduled entry point (REQ-8). It authenticates itself with a bearer
 * secret, because the tracker's proxy lets this one path through without a
 * session. This is the only file that imports the service-role client, and it
 * reads one org's class rows, the two daily-task tables and the Notion export
 * outbox with it (REQ-35: it drains the outbox on every authorised call).
 */
export async function POST(request: Request) {
  const build = (orgId: string) => {
    const client = getServiceClient();
    const config = readWorkConfig();
    if (!client || !config) return null;
    const tracker = client.schema("tracker");
    return buildDailyTaskDeps({
      store: createDailyTaskStore(tracker, orgId),
      schedule: scheduleStore(client, orgId),
      config,
      fetchStaff: getStaffList,
      studentNames: async () => new Map(await getStudentNames()),
    });
  };
  return handleDailyTaskRun({
    authorization: request.headers.get("authorization"),
    env: { secret: process.env.SCHEDULER_CRON_SECRET, orgId: process.env.DAILY_TASK_ORG_ID, time: process.env.DAILY_TASK_TIME },
    build,
    drain: (orgId) => {
      const client = getServiceClient();
      if (!client) return null;
      const students = readStudentsConfig();
      const store = scheduleStore(client, orgId);
      return {
        outbox: createOutboxStore(client.schema("tracker"), orgId),
        summary: students
          ? {
              store,
              students: {
                list: () => fetchScheduledStudents(students),
                get: (pageId) => fetchStudentSchedule(students, pageId),
                write: (pageId, text) => writeWeeklySchedule(students, pageId, text),
              },
              fetchStaff: getStaffList,
              today: () => todayIso(),
            }
          : undefined,
        dailyTask: build(orgId) ?? undefined,
        today: () => todayIso(),
        now: () => new Date(),
        sleep,
      };
    },
  });
}

function scheduleStore(client: NonNullable<ReturnType<typeof getServiceClient>>, orgId: string) {
  const tracker = client.schema("tracker");
  return createScheduleStore(async () => ({ db: { supabase: client, tracker }, orgId, userId: "scheduled-run" }));
}
