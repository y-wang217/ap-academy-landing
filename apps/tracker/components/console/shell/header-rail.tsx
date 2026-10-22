import SignOutButton from "../../../app/sign-out-button";
import { BridgeClock } from "./bridge-clock";
import { ModeTabs } from "./mode-tabs";
import { SyncLine } from "./sync-line";

/** The header rail (REQ-55, VISUAL_DIRECTION B): brand, mode switch, clock, sync line, home and sign out. */
export function HeaderRail({ email, now }: { email?: string; now: Date }) {
  return (
    <header className="console-header">
      <p className="console-brand">
        <span>AP ACADEMY // FOUNDER CONSOLE</span>
        <small>Command bridge</small>
      </p>
      <ModeTabs />
      <div className="console-status">
        <BridgeClock initialIso={now.toISOString()} />
        <SyncLine />
      </div>
      <nav className="console-exit" aria-label="Leave the console">
        {email && <span className="console-email">{email}</span>}
        {/* Plain <a>: a full load of the tracker home, outside the console's styles. */}
        <a href="/tracker">Tracker home</a>
        <SignOutButton />
      </nav>
    </header>
  );
}
