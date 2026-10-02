import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config.ts";
import type { Database } from "./types.ts";

let cached: SupabaseClient<Database> | null = null;

/**
 * Browser client for Client Components. Cookies are host-only (no `domain`
 * option, ever): every app is served from one origin, so the session is shared
 * without it. Returns null when Supabase isn't configured.
 */
export function getBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  cached ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
