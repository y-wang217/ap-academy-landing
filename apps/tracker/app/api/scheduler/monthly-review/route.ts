import { withServerTiming } from "@/lib/server-timing";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleMonthlyReview } from "@/lib/scheduler/import-handlers";

export const dynamic = "force-dynamic";

export const GET = withServerTiming(async (request: Request) => {
  return handleMonthlyReview(realScheduleDeps(), new URL(request.url).searchParams);
});
