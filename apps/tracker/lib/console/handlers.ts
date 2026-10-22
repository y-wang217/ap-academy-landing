import type { Viewer } from "../data/queries";
import { healthOf, type ConsolePanels, type HealthProvider } from "./contracts";
import { loadConsolePanels, type FacadeDeps } from "./facade";
import { CONSOLE_DENIALS, requireOwner, type OwnerViewer } from "./guard";

const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const unavailable = () => send(503, CONSOLE_DENIALS.unavailable);

/**
 * GET /api/console/health (REQ-53, REQ-54). The owner check comes first and a
 * denial reads nothing. Then is_org_owner on the owner's own client, so RLS
 * agrees with the app check, and only then the console facade. The answer is
 * each provider's status and times, never a row, a count or a name. Never throws.
 */
export async function handleConsoleHealth(input: {
  viewer: () => Promise<Viewer>;
  now?: () => Date;
  deps: (viewer: OwnerViewer, now: () => Date) => FacadeDeps;
}): Promise<Response> {
  const now = input.now ?? (() => new Date());
  let viewer: Viewer;
  try {
    viewer = await input.viewer();
  } catch {
    return unavailable();
  }
  const gate = requireOwner(viewer);
  if (!gate.ok) return send(gate.status, gate.body);
  try {
    const { data, error } = await gate.viewer.db.tracker.rpc("is_org_owner", { target_org: gate.viewer.orgId });
    if (error) return unavailable();
    if (data !== true) return send(403, CONSOLE_DENIALS.forbidden);
  } catch {
    return unavailable();
  }
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
