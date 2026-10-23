import { z } from "zod";
import type { EvalReader } from "../data/iris-eval";
import { requireScheduler, type Denial } from "../scheduler/guard";
import type { SchedulerIdentity } from "../scheduler/identity";
import type { EvalFilter, EvalItem, EvalStatus } from "./eval-schemas";
import { AUTO_SEND_CANDIDATES, evaluateGate, type GateCondition } from "./gate";
import { familyLabel, pageGate, type IrisReader } from "./handlers";
import { CLASSIFIER_INTENTS, NEVER_AUTO_SEND, POLICY_VERSION, REPLY_TYPES } from "./policy";

/**
 * The owner's eval routes and page loaders (REQ-45, tracker ADR 0074). Owner
 * only: the guard runs before any body or id is read, and every read goes
 * through the owner's own client, so RLS decides. Requests are events the
 * bearer run acts on; nothing here calls Gmail or Claude.
 */
const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const deny = (d: Denial) => send(d.status, d.body);
const unavailable = () => send(503, { error: "iris_unavailable" });

export type EvalAdminDeps = {
  identity: () => Promise<SchedulerIdentity>;
  reader: (orgId: string) => EvalReader;
  /** The deployed model, stamped on eval run requests. */
  model: string;
};

/** Gold reply types a label may name: every reply type but no_reply_needed (that is "none"). */
export const LABEL_REPLY_TYPES = REPLY_TYPES.filter((t) => t !== "no_reply_needed");

const LabelBody = z
  .strictObject({
    goldIntent: z.enum(CLASSIFIER_INTENTS),
    goldReplyType: z.enum(LABEL_REPLY_TYPES as [string, ...string[]]).nullable(),
    goldEscalate: z.boolean(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((b) => !(b.goldEscalate && b.goldReplyType !== null), { message: "escalate_with_reply_type" });
const RatingBody = z.strictObject({ resultId: z.guid(), rating: z.number().int().min(1).max(5) });
const RecordBody = z.strictObject({ requestId: z.number().int().positive() });

async function owner(deps: EvalAdminDeps): Promise<{ ok: true; reader: EvalReader } | { ok: false; res: Response }> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return { ok: false, res: deny(gate) };
  return { ok: true, reader: deps.reader(gate.identity.orgId) };
}

/** POST /api/iris/eval/import (AC4). 409 while an import is pending. */
export async function handleEvalImport(deps: EvalAdminDeps): Promise<Response> {
  const o = await owner(deps);
  if (!o.ok) return o.res;
  try {
    const status = await o.reader.evalStatus();
    if (status.importRequest && !status.importRequest.finished) return send(409, { error: "import_pending" });
    await o.reader.requestEval("eval_import_requested", {});
  } catch {
    return unavailable();
  }
  return send(200, { requested: true });
}

/** POST /api/iris/eval/run (AC6). Stamped with the current policy and model; 409 while a run is pending. */
export async function handleEvalRun(deps: EvalAdminDeps): Promise<Response> {
  const o = await owner(deps);
  if (!o.ok) return o.res;
  try {
    const status = await o.reader.evalStatus();
    if (status.runRequest && !status.runRequest.finished) return send(409, { error: "run_pending" });
    await o.reader.requestEval("eval_run_requested", { policy_version: POLICY_VERSION, model: deps.model });
  } catch {
    return unavailable();
  }
  return send(200, { requested: true });
}

/** PUT /api/iris/eval/labels/[messageId] (AC5). One label row per message. */
export async function handleEvalLabel(deps: EvalAdminDeps, messageId: string, body: unknown): Promise<Response> {
  const o = await owner(deps);
  if (!o.ok) return o.res;
  if (!z.guid().safeParse(messageId).success) return send(404, { error: "not_found" });
  const parsed = LabelBody.safeParse(body);
  if (!parsed.success) return send(400, { error: "invalid_request" });
  let result: "ok" | "not_found";
  try {
    result = await o.reader.saveLabel(messageId, { ...parsed.data, note: parsed.data.note || null });
  } catch {
    return send(500, { error: "save_failed" });
  }
  if (result === "not_found") return send(404, { error: "not_found" });
  return send(200, { saved: true });
}

/** PUT /api/iris/eval/labels/[messageId]/rating (AC7). Only the rated request's draft of this message. */
export async function handleEvalRating(deps: EvalAdminDeps, messageId: string, body: unknown): Promise<Response> {
  const o = await owner(deps);
  if (!o.ok) return o.res;
  if (!z.guid().safeParse(messageId).success) return send(404, { error: "not_found" });
  const parsed = RatingBody.safeParse(body);
  if (!parsed.success) return send(400, { error: "invalid_request" });
  let result: "ok" | "invalid";
  try {
    result = await o.reader.saveRating(messageId, parsed.data.resultId, parsed.data.rating);
  } catch {
    return send(500, { error: "save_failed" });
  }
  if (result === "invalid") return send(400, { error: "invalid_result" });
  return send(200, { saved: true });
}

/** POST /api/iris/eval/record (AC8). 409 while unfinished or with error results. */
export async function handleEvalRecord(deps: EvalAdminDeps, body: unknown): Promise<Response> {
  const o = await owner(deps);
  if (!o.ok) return o.res;
  const parsed = RecordBody.safeParse(body);
  if (!parsed.success) return send(400, { error: "invalid_request" });
  let result: Awaited<ReturnType<EvalReader["recordRun"]>>;
  try {
    result = await o.reader.recordRun(parsed.data.requestId);
  } catch {
    return send(500, { error: "save_failed" });
  }
  if (result === "not_finished") return send(409, { error: "run_unfinished" });
  if (result === "has_errors") return send(409, { error: "run_has_errors" });
  if (result === "not_found") return send(404, { error: "not_found" });
  return send(200, { recorded: true });
}

export type EvalRow = EvalItem & { family: string };
export type EvalPageResult =
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "ok"; paused: boolean; status: EvalStatus; items: EvalRow[]; total: number; page: number; filter: EvalFilter };

export const parseFilter = (v: unknown): EvalFilter => (v === "labelled" || v === "all" ? v : "unlabelled");
export const parsePage = (v: unknown): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
};

/** The /iris/eval page (AC5, AC7, AC8, AC14). Owner only, checked before any Iris read. */
export async function loadEval(
  deps: EvalAdminDeps & { iris: (orgId: string) => IrisReader; studentNames: (orgId: string) => Promise<Map<string, string>> },
  filter: EvalFilter,
  page: number,
): Promise<EvalPageResult> {
  const gate = pageGate(await deps.identity());
  if (gate.kind !== "ok") return gate;
  try {
    const reader = deps.reader(gate.orgId);
    const [settings, status, list, names] = await Promise.all([
      deps.iris(gate.orgId).getSettings(),
      reader.evalStatus(),
      reader.listEvalItems(filter, page),
      deps.studentNames(gate.orgId).catch(() => new Map<string, string>()),
    ]);
    if (!settings) return { kind: "error" };
    const items = list.items.map((i) => ({ ...i, family: familyLabel(i.notionStudentIds, i.fromEmail, names) }));
    return { kind: "ok", paused: settings.paused, status, items, total: list.total, page, filter };
  } catch {
    return { kind: "error" };
  }
}

export type ReadinessRow = {
  type: string; pass: boolean; failing: GateCondition[]; count: number; streak: number;
  /** REQ-49: the switch state and totals. A type gets a switch only when eligible and not on the never list. */
  enabled: boolean; eligible: boolean; switchable: boolean; approvedTotal: number; editedTotal: number; rejectedTotal: number;
  disabledReason: string | null; disabledAt: string | null;
};
export type ReadinessResult = { kind: "ok"; runAt: string | null; runPolicyVersion: number | null; rows: ReadinessRow[]; never: string[] } | { kind: "error" };

/** The settings page's Auto-send card (REQ-45 AC11, REQ-49 AC13). Called after the page's own owner check. */
export async function loadReadiness(reader: EvalReader, model: string): Promise<ReadinessResult> {
  try {
    const { run, replyTypes } = await reader.gateInputs();
    const rows = AUTO_SEND_CANDIDATES.map((type) => {
      const rt = replyTypes[type];
      const r = evaluateGate({ type, run, replyType: rt ?? null, policyVersion: POLICY_VERSION, model });
      const eligible = rt?.autoSendEligible ?? false;
      return {
        type, ...r, count: run?.perType[type]?.count ?? 0, streak: rt?.uneditedStreak ?? 0,
        enabled: rt?.autoSendEnabled ?? false, eligible, switchable: eligible && !(NEVER_AUTO_SEND as readonly string[]).includes(type),
        approvedTotal: rt?.approvedUneditedTotal ?? 0, editedTotal: rt?.editedTotal ?? 0, rejectedTotal: rt?.rejectedTotal ?? 0,
        disabledReason: rt?.disabledReason ?? null, disabledAt: rt?.disabledAt ?? null,
      };
    });
    return { kind: "ok", runAt: run?.ranAt ?? null, runPolicyVersion: run?.policyVersion ?? null, rows, never: [...NEVER_AUTO_SEND] };
  } catch {
    return { kind: "error" };
  }
}
