import { SessionExpired } from "@/components/console/session-expired";
import { TopBar } from "@/components/top-bar";
import { Notice, Page } from "@/components/ui";
import { ownerViewer } from "@/lib/pages";

// Per-user page: never prerender.
export const dynamic = "force-dynamic";

/** The founder console shell (REQ-53). Owner only, checked again here; no data beyond the gate. Panels come in later Console cards. */
export default async function ConsolePage() {
  const gate = await ownerViewer();
  if (gate.kind === "expired") return <SessionExpired />;
  return (
    <div data-console>
      <TopBar email={gate.viewer.email} />
      <Page title="Console">
        <Notice>The console is ready. Panels arrive in the next updates.</Notice>
      </Page>
    </div>
  );
}
