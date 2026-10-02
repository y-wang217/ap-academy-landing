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
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
