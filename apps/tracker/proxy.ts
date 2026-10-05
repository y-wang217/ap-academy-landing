import { redirectKeepingCookies, updateSession } from "@ap-academy/db/middleware";
import type { NextRequest } from "next/server";
import { loginRedirectFor } from "./lib/login-redirect";

/**
 * Next 16's proxy (formerly middleware). Refreshes the shared Supabase session
 * and keeps signed-out users out. The tracker never renders a login page: it
 * sends people to landing's /login. When Supabase isn't configured, requests
 * pass through and the page explains.
 */
export async function proxy(request: NextRequest) {
  const { response, user, configured } = await updateSession(request);
  if (!configured || user) return response;
  return redirectKeepingCookies(request, response, loginRedirectFor(request.nextUrl));
}

export const config = {
  // Relative to basePath. "/" is listed on its own because the second pattern
  // compiles to /tracker/<something> and misses the bare /tracker. Static
  // assets don't need a session.
  //
  // Prefetches skip the proxy. Next 16 prefetches every link in view, and on
  // Vercel a dynamic page's segment prefetch 404s anyway, so each one cost a
  // Supabase /user call for nothing (about 90 in a minute of using the setup
  // wizard). The real navigation still runs the proxy, and every page checks
  // the viewer itself, so a skipped prefetch neither refreshes nor grants a
  // session. Literal, not a shared constant: the config must be static.
  matcher: [
    {
      source: "/",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
