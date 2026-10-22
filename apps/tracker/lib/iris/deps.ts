import { getDb } from "../data/client";
import { createIrisReader, irisSchema } from "../data/iris";
import { realScheduleDeps } from "../scheduler/deps";
import type { IrisAdminDeps, IrisReader } from "./handlers";

/**
 * The real owner-side dependencies (REQ-42): the scheduler identity, and a
 * reader on the signed-in owner's own client, so RLS decides. The reader
 * opens the client on first use: a denied request never reaches it.
 */
export function realIrisAdminDeps(): IrisAdminDeps {
  const identity = realScheduleDeps().identity;
  const reader = (orgId: string): IrisReader => {
    let inner: Promise<IrisReader> | undefined;
    const get = () =>
      (inner ??= getDb().then((db) => {
        if (!db) throw new Error("iris unavailable");
        const uid = async () => (await db.supabase.auth.getUser()).data.user?.id ?? null;
        return createIrisReader(irisSchema(db.supabase), orgId, uid);
      }));
    return {
      getSettings: async () => (await get()).getSettings(),
      lastRun: async () => (await get()).lastRun(),
      listNeedsYou: async (limit) => (await get()).listNeedsYou(limit),
      listRecent: async (limit) => (await get()).listRecent(limit),
      updatePaused: async (paused) => (await get()).updatePaused(paused),
      getMessage: async (id) => (await get()).getMessage(id),
      markHandled: async (id) => (await get()).markHandled(id),
    };
  };
  return { identity, reader };
}
