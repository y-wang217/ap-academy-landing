import { getServerClient } from "@ap-academy/db/server";
import { timedFetch } from "@/lib/server-timing";

/** The signed-in user's client, scoped to the tracker schema. RLS decides. */
export async function getDb() {
  const supabase = await getServerClient({ fetch: timedFetch });
  if (!supabase) return null;
  return { supabase, tracker: supabase.schema("tracker") };
}
export type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
