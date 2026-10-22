import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import { requireScheduler, type Denial } from "../scheduler/guard";
import type { SchedulerIdentity } from "../scheduler/identity";
import type { ClassifyPort } from "./classify";
import { runClassify } from "./classify-step";
import { runIntake, type GmailPort } from "./intake";
import { IrisRunResponse, type InboxMessage, type MessageDetail, type OwnerSettings, type RunSummary } from "./schemas";
import type { IrisStore } from "./store";

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
};

/**
 * The scheduled Iris poll (REQ-42), modelled on handleDailyTaskRun. It
 * authenticates itself before any database, Gmail or Notion call: no secret
 * is 503, a missing or wrong bearer is 401. Paused touches nothing; a held
 * lease is "busy". Every run that took the lease purges, records a run row,
 * writes the last-run columns and releases the lease. Only a Gmail list or
 * token failure is 502. It never throws. After a good intake it classifies
 * (REQ-43); Students & Parents is read at most once per run for both.
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
  const classified = intake.result === "ok"
    ? await runClassify({ store, classify: deps.classify, directory, settings: claimed, now, startedAtMs: startedMs })
    : { result: "ok" as const, classified: 0, escalated: 0, failed: 0, error: null };
  const outcome = { ...intake, result: classified.result === "failed" ? ("failed" as const) : intake.result };
  let error = intake.error ?? classified.error;
  let purged = 0;
  try {
    purged = await store.purge();
  } catch {
    error = error ?? "Purge failed";
  }
  const finishedAt = now().toISOString();
  const counts = {
    seen: intake.seen, stored: intake.stored, matched: intake.matched, classified: classified.classified,
    escalated: intake.escalated + classified.escalated, skipped: intake.skipped, failed: intake.failed + classified.failed, purged,
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
};

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
      signal: AbortSignal.timeout(70_000),
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

export type InboxRow = InboxMessage & { family: string };
export type InboxResult = { kind: "denied" } | { kind: "error" } | { kind: "ok"; paused: boolean; needsYou: InboxRow[]; recent: InboxRow[]; nowMs: number };

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
    const [settings, needs, recent, names] = await Promise.all([
      reader.getSettings(),
      reader.listNeedsYou(50),
      reader.listRecent(50),
      deps.studentNames(gate.orgId).catch(() => new Map<string, string>()),
    ]);
    if (!settings) return { kind: "error" };
    const label = (m: InboxMessage): InboxRow => ({ ...m, family: familyLabel(m.notionStudentIds, m.fromEmail, names) });
    return { kind: "ok", paused: settings.paused, needsYou: needs.map(label), recent: recent.map(label), nowMs: Date.now() };
  } catch {
    return { kind: "error" };
  }
}

export type MessageResult = { kind: "denied" } | { kind: "error" } | { kind: "not_found" } | { kind: "ok"; message: MessageDetail & { family: string } };

/** The /iris/messages/[id] page (REQ-43 AC14): owner only, checked before any Iris read. */
export async function loadMessage(deps: IrisAdminDeps & { studentNames: (orgId: string) => Promise<Map<string, string>> }, id: string): Promise<MessageResult> {
  const gate = pageGate(await deps.identity());
  if (gate.kind !== "ok") return gate;
  if (!z.guid().safeParse(id).success) return { kind: "not_found" };
  try {
    const [message, names] = await Promise.all([deps.reader(gate.orgId).getMessage(id), deps.studentNames(gate.orgId).catch(() => new Map<string, string>())]);
    if (!message) return { kind: "not_found" };
    return { kind: "ok", message: { ...message, family: familyLabel(message.notionStudentIds, message.fromEmail, names) } };
  } catch {
    return { kind: "error" };
  }
}

export type IrisSettingsResult =
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "ok"; paused: boolean; lastRun: RunSummary | null; lastError: string | null; missing: string[]; aiConfigured: boolean; confidenceThreshold: number };

/** The /iris/settings page: state, the last run, its error, the unset env names, and whether AI is set up. */
export async function loadIrisSettings(deps: IrisAdminDeps, missing: string[], aiConfigured = true): Promise<IrisSettingsResult> {
  const gate = pageGate(await deps.identity());
  if (gate.kind !== "ok") return gate;
  try {
    const reader = deps.reader(gate.orgId);
    const [settings, lastRun] = await Promise.all([reader.getSettings(), reader.lastRun()]);
    if (!settings) return { kind: "error" };
    return { kind: "ok", paused: settings.paused, lastRun, lastError: settings.lastError, missing, aiConfigured, confidenceThreshold: settings.confidenceThreshold };
  } catch {
    return { kind: "error" };
  }
}
