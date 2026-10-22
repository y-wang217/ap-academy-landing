import { realEvalAdminDeps } from "@/lib/iris/deps";
import { handleEvalImport } from "@/lib/iris/eval-handlers";

export const dynamic = "force-dynamic";

/** Request a history import (REQ-45 AC4): the next poll runs read a year of family mail into the eval set. Owner only; the proxy origin-checks it first (ADR 0042). */
export async function POST() {
  return handleEvalImport(realEvalAdminDeps());
}
