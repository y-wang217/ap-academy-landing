import { withServerTiming } from "@/lib/server-timing";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleWeek } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export const GET = withServerTiming(async (request: Request) => {
  return handleWeek(realScheduleDeps(), new URL(request.url).searchParams);
});
