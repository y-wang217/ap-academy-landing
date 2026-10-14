import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleDeleteAvailabilityException } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleDeleteAvailabilityException(realScheduleDeps(), id);
}
