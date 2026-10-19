import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleClearOutcome, handleNoShow } from "@/lib/scheduler/lesson-handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleNoShow(realScheduleDeps(), await request.json().catch(() => null));
}

export async function DELETE(request: Request) {
  return handleClearOutcome(realScheduleDeps(), await request.json().catch(() => null));
}
