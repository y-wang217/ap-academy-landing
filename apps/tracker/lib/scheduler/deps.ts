import { z } from "zod";
import { getDb } from "../data/client";
import { createPeopleStore, type PeopleStore } from "../data/people";
import { createScheduleStore } from "../data/schedule";
import { todayIso } from "../time";
import { notionConfigured, readStudentsConfig, readWorkConfig } from "../notion/config";
import { fetchScheduledStudents, fetchStudentSchedule, writeWeeklySchedule } from "../notion/students";
import type { HandlerDeps } from "./handlers";
import { resolveSchedulerIdentity, type SchedulerIdentity } from "./identity";
import { buildDailyTaskDeps, lazyDailyTaskStore } from "./daily-task-wiring";
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
 * live Notion read. The identity is resolved once per request.
 */
export function realDeps(): HandlerDeps & { peopleStore: () => Promise<PeopleStore> } {
  let cached: Promise<SchedulerIdentity> | undefined;
  const identity = () =>
    (cached ??= (async () => {
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
        getStaff: async (orgId, id) => {
          if (!db) throw new Error("people unavailable");
          return createPeopleStore(db.tracker, orgId).getStaff(id);
        },
        syncedAt: async (orgId) => {
          if (!db) throw new Error("people unavailable");
          return createPeopleStore(db.tracker, orgId).syncedAt();
        },
      });
    })());
  let people: Promise<PeopleStore> | undefined;
  const peopleStore = () => (people ??= peopleOf(identity));
  return {
    identity,
    fetchStaff: async () => (await peopleStore()).listStaff(),
    peopleStore,
  };
}

/** realDeps() plus the scheduling store, which resolves the caller's org and user lazily, once per request. */
export function realScheduleDeps(): ScheduleDeps {
  const { peopleStore, ...base } = realDeps();
  const identity = base.identity;
  const store = createScheduleStore(async () => {
    const [db, who] = await Promise.all([getDb(), identity()]);
    if (!db || (who.scope !== "admin" && who.scope !== "teacher")) return null;
    const user = (await db.supabase.auth.getUser()).data.user;
    return user ? { db, orgId: who.orgId, userId: user.id } : null;
  });
  const config = readStudentsConfig();
  // Weekly Schedule text stays a live Notion read and write (ADR 0004, AC10).
  const students = config
    ? {
        list: () => fetchScheduledStudents(config),
        get: (pageId: string) => fetchStudentSchedule(config, pageId),
        write: (pageId: string, text: string) => writeWeeklySchedule(config, pageId, text),
      }
    : undefined;
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
  return { ...base, identity, store, today: () => todayIso(), students, studentNames, activeStudents, peopleSyncedAt, dailyTask, peopleStore };
}
