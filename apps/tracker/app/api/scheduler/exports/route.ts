import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleExportsList } from "@/lib/scheduler/exports-handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleExportsList(realScheduleDeps());
}
