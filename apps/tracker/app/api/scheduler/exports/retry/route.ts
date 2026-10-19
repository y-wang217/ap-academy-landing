import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleExportsRetry } from "@/lib/scheduler/exports-handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleExportsRetry(realScheduleDeps(), await request.json().catch(() => null));
}
