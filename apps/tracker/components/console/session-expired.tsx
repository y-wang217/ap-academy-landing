import { loginRedirectFor } from "../../lib/login-redirect";
import { Page, linkClass } from "../ui";

/**
 * Shown when the console renders with no session (REQ-53 AC9): a prefetch
 * skipped the proxy, or the session ended mid-request. Plain <a>: /login
 * belongs to landing, and redirect() would prepend the /tracker basePath.
 */
export function SessionExpired() {
  return (
    <Page title="Student Tracker">
      <p className="text-sm">Your session has ended.</p>
      <p className="text-sm">
        <a href={loginRedirectFor({ basePath: "/tracker", pathname: "/console", search: "" })} className={linkClass}>
          Sign in again
        </a>
      </p>
    </Page>
  );
}
