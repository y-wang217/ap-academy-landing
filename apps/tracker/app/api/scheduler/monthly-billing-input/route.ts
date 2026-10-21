import { withServerTiming } from "@/lib/server-timing";
import { handleMonthlyBillingInput } from "@/lib/scheduler/billing-handlers";
import { realScheduleDeps } from "@/lib/scheduler/deps";

export const dynamic = "force-dynamic";

export const GET = withServerTiming(async (request: Request) => {
  return handleMonthlyBillingInput(realScheduleDeps(), new URL(request.url).searchParams);
});
