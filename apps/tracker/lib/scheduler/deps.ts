import { z } from "zod";
import { getDb } from "../data/client";
import { createScheduleStore } from "../data/schedule";
import { todayIso } from "../time";
import { getStaffList } from "../notion/cached";
import { notionConfigured } from "../notion/config";
import type { HandlerDeps } from "./handlers";
import { resolveSchedulerIdentity } from "./identity";
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
  const store = createScheduleStore(async () => {
    const [db, who] = await Promise.all([getDb(), identity()]);
    if (!db || (who.scope !== "admin" && who.scope !== "teacher")) return null;
    const user = (await db.supabase.auth.getUser()).data.user;
    return user ? { db, orgId: who.orgId, userId: user.id } : null;
  });
  return { ...base, identity, store, today: () => todayIso() };
}
