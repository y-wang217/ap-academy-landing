/**
 * Supabase is optional at build and run time. Until the environment variables
 * are set, /sat degrades to its Phase 1 behaviour: flashcards and quiz still
 * work anonymously, and sign-in reports that it isn't available yet. Nothing
 * here may throw when the variables are missing — the main site builds and
 * deploys from the same project.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}
