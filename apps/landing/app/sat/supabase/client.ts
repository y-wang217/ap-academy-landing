"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import type { Database } from "./types";

let cached: SupabaseClient<Database> | null = null;

/** Returns null when Supabase isn't configured, so callers stay anonymous. */
export function getBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  cached ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
