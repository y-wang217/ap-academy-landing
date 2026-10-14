import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleCreateClass } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreateClass(realScheduleDeps(), await request.json().catch(() => null));
}
