import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleCreateClass } from "@/lib/scheduler/schedule-handlers";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

export const POST = withServerTiming(async (request: Request) =>
  handleCreateClass(realScheduleDeps(), await request.json().catch(() => null)));
