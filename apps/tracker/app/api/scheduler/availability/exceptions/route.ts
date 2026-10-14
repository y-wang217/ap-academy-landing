import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleCreateAvailabilityException } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreateAvailabilityException(realScheduleDeps(), await request.json().catch(() => null));
}
