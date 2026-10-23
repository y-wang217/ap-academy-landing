import { handleConsoleSignals } from "@/lib/console/handlers";
import { createConsoleDeps, createSignalSources } from "@/lib/console/providers";
import { getViewer } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

/** Owner only (REQ-62, tracker ADR 0077): fresh leads, exceptions, provider health and teaching time. GET only, the same gate as the health route. */
export async function GET() {
  return handleConsoleSignals({ viewer: getViewer, deps: createConsoleDeps, sources: createSignalSources });
}
