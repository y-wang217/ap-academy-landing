import { realIrisAdminDeps } from "@/lib/iris/deps";
import { handleApproveDraft } from "@/lib/iris/handlers";

export const dynamic = "force-dynamic";
// One approval write and at most two Gmail calls of 10 seconds each.
export const maxDuration = 30;

/** Approve the latest proposed version of a draft and send it from the mailbox, once (REQ-48). Owner only; the proxy origin-checks it first (ADR 0042). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  return handleApproveDraft(realIrisAdminDeps(), (await params).id, body);
}
