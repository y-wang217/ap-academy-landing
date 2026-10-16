import { withServerTiming } from "@/lib/server-timing";
import { realDeps } from "@/lib/scheduler/deps";
import { handleStaffList } from "@/lib/scheduler/handlers";

export const dynamic = "force-dynamic";

export const GET = withServerTiming(async () => {
  return handleStaffList(realDeps());
});
