import { realEvalAdminDeps } from "@/lib/iris/deps";
import { handleEvalRecord } from "@/lib/iris/eval-handlers";

export const dynamic = "force-dynamic";

/** Record the finished eval request as one aggregate eval_runs row (REQ-45 AC8). Owner only; the proxy origin-checks it first (ADR 0042). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return handleEvalRecord(realEvalAdminDeps(), body);
}
