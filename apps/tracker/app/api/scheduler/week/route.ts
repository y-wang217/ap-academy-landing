import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleWeek } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleWeek(realScheduleDeps(), new URL(request.url).searchParams);
}
