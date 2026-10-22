import { after } from "next/server";
import { z } from "zod";
import { getDb, type Db } from "../data/client";
import { createOutboxStore } from "../data/outbox";
import { createPeopleStore, type PeopleStore } from "../data/people";
import { createScheduleStore } from "../data/schedule";
import { todayIso } from "../time";
import { notionConfigured, readLessonsConfig, readStudentsConfig, readWorkConfig } from "../notion/config";
import { createLessonsPort } from "../notion/lessons";
import { createOutcomeStore } from "../data/outcomes";
import { SITE_URL } from "../config";
import { fetchScheduledStudents, fetchStudentSchedule, writeStudentSchedule } from "../notion/students";
import type { HandlerDeps } from "./handlers";
import { resolveSchedulerIdentity, type SchedulerIdentity } from "./identity";
import { buildDailyTaskDeps, lazyDailyTaskStore } from "./daily-task-wiring";
import { DRAIN_BUDGET_MS, DRAIN_LIMIT, drainOutbox, sleep, type DrainDeps } from "./outbox";
import { withBackgroundDrain } from "./outbox-drain";
import type { OutboxStore } from "./outbox-store";
import type { ScheduleDeps } from "./schedule-handlers";

const LinkRow = z.object({ org_id: z.guid(), notion_staff_id: z.guid() });

/** The caller's people store for the org their scheduler identity is in (RLS decides the rows). */
async function peopleOf(identity: () => Promise<SchedulerIdentity>): Promise<PeopleStore> {
  const [db, who] = await Promise.all([getDb(), identity()]);
  if (!db || (who.scope !== "admin" && who.scope !== "teacher")) throw new Error("people unavailable");
  return createPeopleStore(db.tracker, who.orgId);
}

/**
 * The real dependencies: the signed-in user's Supabase client (RLS decides).
 * Staff and student names come from the local people copy (REQ-38), never a
 * live Notion read. The identity is resolved once per request. The first admin
 * identity in a request also schedules one drain of the org's Notion export
 * outbox, run by after() once the response is sent (REQ-35 AC9). This is the
 * one hook point: every scheduler route except daily-task/run resolves
 * identity through here.
 */
export function realDeps(): HandlerDeps & { peopleStore: () => Promise<PeopleStore> } {
  let db: Db | null = null;
  let userId: string | null = null;
  let cached: Promise<SchedulerIdentity> | undefined;
  const resolve = () =>
    (cached ??= (async () => {
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
        getStaff: async (orgId, id) => {
          if (!client) throw new Error("people unavailable");
          return createPeopleStore(client.tracker, orgId).getStaff(id);
        },
        syncedAt: async (orgId) => {
          if (!client) throw new Error("people unavailable");
          return createPeopleStore(client.tracker, orgId).syncedAt();
        },
      });
    })());
  const identity = withBackgroundDrain(resolve, (orgId) => {
    // The client was made during the request; after() runs once the response is sent.
    const client = db;
    const uid = userId;
    if (!client || !uid) return;
    after(() => drainOutbox(drainDepsFor(client, orgId, uid), { limit: DRAIN_LIMIT, budgetMs: DRAIN_BUDGET_MS }).then(() => undefined));
  });
  let people: Promise<PeopleStore> | undefined;
  const peopleStore = () => (people ??= peopleOf(identity));
  return {
    identity,
    fetchStaff: async () => (await peopleStore()).listStaff(),
    peopleStore,
  };
}

const studentsPort = () => {
  const config = readStudentsConfig();
  return config
    ? {
        list: () => fetchScheduledStudents(config),
        get: (pageId: string) => fetchStudentSchedule(config, pageId),
        // Weekly Schedule and Schedule Source (REQ-34), in one PATCH.
        write: (pageId: string, patch: { weeklySchedule?: string; scheduleSource?: string }) => writeStudentSchedule(config, pageId, patch),
      }
    : undefined;
};

/** The background drain's ports for one owner: their client (RLS applies), their org and the local people copy. */
function drainDepsFor(db: Db, orgId: string, userId: string): DrainDeps {
  const store = createScheduleStore(async () => ({ db, orgId, userId }));
  const students = studentsPort();
  const work = readWorkConfig();
  const people = createPeopleStore(db.tracker, orgId);
  return {
    outbox: createOutboxStore(db.tracker, orgId),
    summary: students ? { store, students, fetchStaff: people.listStaff, today: () => todayIso(), siteUrl: SITE_URL } : undefined,
    dailyTask: work
      ? buildDailyTaskDeps({ store: lazyDailyTaskStore(async () => ({ tracker: db.tracker, orgId })), schedule: store, config: work, fetchStaff: people.listStaff, studentNames: people.studentNames })
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
  const { peopleStore, ...base } = realDeps();
  const identity = base.identity;
  const context = async () => {
    const [db, who] = await Promise.all([getDb(), identity()]);
    if (!db || (who.scope !== "admin" && who.scope !== "teacher")) return null;
    const user = (await db.supabase.auth.getUser()).data.user;
    return user ? { db, orgId: who.orgId, userId: user.id } : null;
  };
  const store = createScheduleStore(context);
  // Weekly Schedule text stays a live Notion read and write (ADR 0004, AC10).
  const students = studentsPort();
  const studentNames = async () => (await peopleStore()).studentNames();
  const activeStudents = async () => (await peopleStore()).activeStudents();
  const peopleSyncedAt = async () => (await peopleStore()).syncedAt();
  // Today's Notion task (REQ-8): wired whenever Work is reachable; names come from the local copy.
  const work = readWorkConfig();
  const dailyTask = work
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
  return { ...base, identity, store, today: () => todayIso(), students, siteUrl: SITE_URL, studentNames, activeStudents, peopleSyncedAt, dailyTask, peopleStore, outbox, lessons, outcomes };
}
