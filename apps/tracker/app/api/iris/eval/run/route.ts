import { realEvalAdminDeps } from "@/lib/iris/deps";
import { handleEvalRun } from "@/lib/iris/eval-handlers";

export const dynamic = "force-dynamic";

/** Request an eval run (REQ-45 AC6), stamped with the current policy version and model. Owner only; the proxy origin-checks it first (ADR 0042). */
export async function POST() {
  return handleEvalRun(realEvalAdminDeps());
}
