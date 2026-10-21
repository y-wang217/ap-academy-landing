import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleLogClass } from "@/lib/scheduler/lesson-handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleLogClass(realScheduleDeps(), await request.json().catch(() => null));
}
