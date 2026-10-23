import { realIrisAdminDeps } from "@/lib/iris/deps";
import { handleRetrySend } from "@/lib/iris/handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Retry a failed send (REQ-48 AC6): Gmail is searched first, so a reply that went out earlier is recorded, not sent twice. Owner only; the proxy origin-checks it first (ADR 0042). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRetrySend(realIrisAdminDeps(), (await params).id);
}
