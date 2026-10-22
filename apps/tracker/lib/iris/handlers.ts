import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import { requireScheduler, type Denial } from "../scheduler/guard";
import type { SchedulerIdentity } from "../scheduler/identity";
import type { ClassifyPort } from "./classify";
import { runClassify } from "./classify-step";
import type { DraftPort } from "./draft";
import { runDraft, type StudentSchedule } from "./draft-step";
import { runIntake, type GmailPort } from "./intake";
import type { PushOutcome } from "./notion-push";
import { POLICY_VERSION } from "./policy";
import { IrisRunResponse, type InboxMessage, type MessageDetail, type OwnerSettings, type RunSummary, type ThreadView } from "./schemas";
import type { IrisStore } from "./store";
import { runSupersede } from "./supersede";

const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const deny = (d: Denial) => send(d.status, d.body);
const notConfigured = () => send(503, { error: "iris_not_configured" });
const unavailable = () => send(503, { error: "iris_unavailable" });

const digest = (s: string) => createHash("sha256").update(s).digest();
/** Constant-time compare of two secrets of any length. */
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export type IrisRunDeps = {
  store: IrisStore;
  gmail: GmailPort;
  directory: () => Promise<FamilyEntry[]>;
  mailbox: string;
  /** Null when AI is not set up: messages stay at matched (REQ-43). */
  classify: ClassifyPort | null;
  /** Null when AI is not set up: classified messages wait for a draft (REQ-44). */
  draft: DraftPort | null;
  /** One student's classes from the scheduler, for schedule-aware cancellations (REQ-46). Null: cancellations draft as before. */
  schedule: ((studentId: string) => Promise<StudentSchedule>) | null;
  /** The Notion phone backup, or null when Notion Work is not set up (REQ-44). */
  push: ((d: { store: IrisStore; directory: () => Promise<FamilyEntry[]>; now: () => Date }) => Promise<PushOutcome>) | null;
};

/**
 * The scheduled Iris poll (REQ-42), modelled on handleDailyTaskRun. It
 * authenticates itself before any database, Gmail or Notion call: no secret
 * is 503, a missing or wrong bearer is 401. Paused touches nothing; a held
 * lease is "busy". Every run that took the lease purges, records a run row,
 * writes the last-run columns and releases the lease. Only a Gmail list or
 * token failure is 502. It never throws. After a good intake it reads
 * Charlie's sent replies, classifies (REQ-43), drafts and pushes the phone
 * copies (REQ-44), then purges; Students & Parents is read at most once per run.
 */
export async function handleIrisRun(input: {
  authorization: string | null;
  env: { secret: string | undefined; orgId: string | undefined };
  build: (orgId: string) => IrisRunDeps | null;
  now?: () => Date;
}): Promise<Response> {
  const { secret, orgId } = input.env;
  if (!secret) return notConfigured();
  const bearer = /^Bearer (.+)$/.exec(input.authorization ?? "")?.[1];
  if (!bearer || !sameSecret(bearer, secret)) return send(401, { error: "unauthenticated" });
  if (!orgId || !z.guid().safeParse(orgId).success) return notConfigured();
  const now = input.now ?? (() => new Date());

  let deps: IrisRunDeps | null;
  try {
    deps = input.build(orgId);
  } catch {
    deps = null;
  }
  if (!deps) return notConfigured();
  const { store } = deps;

  let settings;
  try {
    settings = await store.getSettings();
  } catch {
    return unavailable();
  }
  if (!settings) return notConfigured();
  if (settings.paused) return send(200, { result: "paused" });

  let claimed;
  try {
    claimed = await store.claimPoll(TUNING.irisPollLeaseSeconds);
  } catch {
    return unavailable();
  }
  if (!claimed) return send(200, { result: "busy" });

  const startedMs = now().getTime();
  const startedAt = new Date(startedMs).toISOString();
  let once: Promise<FamilyEntry[]> | undefined;
  const directory = () => (once ??= deps.directory());
  const intake = await runIntake({ store, gmail: deps.gmail, directory, now, mailbox: deps.mailbox, settings: claimed });
  const ok = intake.result === "ok";
  const superseded = ok ? await runSupersede({ store, gmail: deps.gmail, settings: claimed }) : { stored: 0, superseded: 0, error: null };
  const classified = ok
    ? await runClassify({ store, classify: deps.classify, directory, settings: claimed, now, startedAtMs: startedMs })
    : { result: "ok" as const, classified: 0, escalated: 0, failed: 0, error: null };
  const drafted = ok && classified.result === "ok"
    ? await runDraft({ store, draft: deps.draft, directory, schedule: deps.schedule, now, startedAtMs: startedMs })
    : { result: "ok" as const, drafted: 0, escalated: 0, failed: 0, error: null };
  const failedStep = classified.result === "failed" || drafted.result === "failed";
  const pushed = ok && !failedStep && deps.push && now().getTime() - startedMs < TUNING.irisPushBudgetMs
    ? await deps.push({ store, directory, now })
    : null;
  const outcome = { ...intake, result: failedStep ? ("failed" as const) : intake.result };
  let error = intake.error ?? classified.error ?? drafted.error ?? superseded.error ?? pushed?.error ?? null;
  let purged = 0;
  try {
    purged = await store.purge();
  } catch {
    error = error ?? "Purge failed";
  }
  const finishedAt = now().toISOString();
  const counts = {
    seen: intake.seen, stored: intake.stored + superseded.stored, matched: intake.matched, classified: classified.classified, drafted: drafted.drafted,
    escalated: intake.escalated + classified.escalated + drafted.escalated, skipped: intake.skipped, failed: intake.failed + classified.failed + drafted.failed, purged,
  };
  let runId: string | null = null;
  try {
    runId = await store.insertRun({ startedAt, finishedAt, result: outcome.result, ...counts, error });
  } catch {
    // The response still reports the run; the next run writes its own row.
  }
  try {
    await store.releasePoll({ lastPollAt: finishedAt, lastPollResult: outcome.result, lastError: error });
  } catch {
    // The lease lapses on its own after irisPollLeaseSeconds.
  }
  return send(outcome.gmailListFailed ? 502 : 200, IrisRunResponse.parse({ result: outcome.result, runId, ...counts }));
}

/** What the owner pages and routes read, through the owner's own client (RLS decides). */
export type IrisReader = {
  getSettings(): Promise<OwnerSettings | null>;
  lastRun(): Promise<RunSummary | null>;
  listNeedsYou(limit: number): Promise<InboxMessage[]>;
  listRecent(limit: number): Promise<InboxMessage[]>;
  /** Rows updated: 0 means RLS or the grant refused it. */
  updatePaused(paused: boolean): Promise<number>;
  /** One inbound message, or null when it is not in the owner's org. */
  getMessage(id: string): Promise<MessageDetail | null>;
  /** Sets handled_at and handled_by on an unhandled escalated message and logs one event (REQ-43). */
  markHandled(id: string): Promise<"ok" | "conflict" | "not_found">;
  /** REQ-44 queue sections. */
  listDraftsWaiting(limit: number): Promise<InboxMessage[]>;
  /** Approved or sent since `since` (Toronto midnight). */
  listSentToday(since: string, limit: number): Promise<InboxMessage[]>;
  listFailed(limit: number): Promise<InboxMessage[]>;
  /** The message's thread and its drafts, newest version first; null when not in the org. */
  getThreadView(id: string): Promise<ThreadView | null>;
  /** iris.approve_draft, save_draft_edit and reject_draft (REQ-44): atomic, owner checked inside. */
  approveDraft(id: string, version: number): Promise<ReviewOutcome>;
  saveDraftEdit(id: string, version: number, body: string): Promise<{ result: ReviewOutcome; draftId: string | null }>;
  rejectDraft(id: string, reason: string): Promise<ReviewOutcome>;
};
export type ReviewOutcome = "ok" | "conflict" | "not_found";

export type IrisAdminDeps = {
  identity: () => Promise<SchedulerIdentity>;
  reader: (orgId: string) => IrisReader;
};

const SettingsBody = z.strictObject({ paused: z.boolean(), confirmed: z.literal(true).optional() });

/** PATCH /api/iris/settings. Owner only; the guard runs before anything is read. Unpause needs the tick. */
export async function handleIrisSettings(deps: IrisAdminDeps, body: unknown): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  const parsed = SettingsBody.safeParse(body);
  if (!parsed.success) return send(400, { error: "invalid_request" });
  if (!parsed.data.paused && !parsed.data.confirmed) return send(400, { error: "confirm_required" });
  let updated: number;
  try {
    updated = await deps.reader(gate.identity.orgId).updatePaused(parsed.data.paused);
  } catch {
    return unavailable();
  }
  if (updated === 0) return send(403, { error: "forbidden" });
  return send(200, { paused: parsed.data.paused });
}

/**
 * POST /api/iris/run-now. Owner only. Calls the bearer run server-side, so the
 * secret never reaches the browser and no third service-role importer appears.
 */
export async function handleRunNow(input: {
  identity: () => Promise<SchedulerIdentity>;
  secret: string | undefined;
  runUrl: string;
  fetcher?: typeof fetch;
}): Promise<Response> {
  const gate = requireScheduler(await input.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  if (!input.secret) return notConfigured();
  try {
    const res = await (input.fetcher ?? fetch)(input.runUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(130_000),
    });
    const parsed = IrisRunResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return unavailable();
    return send(res.status, parsed.data);
  } catch {
    return unavailable();
  }
}

/**
 * POST /api/iris/messages/[id]/handled (REQ-43 AC15). Owner only; the guard
 * runs before the id is read. A second call is 409; anything not escalated or
 * not in the org is 404. A failed save is 500 and never says handled.
 */
export async function handleMarkHandled(deps: IrisAdminDeps, id: string): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  if (!z.guid().safeParse(id).success) return send(404, { error: "not_found" });
  let result: Awaited<ReturnType<IrisReader["markHandled"]>>;
  try {
    result = await deps.reader(gate.identity.orgId).markHandled(id);
  } catch {
    return send(500, { error: "save_failed" });
  }
  if (result === "conflict") return send(409, { error: "already_handled" });
  if (result === "not_found") return send(404, { error: "not_found" });
  return send(200, { handled: true });
}

const ApproveBody = z.strictObject({ version: z.number().int().positive() });
const EditBody = z.strictObject({ version: z.number().int().positive(), body: z.string().trim().min(1).max(5000) });
const RejectBody = z.strictObject({ reason: z.string().trim().min(1).max(300) });

/**
 * The three draft reviews (REQ-44 AC8 to AC10, AC15). Owner only; the guard
 * runs before the id or the body is read. ok 200, conflict 409, an unknown or
 * other-org draft 404, a bad body 400, a failed save 500.
 */
async function review<T extends z.ZodType>(
  deps: IrisAdminDeps,
  id: string,
  body: unknown,
  schema: T,
  act: (reader: IrisReader, input: z.infer<T>) => Promise<{ result: ReviewOutcome; draftId?: string | null }>,
): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  if (!z.guid().safeParse(id).success) return send(404, { error: "not_found" });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return send(400, { error: "invalid_request" });
  let out: { result: ReviewOutcome; draftId?: string | null };
  try {
    out = await act(deps.reader(gate.identity.orgId), parsed.data);
  } catch {
    return send(500, { error: "save_failed" });
  }
  if (out.result === "conflict") return send(409, { error: "conflict" });
  if (out.result === "not_found") return send(404, { error: "not_found" });
  return send(200, { ok: true, ...(out.draftId ? { draftId: out.draftId } : {}) });
}

export const handleApproveDraft = (deps: IrisAdminDeps, id: string, body: unknown) =>
  review(deps, id, body, ApproveBody, async (r, b) => ({ result: await r.approveDraft(id, b.version) }));
export const handleEditDraft = (deps: IrisAdminDeps, id: string, body: unknown) =>
  review(deps, id, body, EditBody, (r, b) => r.saveDraftEdit(id, b.version, b.body));
export const handleRejectDraft = (deps: IrisAdminDeps, id: string, body: unknown) =>
  review(deps, id, body, RejectBody, async (r, b) => ({ result: await r.rejectDraft(id, b.reason) }));

export type InboxRow = InboxMessage & { family: string; child: string | null };
export type InboxResult =
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "ok"; paused: boolean; needsYou: InboxRow[]; drafts: InboxRow[]; sentToday: InboxRow[]; failed: InboxRow[]; recent: InboxRow[]; nowMs: number };

/** Toronto midnight today, as an instant. */
export function torontoMidnight(now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(now);
  // Toronto is UTC-4 or UTC-5: of the two candidate instants, the later one at or before now is midnight.
  for (const offset of ["-04:00", "-05:00"]) {
    const t = new Date(`${day}T00:00:00${offset}`);
    if (t.getTime() <= now.getTime() && new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(t) === day) return t.toISOString();
  }
  return new Date(`${day}T00:00:00-05:00`).toISOString();
}

/** A page's first check. Anything but the owner is sent away; an unreachable identity is an error notice. */
function pageGate(who: SchedulerIdentity): { kind: "denied" } | { kind: "error" } | { kind: "ok"; orgId: string } {
  if (who.scope === "unavailable" || who.scope === "unconfigured") return { kind: "error" };
  if (who.scope !== "admin") return { kind: "denied" };
  return { kind: "ok", orgId: who.orgId };
}

const familyLabel = (ids: string[], fallback: string, names: Map<string, string>) =>
  ids.length > 0 ? ids.map((id) => names.get(id) ?? "Paused student").join(", ") : fallback;

/** The /iris page. Family labels come from the local people copy (REQ-38), read for the owner's org; no parent field is read on page load. */
export async function loadInbox(deps: IrisAdminDeps & { studentNames: (orgId: string) => Promise<Map<string, string>> }): Promise<InboxResult> {
  const gate = pageGate(await deps.identity());
  if (gate.kind !== "ok") return gate;
  try {
    const reader = deps.reader(gate.orgId);
    const nowMs = Date.now();
    const [settings, needs, drafts, sentToday, failed, recent, names] = await Promise.all([
      reader.getSettings(),
      reader.listNeedsYou(50),
      reader.listDraftsWaiting(50),
      reader.listSentToday(torontoMidnight(new Date(nowMs)), 50),
      reader.listFailed(50),
      reader.listRecent(50),
      deps.studentNames(gate.orgId).catch(() => new Map<string, string>()),
    ]);
    if (!settings) return { kind: "error" };
    const label = (m: InboxMessage): InboxRow => ({
      ...m,
      family: familyLabel(m.notionStudentIds, m.fromEmail, names),
      child: m.notionStudentId ? (names.get(m.notionStudentId) ?? null) : null,
    });
    return {
      kind: "ok", paused: settings.paused, needsYou: needs.map(label), drafts: drafts.map(label), sentToday: sentToday.map(label),
      failed: failed.map(label), recent: recent.map(label), nowMs,
    };
  } catch {
    return { kind: "error" };
  }
}

export type MessageResult =
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "not_found" }
  | { kind: "ok"; message: MessageDetail & { family: string }; view: ThreadView; currentPolicyVersion: number };

/** The /iris/messages/[id] page (REQ-43 AC14): owner only, checked before any Iris read. */
export async function loadMessage(deps: IrisAdminDeps & { studentNames: (orgId: string) => Promise<Map<string, string>> }, id: string): Promise<MessageResult> {
  const gate = pageGate(await deps.identity());
  if (gate.kind !== "ok") return gate;
  if (!z.guid().safeParse(id).success) return { kind: "not_found" };
  try {
    const reader = deps.reader(gate.orgId);
    const [message, view, names] = await Promise.all([reader.getMessage(id), reader.getThreadView(id), deps.studentNames(gate.orgId).catch(() => new Map<string, string>())]);
    if (!message || !view) return { kind: "not_found" };
    return { kind: "ok", message: { ...message, family: familyLabel(message.notionStudentIds, message.fromEmail, names) }, view, currentPolicyVersion: POLICY_VERSION };
  } catch {
    return { kind: "error" };
  }
}

export type IrisSettingsResult =
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "ok"; paused: boolean; lastRun: RunSummary | null; lastError: string | null; missing: string[]; aiConfigured: boolean; confidenceThreshold: number; phoneAlertsOff: boolean };

/**
 * The /iris/settings page: state, the last run, its error, the unset env
 * names, whether AI is set up, and whether phone alerts are off (REQ-44 AC18).
 */
export async function loadIrisSettings(deps: IrisAdminDeps, missing: string[], aiConfigured = true, phoneAlertsOff = false): Promise<IrisSettingsResult> {
  const gate = pageGate(await deps.identity());
  if (gate.kind !== "ok") return gate;
  try {
    const reader = deps.reader(gate.orgId);
    const [settings, lastRun] = await Promise.all([reader.getSettings(), reader.lastRun()]);
    if (!settings) return { kind: "error" };
    return { kind: "ok", paused: settings.paused, lastRun, lastError: settings.lastError, missing, aiConfigured, confidenceThreshold: settings.confidenceThreshold, phoneAlertsOff };
  } catch {
    return { kind: "error" };
  }
}
