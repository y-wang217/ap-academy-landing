import { withServerTiming } from "@/lib/server-timing";
import { realDeps } from "@/lib/scheduler/deps";
import { handleMe } from "@/lib/scheduler/handlers";

export const dynamic = "force-dynamic";

export const GET = withServerTiming(async () => {
  return handleMe(realDeps());
});
