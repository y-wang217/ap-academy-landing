import type { Viewer } from "../data/queries";
import { healthOf, type ConsolePanels, type HealthProvider } from "./contracts";
import { loadConsolePanels, type FacadeDeps } from "./facade";
import { CONSOLE_DENIALS, requireOwner, type OwnerViewer } from "./guard";
import type { OperationsPanels } from "./operations";
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
async function gateOwner(input: HandlerInput): Promise<{ ok: true; viewer: OwnerViewer } | { ok: false; response: Response }> {
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
