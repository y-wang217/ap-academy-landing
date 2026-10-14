import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config.ts";
import type { Database } from "./types.ts";

/**
 * A client that uses the Supabase service role key, which BYPASSES RLS. It
 * exists for one scheduled-run route in the tracker (REQ-8, tracker ADR 0039),
 * which authenticates itself with a bearer secret and reads one org's rows.
 * Never import it from anything a browser can reach, and never from a route
 * that acts for a signed-in user; the tracker has a source-scan test that
 * allows exactly one importer. Returns null when the key or URL is missing.
 * Reads the key at call time so it is never captured at build.
 */
export function getServiceClient(): SupabaseClient<Database> | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !SUPABASE_URL) return null;
  return createClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
