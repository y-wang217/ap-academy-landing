import { getServerClient } from "@ap-academy/db/server";

/** The signed-in user's client, scoped to the tracker schema. RLS decides. */
export async function getDb() {
  const supabase = await getServerClient();
  if (!supabase) return null;
  return { supabase, tracker: supabase.schema("tracker") };
}
export type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
