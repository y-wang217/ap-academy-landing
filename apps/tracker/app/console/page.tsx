import { SessionExpired } from "@/components/console/session-expired";
import { ConsoleBridge } from "@/components/console/shell/bridge";
import { parseMode } from "@/lib/console/modes";
import { placeholderPanels } from "@/lib/console/panel-slots";
import { ownerViewer } from "@/lib/pages";

// Per-user page: never prerender.
export const dynamic = "force-dynamic";

/**
 * The founder console (REQ-53 gate, REQ-55 bridge). Owner only, checked again
 * here. No data is wired yet: every panel is "Not connected yet" until the
 * later Console cards fill their slots.
 */
export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  const gate = await ownerViewer();
  if (gate.kind === "expired") return <SessionExpired />;
  const mode = parseMode((await searchParams).mode);
  const now = new Date();
  return <ConsoleBridge mode={mode} panels={placeholderPanels(now)} email={gate.viewer.email} now={now} />;
}
