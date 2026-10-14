import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleDeleteWindow, handlePatchWindow } from "@/lib/scheduler/schedule-handlers";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePatchWindow(realScheduleDeps(), id, await request.json().catch(() => null));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleDeleteWindow(realScheduleDeps(), id);
}
