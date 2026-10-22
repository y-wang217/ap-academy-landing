import { handleConsoleHealth } from "@/lib/console/handlers";
import { createConsoleDeps } from "@/lib/console/providers";
import { getViewer } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

/** Owner only (REQ-53, tracker ADR 0062). GET only: the proxy origin-checks any write under /api/console/ first (ADR 0042). Providers: REQ-54, ADR 0065. */
export async function GET() {
  return handleConsoleHealth({ viewer: getViewer, deps: createConsoleDeps });
}
