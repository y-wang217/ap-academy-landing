import { handleConsoleHealth } from "@/lib/console/handlers";
import { getViewer } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

/** Owner only (REQ-53, tracker ADR 0062). GET only: the proxy origin-checks any write under /api/console/ first (ADR 0042). */
export async function GET() {
  return handleConsoleHealth({ viewer: getViewer });
}
