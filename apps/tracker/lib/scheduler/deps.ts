import { z } from "zod";
import { getDb } from "../data/client";
import { createScheduleStore } from "../data/schedule";
import { todayIso } from "../time";
import { getStaffList, getStudentNames } from "../notion/cached";
import { notionConfigured, readLessonsConfig, readStudentsConfig, readWorkConfig } from "../notion/config";
import { createLessonsPort } from "../notion/lessons";
import { createOutcomeStore } from "../data/outcomes";
import { fetchScheduledStudents, fetchStudentSchedule, writeWeeklySchedule } from "../notion/students";
import type { HandlerDeps } from "./handlers";
import { resolveSchedulerIdentity } from "./identity";
import { buildDailyTaskDeps, lazyDailyTaskStore } from "./daily-task-wiring";
import type { ScheduleDeps } from "./schedule-handlers";

const LinkRow = z.object({ org_id: z.guid(), notion_staff_id: z.guid() });

/** The real dependencies: the signed-in user's Supabase client (RLS decides) and the cached Notion list. */
export function realDeps(): HandlerDeps {
  return {
    fetchStaff: getStaffList,
    identity: async () => {
      const db = await getDb();
      const user = db ? (await db.supabase.auth.getUser()).data.user : null;
      return resolveSchedulerIdentity({
        configured: notionConfigured(),
        getUser: async () => (user ? { id: user.id, email: user.email ?? "" } : null),
        claimLink: async () => {
          await db?.tracker.rpc("claim_staff_link");
        },
        isOwnerOf: async () => {
          if (!db || !user) return null;
          const { data } = await db.tracker.from("memberships").select("org_id").eq("user_id", user.id).eq("role", "owner").limit(1).maybeSingle();
          const parsed = z.object({ org_id: z.guid() }).safeParse(data);
          return parsed.success ? parsed.data.org_id : null;
        },
        getLink: async () => {
          if (!db || !user) return null;
          const { data } = await db.tracker.from("staff_links").select("org_id, notion_staff_id").eq("user_id", user.id).is("revoked_at", null).limit(1).maybeSingle();
          const parsed = LinkRow.safeParse(data);
          return parsed.success ? { orgId: parsed.data.org_id, notionStaffId: parsed.data.notion_staff_id } : null;
        },
        fetchStaff: getStaffList,
      });
    },
  };
}

/** realDeps() plus the scheduling store, which resolves the caller's org and user lazily, once per request. */
export function realScheduleDeps(): ScheduleDeps {
  const base = realDeps();
  let cached: ReturnType<HandlerDeps["identity"]> | undefined;
  const identity = () => (cached ??= base.identity());
  const context = async () => {
    const [db, who] = await Promise.all([getDb(), identity()]);
    if (!db || (who.scope !== "admin" && who.scope !== "teacher")) return null;
    const user = (await db.supabase.auth.getUser()).data.user;
    return user ? { db, orgId: who.orgId, userId: user.id } : null;
  };
  const store = createScheduleStore(context);
  const config = readStudentsConfig();
  const students = config
    ? {
        list: () => fetchScheduledStudents(config),
        get: (pageId: string) => fetchStudentSchedule(config, pageId),
        write: (pageId: string, text: string) => writeWeeklySchedule(config, pageId, text),
      }
    : undefined;
  const studentNames = config ? async () => new Map(await getStudentNames()) : undefined;
  // Today's Notion task (REQ-8): wired only when both Work and Students & Parents are reachable.
  const work = readWorkConfig();
  const dailyTask =
    work && studentNames
      ? buildDailyTaskDeps({
          store: lazyDailyTaskStore(async () => {
            const [db, who] = await Promise.all([getDb(), identity()]);
            return db && who.scope === "admin" ? { tracker: db.tracker, orgId: who.orgId } : null;
          }),
          schedule: store,
          config: work,
          fetchStaff: base.fetchStaff,
          studentNames,
        })
      : undefined;
  // Lesson logging (REQ-39): Notion Lessons plus the outcome table, wired together or not at all.
  const lessonsConfig = readLessonsConfig();
  const lessons = lessonsConfig ? createLessonsPort(lessonsConfig) : undefined;
  const outcomes = lessons ? createOutcomeStore(context) : undefined;
  return { ...base, identity, store, today: () => todayIso(), students, studentNames, dailyTask, lessons, outcomes };
}
