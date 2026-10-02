import { loginPath } from "@ap-academy/db/paths";

type RequestPath = { basePath: string; pathname: string; search: string };

/**
 * Where a signed-out request goes: the root-level /login (landing), carrying
 * the full public path to return to, basePath included. Relative, because
 * behind the landing proxy the request's own host is the tracker's vercel.app
 * URL.
 */
export function loginRedirectFor({ basePath, pathname, search }: RequestPath): string {
  const path = pathname === "/" ? basePath || "/" : `${basePath}${pathname}`;
  return loginPath(`${path}${search}`);
}
