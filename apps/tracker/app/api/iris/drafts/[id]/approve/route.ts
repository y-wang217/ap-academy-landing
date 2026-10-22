import { realIrisAdminDeps } from "@/lib/iris/deps";
import { handleApproveDraft } from "@/lib/iris/handlers";

export const dynamic = "force-dynamic";

/** Approve the latest proposed version of a draft (REQ-44 AC8): marks it approved, Charlie copies it; nothing is sent. Owner only; the proxy origin-checks it first (ADR 0042). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  return handleApproveDraft(realIrisAdminDeps(), (await params).id, body);
}
