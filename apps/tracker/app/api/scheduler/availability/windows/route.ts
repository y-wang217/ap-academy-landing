import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleCreateWindow } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreateWindow(realScheduleDeps(), await request.json().catch(() => null));
}
