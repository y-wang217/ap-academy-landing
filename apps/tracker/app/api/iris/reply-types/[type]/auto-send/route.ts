import { realEvalAdminDeps, realIrisAdminDeps } from "@/lib/iris/deps";
import { handleAutoSendSwitch } from "@/lib/iris/handlers";

export const dynamic = "force-dynamic";

/** Switch auto-send on or off for one reply type (REQ-49 AC10). Owner only; the proxy origin-checks it first (ADR 0042). */
export async function POST(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const type = (await params).type;
  return handleAutoSendSwitch(realIrisAdminDeps(), realEvalAdminDeps(), type, await request.json().catch(() => null));
}
