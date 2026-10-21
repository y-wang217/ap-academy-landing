import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config.ts";
import type { Database } from "./types.ts";

/**
 * A client that uses the Supabase service role key, which BYPASSES RLS. It
 * exists for two scheduled-run routes in the tracker (daily-task/run, REQ-8,
 * tracker ADR 0039; iris/run, REQ-42, tracker ADR 0057), each of which
 * authenticates itself with a bearer secret and works on one org's rows.
 * Never import it from anything a browser can reach, and never from a route
 * that acts for a signed-in user; the tracker has a source-scan test that
 * allows exactly two importers (REQ-8, REQ-42). Returns null when the key or
 * URL is missing.
 * Reads the key at call time so it is never captured at build.
 */
export function getServiceClient(): SupabaseClient<Database> | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !SUPABASE_URL) return null;
  return createClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
