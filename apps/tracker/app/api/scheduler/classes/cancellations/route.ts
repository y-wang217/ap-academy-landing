import { withServerTiming } from "@/lib/server-timing";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleStudentCancellations } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export const GET = withServerTiming(async (request: Request) => {
  return handleStudentCancellations(realScheduleDeps(), new URL(request.url).searchParams);
});
