import { realDeps } from "@/lib/scheduler/deps";
import { handleStaffById } from "@/lib/scheduler/handlers";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  return handleStaffById(realDeps(), staffId);
}
