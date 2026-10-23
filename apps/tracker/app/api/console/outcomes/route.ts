import { handleConsoleOutcome } from "@/lib/console/handlers";
import { createOutcomeStore } from "@/lib/console/outcome-store";
import { getViewer } from "@/lib/data/queries";
import { readConsoleWriteConfig } from "@/lib/notion/config";
import { createLeadWriter } from "@/lib/notion/lead-writer";

export const dynamic = "force-dynamic";

/**
 * Owner only (REQ-61, tracker ADR 0076): log one call outcome. POST only,
 * behind the proxy's cross-site check and the console owner gate. Writes one
 * Touch and the allowed Students & Parents fields in Notion, through the
 * transition log on the owner's own client.
 */
export async function POST(request: Request) {
  return handleConsoleOutcome({
    viewer: getViewer,
    request,
    deps: (viewer) => {
      const config = readConsoleWriteConfig();
      if (!config) return null;
      return { store: createOutcomeStore(viewer.db.tracker, viewer.orgId), writer: createLeadWriter(config) };
    },
  });
}
