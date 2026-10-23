import { getDb } from "../data/client";
import { AI_MODEL } from "../ai/config";
import { createIrisReader, irisSchema } from "../data/iris";
import { createEvalReader, type EvalReader } from "../data/iris-eval";
import type { EvalAdminDeps } from "./eval-handlers";
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

/**
 * The eval routes' dependencies (REQ-45): the same identity, and the eval
 * reader on the owner's own client, opened on first use.
 */
export function realEvalAdminDeps(): EvalAdminDeps {
  const identity = realScheduleDeps().identity;
  const reader = (orgId: string): EvalReader => {
    let inner: Promise<EvalReader> | undefined;
    const get = () =>
      (inner ??= getDb().then((db) => {
        if (!db) throw new Error("iris unavailable");
        const uid = async () => (await db.supabase.auth.getUser()).data.user?.id ?? null;
        return createEvalReader(irisSchema(db.supabase), orgId, uid);
      }));
    return {
      listEvalItems: async (filter, page) => (await get()).listEvalItems(filter, page),
      evalStatus: async () => (await get()).evalStatus(),
      saveLabel: async (id, input) => (await get()).saveLabel(id, input),
      saveRating: async (id, resultId, rating) => (await get()).saveRating(id, resultId, rating),
      requestEval: async (kind, detail) => (await get()).requestEval(kind, detail),
      recordRun: async (requestId) => (await get()).recordRun(requestId),
      gateInputs: async () => (await get()).gateInputs(),
    };
  };
  return { identity, reader, model: AI_MODEL };
}
