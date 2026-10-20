import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleLinkLesson } from "@/lib/scheduler/lesson-handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleLinkLesson(realScheduleDeps(), await request.json().catch(() => null));
}
