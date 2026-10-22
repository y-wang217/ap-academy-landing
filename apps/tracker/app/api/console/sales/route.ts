import { handleConsoleSales } from "@/lib/console/handlers";
import { createConsoleDeps } from "@/lib/console/providers";
import { getViewer } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

/** Owner only (REQ-57, tracker ADR 0071): the ranked Sales queue and radar. GET only, the same gate as the health route. */
export async function GET() {
  return handleConsoleSales({ viewer: getViewer, deps: createConsoleDeps });
}
