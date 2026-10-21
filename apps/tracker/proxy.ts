import { redirectKeepingCookies, updateSession } from "@ap-academy/db/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "./lib/config";
import { ORIGIN_CHECKED_PREFIXES, allowedSiteHosts, isCrossSiteWrite } from "./lib/cross-site";
import { loginRedirectFor } from "./lib/login-redirect";

const SITE_HOSTS = allowedSiteHosts(SITE_URL);

/**
 * Next 16's proxy (formerly middleware). Refreshes the shared Supabase session
 * and keeps signed-out users out. The tracker never renders a login page: it
 * sends people to landing's /login. When Supabase isn't configured, requests
 * pass through and the page explains. Scheduler and Iris API writes are
 * origin-checked first, before the session is touched (tracker ADR 0042).
 */
export async function proxy(request: NextRequest) {
  if (
    ORIGIN_CHECKED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p)) &&
    isCrossSiteWrite({
      method: request.method,
      secFetchSite: request.headers.get("sec-fetch-site"),
      origin: request.headers.get("origin"),
      allowedHosts: SITE_HOSTS,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const { response, user, configured } = await updateSession(request);
  if (!configured || user) return response;
  return redirectKeepingCookies(request, response, loginRedirectFor(request.nextUrl));
}

export const config = {
  // Relative to basePath. "/" is listed on its own because the second pattern
  // compiles to /tracker/<something> and misses the bare /tracker. Static
  // assets don't need a session. The two scheduled-run endpoints are the only
  // API paths with no session: each authenticates itself with a bearer secret
  // (daily-task/run, REQ-8, tracker ADR 0039; iris/run, REQ-42, tracker ADR
  // 0057). The `$` keeps api/iris/run-now inside the matcher, and every other
  // path still redirects when signed out.
  //
  // Prefetches skip the proxy. Next 16 prefetches every link in view, and on
  // Vercel a dynamic page's segment prefetch 404s anyway, so each one cost a
  // Supabase /user call for nothing (about 90 in a minute of using the setup
  // wizard). The real navigation still runs the proxy, and every page checks
  // the viewer itself, so a skipped prefetch neither refreshes nor grants a
  // session. Literal, not a shared constant: the config must be static.
  // Scheduler and Iris API writes are origin-checked in proxy() (ADR 0042).
  matcher: [
    {
      source: "/",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/((?!_next/static|_next/image|favicon.ico|api/scheduler/daily-task/run$|api/iris/run$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
