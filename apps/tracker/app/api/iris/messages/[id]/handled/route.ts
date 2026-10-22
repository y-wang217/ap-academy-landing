import { realIrisAdminDeps } from "@/lib/iris/deps";
import { handleMarkHandled } from "@/lib/iris/handlers";

export const dynamic = "force-dynamic";

/** Mark an escalated message handled. Owner only (REQ-43 AC15); the proxy origin-checks it first (ADR 0042). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleMarkHandled(realIrisAdminDeps(), (await params).id);
}
