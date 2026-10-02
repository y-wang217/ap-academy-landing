import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config.ts";
import type { Database } from "./types.ts";

export type SessionResult = {
  /** Pass this on (or copy its cookies) so a refreshed session reaches the browser. */
  response: NextResponse;
  user: User | null;
  configured: boolean;
};

/**
 * Refreshes the Supabase session cookie for one request. Every app calls this
 * from its own middleware. No-ops when Supabase isn't configured.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return { response, user: null, configured: false };

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touching the user is what triggers the refresh; don't remove it.
  const { data } = await supabase.auth.getUser();
  return { response, user: data.user, configured: true };
}

/**
 * A redirect that keeps any refreshed session cookies. `location` is a path.
 *
 * Behind the landing proxy, `request.url` carries this app's own vercel.app
 * host, so the browser must receive a relative Location. Next's proxy rejects a
 * relative Location outright, but it rewrites any same-host absolute Location
 * to a relative one. So the path is resolved against the request's own origin
 * here, and leaves Next as just the path.
 */
export function redirectKeepingCookies(
  request: NextRequest,
  from: NextResponse,
  location: string,
): NextResponse {
  const absolute = new URL(location, request.url).toString();
  const redirect = new NextResponse(null, { status: 307, headers: { Location: absolute } });
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
