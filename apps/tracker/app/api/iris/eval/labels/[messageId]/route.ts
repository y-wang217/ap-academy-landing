import { realEvalAdminDeps } from "@/lib/iris/deps";
import { handleEvalLabel } from "@/lib/iris/eval-handlers";

export const dynamic = "force-dynamic";

/** Save the owner's gold labels for one imported message (REQ-45 AC5). Owner only; the proxy origin-checks it first (ADR 0042). */
export async function PUT(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const body = await request.json().catch(() => null);
  return handleEvalLabel(realEvalAdminDeps(), (await params).messageId, body);
}
