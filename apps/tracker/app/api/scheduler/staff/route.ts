import { realDeps } from "@/lib/scheduler/deps";
import { handleStaffList } from "@/lib/scheduler/handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleStaffList(realDeps());
}
