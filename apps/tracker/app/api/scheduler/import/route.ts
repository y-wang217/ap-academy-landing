import { realScheduleDeps } from "@/lib/scheduler/deps";
import { handleImportPreview, handleImportRun } from "@/lib/scheduler/import-handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleImportPreview(realScheduleDeps());
}

export async function POST(request: Request) {
  return handleImportRun(realScheduleDeps(), await request.json().catch(() => ({})));
}
