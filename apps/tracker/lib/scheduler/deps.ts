import { after } from "next/server";
import { z } from "zod";
import { getDb, type Db } from "../data/client";
import { createOutboxStore } from "../data/outbox";
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
import { DRAIN_BUDGET_MS, DRAIN_LIMIT, drainOutbox, sleep, type DrainDeps } from "./outbox";
import { withBackgroundDrain } from "./outbox-drain";
import type { OutboxStore } from "./outbox-store";
import type { ScheduleDeps } from "./schedule-handlers";

const LinkRow = z.object({ org_id: z.guid(), notion_staff_id: z.guid() });

/**
 * The real dependencies: the signed-in user's Supabase client (RLS decides) and the cached Notion list.
 * The first admin identity in a request also schedules one drain of the org's Notion export outbox,
 * run by after() once the response is sent (REQ-35 AC9). This is the one hook point: every scheduler
 * route except daily-task/run resolves identity through here.
 */
export function realDeps(): HandlerDeps {
  let db: Db | null = null;
  let userId: string | null = null;
  const resolveIdentity = async () => {
    db = await getDb();
    const user = db ? (await db.supabase.auth.getUser()).data.user : null;
    userId = user?.id ?? null;
    const client = db;
    return resolveSchedulerIdentity({
      configured: notionConfigured(),
      getUser: async () => (user ? { id: user.id, email: user.email ?? "" } : null),
      claimLink: async () => {
        await client?.tracker.rpc("claim_staff_link");
      },
      isOwnerOf: async () => {
        if (!client || !user) return null;
        const { data } = await client.tracker.from("memberships").select("org_id").eq("user_id", user.id).eq("role", "owner").limit(1).maybeSingle();
        const parsed = z.object({ org_id: z.guid() }).safeParse(data);
        return parsed.success ? parsed.data.org_id : null;
      },
      getLink: async () => {
        if (!client || !user) return null;
        const { data } = await client.tracker.from("staff_links").select("org_id, notion_staff_id").eq("user_id", user.id).is("revoked_at", null).limit(1).maybeSingle();
        const parsed = LinkRow.safeParse(data);
        return parsed.success ? { orgId: parsed.data.org_id, notionStaffId: parsed.data.notion_staff_id } : null;
      },
      fetchStaff: getStaffList,
    });
  };
  return {
    fetchStaff: getStaffList,
    identity: withBackgroundDrain(resolveIdentity, (orgId) => {
      // The client was made during the request; after() runs once the response is sent.
      const client = db;
      const uid = userId;
      if (!client || !uid) return;
      after(() => drainOutbox(drainDepsFor(client, orgId, uid), { limit: DRAIN_LIMIT, budgetMs: DRAIN_BUDGET_MS }).then(() => undefined));
    }),
  };
}

const studentsPort = () => {
  const config = readStudentsConfig();
  return config
    ? {
        list: () => fetchScheduledStudents(config),
        get: (pageId: string) => fetchStudentSchedule(config, pageId),
        write: (pageId: string, text: string) => writeWeeklySchedule(config, pageId, text),
      }
    : undefined;
};

/** The background drain's ports for one owner: their client (RLS applies) and their org. */
function drainDepsFor(db: Db, orgId: string, userId: string): DrainDeps {
  const store = createScheduleStore(async () => ({ db, orgId, userId }));
  const students = studentsPort();
  const work = readWorkConfig();
  const studentNames = students ? async () => new Map(await getStudentNames()) : undefined;
  return {
    outbox: createOutboxStore(db.tracker, orgId),
    summary: students ? { store, students, fetchStaff: getStaffList, today: () => todayIso() } : undefined,
    dailyTask: work && studentNames
      ? buildDailyTaskDeps({ store: lazyDailyTaskStore(async () => ({ tracker: db.tracker, orgId })), schedule: store, config: work, fetchStaff: getStaffList, studentNames })
      : undefined,
    today: () => todayIso(),
    now: () => new Date(),
    sleep,
  };
}

/** An outbox store that resolves the owner's client and org on first use; a teacher's request never reaches it. */
function lazyOutboxStore(resolve: () => Promise<{ tracker: Db["tracker"]; orgId: string } | null>): OutboxStore {
  let inner: Promise<OutboxStore> | undefined;
  const get = () =>
    (inner ??= resolve().then((r) => {
      if (!r) throw new Error("outbox unavailable");
      return createOutboxStore(r.tracker, r.orgId);
    }));
  return {
    claim: async (ids, limit, lease) => (await get()).claim(ids, limit, lease),
    finish: async (row, patch) => (await get()).finish(row, patch),
    findPending: async (keys) => (await get()).findPending(keys),
    listOpen: async (before) => (await get()).listOpen(before),
    retry: async (id) => (await get()).retry(id),
    enqueueSummaries: async (ids) => (await get()).enqueueSummaries(ids),
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
  const students = studentsPort();
  const studentNames = students ? async () => new Map(await getStudentNames()) : undefined;
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
  // The Notion export outbox (REQ-35): owner only, like today's task.
  const outbox = lazyOutboxStore(async () => {
    const [db, who] = await Promise.all([getDb(), identity()]);
    return db && who.scope === "admin" ? { tracker: db.tracker, orgId: who.orgId } : null;
  });
  return { ...base, identity, store, today: () => todayIso(), students, studentNames, dailyTask, outbox, lessons, outcomes };
}
