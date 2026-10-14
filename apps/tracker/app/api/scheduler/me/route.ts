import { realDeps } from "@/lib/scheduler/deps";
import { handleMe } from "@/lib/scheduler/handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleMe(realDeps());
}
