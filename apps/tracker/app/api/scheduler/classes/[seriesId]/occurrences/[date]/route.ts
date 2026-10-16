import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleCancelOccurrence, handleEditOccurrence } from "@/lib/scheduler/schedule-handlers";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ seriesId: string; date: string }> };

export const PATCH = withServerTiming(async (request: Request, { params }: Ctx) => {
  const { seriesId, date } = await params;
  return handleEditOccurrence(realScheduleDeps(), seriesId, date, await request.json().catch(() => null));
});

export const DELETE = withServerTiming(async (request: Request, { params }: Ctx) => {
  const { seriesId, date } = await params;
  return handleCancelOccurrence(realScheduleDeps(), seriesId, date, await request.json().catch(() => null));
});
