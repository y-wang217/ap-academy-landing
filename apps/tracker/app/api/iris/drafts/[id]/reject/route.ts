import { realIrisAdminDeps } from "@/lib/iris/deps";
import { handleRejectDraft } from "@/lib/iris/handlers";

export const dynamic = "force-dynamic";

/** Reject a draft with a reason (REQ-44 AC10): the message goes back to Needs you. Owner only; the proxy origin-checks it first (ADR 0042). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  return handleRejectDraft(realIrisAdminDeps(), (await params).id, body);
}
