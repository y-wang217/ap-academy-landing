import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleCancelOccurrence, handleEditOccurrence } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ seriesId: string; date: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { seriesId, date } = await params;
  return handleEditOccurrence(realScheduleDeps(), seriesId, date, await request.json().catch(() => null));
}

export async function DELETE(request: Request, { params }: Ctx) {
  const { seriesId, date } = await params;
  return handleCancelOccurrence(realScheduleDeps(), seriesId, date, await request.json().catch(() => null));
}
