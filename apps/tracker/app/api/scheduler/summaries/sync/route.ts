import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleSyncSummaries } from "@/lib/scheduler/import-handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleSyncSummaries(realScheduleDeps(), await request.json().catch(() => ({})));
}
