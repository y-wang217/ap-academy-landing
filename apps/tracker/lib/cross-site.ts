/** Pure decision for the scheduler, Iris and console API origin check (tracker ADR 0042). Imports nothing from Next, React or Supabase. */
export const UNSAFE_METHODS = ["POST", "PATCH", "PUT", "DELETE"] as const;

/** The API prefixes whose writes the proxy origin-checks before the session is read (ADR 0042, REQ-42, REQ-53 ADR 0062). */
export const ORIGIN_CHECKED_PREFIXES = ["/api/scheduler/", "/api/iris/", "/api/console/"] as const;

/** The site host plus its `www.`-less form: the same list `next.config.ts` gives `allowedOrigins`. */
export function allowedSiteHosts(siteUrl: string): string[] {
  const host = new URL(siteUrl).host.toLowerCase();
  return [...new Set([host, host.replace(/^www\./, "")])];
}

/** True when a state-changing request comes from another site. Host includes the port; the scheme is not compared. */
export function isCrossSiteWrite(input: {
  method: string;
  secFetchSite: string | null;
  origin: string | null;
  allowedHosts: readonly string[];
}): boolean {
  if (!(UNSAFE_METHODS as readonly string[]).includes(input.method.toUpperCase())) return false;
  if (input.secFetchSite === "cross-site") return true;
  if (input.origin === null) return false;
  try {
    return !input.allowedHosts.includes(new URL(input.origin).host.toLowerCase());
  } catch {
    return true;
  }
}
