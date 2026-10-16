import { withServerTiming } from "@/lib/server-timing";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleOccurrences } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export const GET = withServerTiming(async (request: Request) => {
  return handleOccurrences(realScheduleDeps(), new URL(request.url).searchParams);
});
