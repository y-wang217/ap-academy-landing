import type { Viewer } from "../data/queries";
import { CONSOLE_DENIALS, requireOwner } from "./guard";

const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const unavailable = () => send(503, CONSOLE_DENIALS.unavailable);

/**
 * GET /api/console/health (REQ-53). The owner check comes first and a denial
 * reads nothing. Then one read on the owner's own client, so RLS's
 * is_org_owner agrees with the app check before anything is reported. Never throws.
 */
export async function handleConsoleHealth(input: { viewer: () => Promise<Viewer>; now?: () => Date }): Promise<Response> {
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
  return send(200, { status: "ok", checkedAt: now().toISOString() });
}
