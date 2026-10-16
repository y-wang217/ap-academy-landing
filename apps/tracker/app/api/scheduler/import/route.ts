import { withServerTiming } from "@/lib/server-timing";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleImportPreview, handleImportRun } from "@/lib/scheduler/import-handlers";

export const dynamic = "force-dynamic";

export const GET = withServerTiming(async () => {
  return handleImportPreview(realScheduleDeps());
});

export async function POST(request: Request) {
  return handleImportRun(realScheduleDeps(), await request.json().catch(() => ({})));
}
