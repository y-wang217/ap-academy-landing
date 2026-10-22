import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleDriftSeen } from "@/lib/scheduler/import-handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleDriftSeen(realScheduleDeps(), await request.json().catch(() => null));
}
