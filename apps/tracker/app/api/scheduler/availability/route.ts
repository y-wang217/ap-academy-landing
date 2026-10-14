import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleAvailability } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAvailability(realScheduleDeps(), new URL(request.url).searchParams);
}
