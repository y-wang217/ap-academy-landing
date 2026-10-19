import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleUnlinked } from "@/lib/scheduler/lesson-handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleUnlinked(realScheduleDeps(), new URL(request.url).searchParams);
}
