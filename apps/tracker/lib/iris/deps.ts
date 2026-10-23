import { getDb } from "../data/client";
import { createIrisReader, irisSchema } from "../data/iris";
import { realScheduleDeps } from "../scheduler/deps";
import { readGmailConfig } from "./config";
import { gmailSendPort } from "./gmail";
import type { IrisAdminDeps, IrisReader } from "./handlers";

/**
 * The real owner-side dependencies (REQ-42): the scheduler identity, a
 * reader on the signed-in owner's own client, so RLS decides, and Gmail for
 * sending an approved reply (REQ-48). The reader
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
      approveForSend: async (id, version) => (await get()).approveForSend(id, version),
      retrySend: async (id) => (await get()).retrySend(id),
      sendContext: async (id) => (await get()).sendContext(id),
      claimSend: async (id, lease, max) => (await get()).claimSend(id, lease, max),
      finishSend: async (id, r) => (await get()).finishSend(id, r),
      failSendAttempt: async (id, error, max) => (await get()).failSendAttempt(id, error, max),
      saveDraftEdit: async (id, version, body) => (await get()).saveDraftEdit(id, version, body),
      rejectDraft: async (id, reason) => (await get()).rejectDraft(id, reason),
    };
  };
  const sender = () => {
    const gmail = readGmailConfig();
    return gmail ? { gmail: gmailSendPort(gmail), mailbox: gmail.mailbox } : null;
  };
  return { identity, reader, sender };
}
