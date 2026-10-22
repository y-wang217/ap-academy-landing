import { realEvalAdminDeps } from "@/lib/iris/deps";
import { handleEvalRating } from "@/lib/iris/eval-handlers";

export const dynamic = "force-dynamic";

/** Rate the eval draft of one message, 1 to 5 (REQ-45 AC7). Owner only; the proxy origin-checks it first (ADR 0042). */
export async function PUT(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const body = await request.json().catch(() => null);
  return handleEvalRating(realEvalAdminDeps(), (await params).messageId, body);
}
