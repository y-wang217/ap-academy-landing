import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleMonthlyReview } from "@/lib/scheduler/import-handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleMonthlyReview(realScheduleDeps(), new URL(request.url).searchParams);
}
