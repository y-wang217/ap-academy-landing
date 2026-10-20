import { realIrisAdminDeps } from "@/lib/iris/deps";
import { handleIrisSettings } from "@/lib/iris/handlers";

export const dynamic = "force-dynamic";

/** Pause or unpause Iris. Owner only (REQ-42 AC27); the proxy origin-checks it first (ADR 0042). */
export async function PATCH(request: Request) {
  return handleIrisSettings(realIrisAdminDeps(), await request.json().catch(() => null));
}
