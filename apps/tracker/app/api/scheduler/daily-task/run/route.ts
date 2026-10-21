import { getServiceClient } from "@ap-academy/db/service";
import { createDailyTaskStore } from "@/lib/data/daily-task";
import { createOutboxStore } from "@/lib/data/outbox";
import { createPeopleStore } from "@/lib/data/people";
import { createScheduleStore } from "@/lib/data/schedule";
import { readStudentsConfig, readWorkConfig } from "@/lib/notion/config";
import { fetchScheduledStudents, fetchStudentSchedule, writeWeeklySchedule } from "@/lib/notion/students";
import { sleep } from "@/lib/scheduler/outbox";
import { todayIso } from "@/lib/time";
import { buildDailyTaskDeps } from "@/lib/scheduler/daily-task-wiring";
import { handleDailyTaskRun } from "@/lib/scheduler/daily-task-handlers";
import { syncPeopleFor } from "@/lib/scheduler/people-sync-wiring";

export const dynamic = "force-dynamic";

/**
 * The scheduled entry point (REQ-8). It authenticates itself with a bearer
 * secret, because the tracker's proxy lets this one path through without a
 * session. This is the only file that imports the service-role client, and it
 * reads one org's class rows, the two daily-task tables, the people copy and
 * the Notion export outbox with it. On every authorised call it runs the
 * hourly people sync for that org (REQ-38), then drains the outbox (REQ-35).
 */
export async function POST(request: Request) {
  const build = (orgId: string) => {
    const client = getServiceClient();
    const config = readWorkConfig();
    if (!client || !config) return null;
    const tracker = client.schema("tracker");
    const people = createPeopleStore(tracker, orgId);
    return buildDailyTaskDeps({
      store: createDailyTaskStore(tracker, orgId),
      schedule: scheduleStore(client, orgId),
      config,
      fetchStaff: people.listStaff,
      studentNames: people.studentNames,
    });
  };
  return handleDailyTaskRun({
    authorization: request.headers.get("authorization"),
    env: { secret: process.env.SCHEDULER_CRON_SECRET, orgId: process.env.DAILY_TASK_ORG_ID, time: process.env.DAILY_TASK_TIME },
    syncPeople: async (orgId) => {
      const client = getServiceClient();
      return client ? syncPeopleFor(client.schema("tracker"), orgId, "schedule") : "not_configured";
    },
    build,
    drain: (orgId) => {
      const client = getServiceClient();
      if (!client) return null;
      const students = readStudentsConfig();
      const tracker = client.schema("tracker");
      const store = scheduleStore(client, orgId);
      const people = createPeopleStore(tracker, orgId);
      return {
        outbox: createOutboxStore(tracker, orgId),
        summary: students
          ? {
              store,
              students: {
                list: () => fetchScheduledStudents(students),
                get: (pageId) => fetchStudentSchedule(students, pageId),
                write: (pageId, text) => writeWeeklySchedule(students, pageId, text),
              },
              fetchStaff: people.listStaff,
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
