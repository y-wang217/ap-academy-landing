import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleDailyTaskCreate, handleDailyTaskStatus } from "@/lib/scheduler/daily-task-handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleDailyTaskStatus(realScheduleDeps(), new URL(request.url).searchParams);
}

export async function POST(request: Request) {
  return handleDailyTaskCreate(realScheduleDeps(), await request.json().catch(() => null));
}
