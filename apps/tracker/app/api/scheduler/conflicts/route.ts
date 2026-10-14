import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleConflicts } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleConflicts(realScheduleDeps(), new URL(request.url).searchParams);
}
