import { TRACKER_URL } from "@/lib/config";
import { handleRunNow } from "@/lib/iris/handlers";
import { realScheduleDeps } from "@/lib/scheduler/deps";

export const dynamic = "force-dynamic";
export const maxDuration = 80;

/** One Iris run now, for the owner. Calls the bearer run route server-side (REQ-42, Decision 6). */
export async function POST() {
  return handleRunNow({ identity: realScheduleDeps().identity, secret: process.env.IRIS_CRON_SECRET, runUrl: `${TRACKER_URL}/api/iris/run` });
}
