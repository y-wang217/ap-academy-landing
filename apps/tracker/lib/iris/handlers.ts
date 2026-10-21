import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import { requireScheduler, type Denial } from "../scheduler/guard";
import type { SchedulerIdentity } from "../scheduler/identity";
import { runIntake, type GmailPort } from "./intake";
import { IrisRunResponse, type InboxMessage, type OwnerSettings, type RunSummary } from "./schemas";
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
};

/**
 * The scheduled Iris poll (REQ-42), modelled on handleDailyTaskRun. It
 * authenticates itself before any database, Gmail or Notion call: no secret
 * is 503, a missing or wrong bearer is 401. Paused touches nothing; a held
 * lease is "busy". Every run that took the lease purges, records a run row,
 * writes the last-run columns and releases the lease. Only a Gmail list or
 * token failure is 502. It never throws.
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

  const startedAt = now().toISOString();
  const outcome = await runIntake({ store, gmail: deps.gmail, directory: deps.directory, now, mailbox: deps.mailbox, settings: claimed });
  let error = outcome.error;
  let purged = 0;
  try {
    purged = await store.purge();
  } catch {
    error = error ?? "Purge failed";
  }
  const finishedAt = now().toISOString();
  const counts = { seen: outcome.seen, stored: outcome.stored, matched: outcome.matched, escalated: outcome.escalated, skipped: outcome.skipped, failed: outcome.failed, purged };
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

export type InboxRow = InboxMessage & { family: string };
export type InboxResult = { kind: "denied" } | { kind: "error" } | { kind: "ok"; paused: boolean; needsYou: InboxRow[]; recent: InboxRow[]; nowMs: number };

/** A page's first check. Anything but the owner is sent away; an unreachable identity is an error notice. */
function pageGate(who: SchedulerIdentity): { kind: "denied" } | { kind: "error" } | { kind: "ok"; orgId: string } {
  if (who.scope === "unavailable" || who.scope === "unconfigured") return { kind: "error" };
  if (who.scope !== "admin") return { kind: "denied" };
  return { kind: "ok", orgId: who.orgId };
}

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
    const label = (m: InboxMessage): InboxRow => ({
      ...m,
      family: m.notionStudentIds.length > 0 ? m.notionStudentIds.map((id) => names.get(id) ?? "Paused student").join(", ") : m.fromEmail,
    });
    return { kind: "ok", paused: settings.paused, needsYou: needs.map(label), recent: recent.map(label), nowMs: Date.now() };
  } catch {
    return { kind: "error" };
  }
}

export type IrisSettingsResult =
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "ok"; paused: boolean; lastRun: RunSummary | null; lastError: string | null; missing: string[] };

/** The /iris/settings page: state, the last run, its error, and the unset env names. */
export async function loadIrisSettings(deps: IrisAdminDeps, missing: string[]): Promise<IrisSettingsResult> {
  const gate = pageGate(await deps.identity());
  if (gate.kind !== "ok") return gate;
  try {
    const reader = deps.reader(gate.orgId);
    const [settings, lastRun] = await Promise.all([reader.getSettings(), reader.lastRun()]);
    if (!settings) return { kind: "error" };
    return { kind: "ok", paused: settings.paused, lastRun, lastError: settings.lastError, missing };
  } catch {
    return { kind: "error" };
  }
}
