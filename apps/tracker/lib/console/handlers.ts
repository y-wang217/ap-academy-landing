import type { Viewer } from "../data/queries";
import { healthOf, type ConsolePanels, type HealthProvider } from "./contracts";
import { loadConsolePanels, type FacadeDeps } from "./facade";
import { CONSOLE_DENIALS, requireOwner, type OwnerViewer } from "./guard";
import type { OperationsPanels } from "./operations";
import type { LeadWriter } from "../notion/lead-writer";
import { runOutcome, type OutcomeRun } from "./outcome-run";
import { OutcomeBodySchema } from "./outcome-schema";
import type { OutcomeStore } from "./outcome-store";
import { buildSalesView } from "./sales-view";
import { buildSignals, SignalsViewSchema, type OutboxRead, type ProtectedTime } from "./signals";

const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const unavailable = () => send(503, CONSOLE_DENIALS.unavailable);

type HandlerInput = {
  viewer: () => Promise<Viewer>;
  now?: () => Date;
  deps: (viewer: OwnerViewer, now: () => Date) => FacadeDeps;
};

/**
 * The owner gate every console route runs first (REQ-53, ADR 0062). The app
 * check comes first and a denial reads nothing; then is_org_owner on the
 * owner's own client, so RLS agrees with the app check.
 */
async function gateOwner(input: Pick<HandlerInput, "viewer">): Promise<{ ok: true; viewer: OwnerViewer } | { ok: false; response: Response }> {
  let viewer: Viewer;
  try {
    viewer = await input.viewer();
  } catch {
    return { ok: false, response: unavailable() };
  }
  const gate = requireOwner(viewer);
  if (!gate.ok) return { ok: false, response: send(gate.status, gate.body) };
  try {
    const { data, error } = await gate.viewer.db.tracker.rpc("is_org_owner", { target_org: gate.viewer.orgId });
    if (error) return { ok: false, response: unavailable() };
    if (data !== true) return { ok: false, response: send(403, CONSOLE_DENIALS.forbidden) };
  } catch {
    return { ok: false, response: unavailable() };
  }
  return { ok: true, viewer: gate.viewer };
}

/**
 * GET /api/console/health (REQ-53, REQ-54). After the owner gate, the console
 * facade. The answer is each provider's status and times, never a row, a
 * count or a name. Never throws.
 */
export async function handleConsoleHealth(input: HandlerInput): Promise<Response> {
  const now = input.now ?? (() => new Date());
  const gate = await gateOwner(input);
  if (!gate.ok) return gate.response;
  const checkedAt = now().toISOString();
  let panels: ConsolePanels;
  try {
    panels = await loadConsolePanels(input.deps(gate.viewer, now));
  } catch {
    return unavailable();
  }
  const providers = Object.fromEntries(Object.entries(panels).map(([k, r]) => [k, healthOf(r)])) as Record<keyof ConsolePanels, HealthProvider>;
  const ok = Object.values(providers).every((p) => p.status === "ready" || p.status === "empty");
  return send(200, { status: ok ? "ok" : "degraded", checkedAt, providers });
}

/**
 * GET /api/console/sales (REQ-57, ADR 0071). After the owner gate, one facade
 * load and the sales view: the ranked queue and the radar, parsed with
 * SalesViewSchema so no server-only key leaves. Never throws.
 */
export async function handleConsoleSales(input: HandlerInput): Promise<Response> {
  const now = input.now ?? (() => new Date());
  const gate = await gateOwner(input);
  if (!gate.ok) return gate.response;
  try {
    const panels = await loadConsolePanels(input.deps(gate.viewer, now));
    return send(200, buildSalesView(panels, now()));
  } catch {
    return unavailable();
  }
}

/** What the signals route reads besides the facade (REQ-62); each never throws. */
export type SignalSources = {
  operations(people: FacadeDeps["people"]): Promise<OperationsPanels>;
  outbox(): Promise<OutboxRead>;
  teaching(): Promise<ProtectedTime>;
};

/**
 * GET /api/console/signals (REQ-62, tracker ADR 0077). After the owner gate,
 * the facade, Operations, the failed outbox rows and the owner's teaching
 * time together, one people read shared, then the signals view parsed with
 * SignalsViewSchema, so no phone, email or last_error leaves. Reads only.
 * Never throws.
 */
export async function handleConsoleSignals(input: HandlerInput & { sources: (viewer: OwnerViewer, deps: FacadeDeps, now: Date) => SignalSources }): Promise<Response> {
  const now = input.now ?? (() => new Date());
  const gate = await gateOwner(input);
  if (!gate.ok) return gate.response;
  try {
    const base = input.deps(gate.viewer, now);
    let people: ReturnType<FacadeDeps["people"]> | null = null;
    const deps: FacadeDeps = { ...base, people: () => (people ??= base.people()) };
    const at = now();
    const sources = input.sources(gate.viewer, deps, at);
    const [panels, ops, outbox, protectedTime] = await Promise.all([loadConsolePanels(deps), sources.operations(deps.people), sources.outbox(), sources.teaching()]);
    const view = buildSignals({ panels, lessonGaps: ops.lessonGaps, schedule: ops.upcoming, outbox, protectedTime }, at);
    return send(200, SignalsViewSchema.parse(view));
  } catch {
    return unavailable();
  }
}

/** What POST /api/console/outcomes writes through; null when Notion is not configured. */
export type OutcomeDeps = { store: OutcomeStore; writer: LeadWriter } | null;

const OUTCOME_STATUS: Record<OutcomeRun["kind"], number> = {
  done: 200, uncertain: 202, stale: 409, in_progress: 409, request_id_reused: 409, unresolved_transition: 409,
  contract_missing: 422, disallowed: 422, bad_form: 422, failed: 502, notion_not_ready: 503, unavailable: 503,
};

function outcomeBody(run: OutcomeRun): unknown {
  switch (run.kind) {
    case "done":
      return { status: "done", result: run.result, cadenceUsedUp: run.cadenceUsedUp, staffLinked: run.staffLinked };
    case "uncertain":
      return { error: "uncertain", message: run.message, retryAfterSeconds: run.retryAfterSeconds };
    case "stale":
      return { error: "stale", current: run.current };
    case "unresolved_transition":
      return { error: "unresolved_transition", requestId: run.openRequestId };
    case "contract_missing":
      return { error: "contract_missing", missing: run.missing, notionUrl: run.notionUrl };
    case "disallowed":
      return { error: "disallowed", message: run.message, notionUrl: run.notionUrl };
    case "bad_form":
    case "failed":
      return { error: run.kind, message: run.message };
    case "notion_not_ready":
      return { error: "notion_not_ready", missing: run.missing };
    case "unavailable":
      return CONSOLE_DENIALS.unavailable;
    default:
      return { error: run.kind };
  }
}

/**
 * POST /api/console/outcomes (REQ-61, tracker ADR 0076). The owner gate
 * first, so a denial reads no body, no Notion page and no transition row;
 * then the strict body, the owner's staff id on their own client, and the
 * outcome run. Never throws.
 */
export async function handleConsoleOutcome(input: {
  viewer: () => Promise<Viewer>; request: Request; now?: () => Date; deps: (viewer: OwnerViewer) => OutcomeDeps;
}): Promise<Response> {
  const now = input.now ?? (() => new Date());
  const gate = await gateOwner(input);
  if (!gate.ok) return gate.response;
  const parsed = OutcomeBodySchema.safeParse(await input.request.json().catch(() => undefined));
  if (!parsed.success) return send(400, { error: "bad_request" });
  const deps = input.deps(gate.viewer);
  if (!deps) return send(503, { error: "notion_not_ready", missing: ["Notion connection"] });
  let staffId: string | null;
  try {
    const { data, error } = await gate.viewer.db.tracker.rpc("my_staff_id", { target_org: gate.viewer.orgId });
    if (error) return unavailable();
    staffId = typeof data === "string" ? data : null;
  } catch {
    return unavailable();
  }
  const run = await runOutcome({ body: parsed.data, store: deps.store, writer: deps.writer, staffId, now });
  return send(OUTCOME_STATUS[run.kind], outcomeBody(run));
}
