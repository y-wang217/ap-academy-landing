import { realIrisAdminDeps } from "@/lib/iris/deps";
import { handleEditDraft } from "@/lib/iris/handlers";

export const dynamic = "force-dynamic";

/** Save Charlie's edit as the next version of a draft (REQ-44 AC9). Owner only; the proxy origin-checks it first (ADR 0042). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  return handleEditDraft(realIrisAdminDeps(), (await params).id, body);
}
