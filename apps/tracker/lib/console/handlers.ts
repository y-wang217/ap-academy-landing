import type { Viewer } from "../data/queries";
import { healthOf, type ConsolePanels, type HealthProvider } from "./contracts";
import { loadConsolePanels, type FacadeDeps } from "./facade";
import { CONSOLE_DENIALS, requireOwner, type OwnerViewer } from "./guard";
import { buildSalesView } from "./sales-view";

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
