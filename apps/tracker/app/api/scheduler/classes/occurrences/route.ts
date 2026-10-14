import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleOccurrences } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleOccurrences(realScheduleDeps(), new URL(request.url).searchParams);
}
