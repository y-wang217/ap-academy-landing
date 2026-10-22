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
      listDraftsWaiting: async (limit) => (await get()).listDraftsWaiting(limit),
      listSentToday: async (since, limit) => (await get()).listSentToday(since, limit),
      listFailed: async (limit) => (await get()).listFailed(limit),
      getThreadView: async (id) => (await get()).getThreadView(id),
      approveDraft: async (id, version) => (await get()).approveDraft(id, version),
      saveDraftEdit: async (id, version, body) => (await get()).saveDraftEdit(id, version, body),
      rejectDraft: async (id, reason) => (await get()).rejectDraft(id, reason),
    };
  };
  return { identity, reader };
}
