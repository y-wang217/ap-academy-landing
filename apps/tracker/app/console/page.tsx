import { SessionExpired } from "@/components/console/session-expired";
import { ConsoleBridge } from "@/components/console/shell/bridge";
import { loadConsolePanels } from "@/lib/console/facade";
import { parseMode } from "@/lib/console/modes";
import { placeholderPanels } from "@/lib/console/panel-slots";
import type { PanelView } from "@/lib/console/panel-view";
import { createConsoleDeps } from "@/lib/console/providers";
import { buildSalesView, type SalesView } from "@/lib/console/sales-view";
import { ownerViewer } from "@/lib/pages";

// Per-user page: never prerender.
export const dynamic = "force-dynamic";

/**
 * The founder console (REQ-53 gate, REQ-55 bridge). Owner only, checked again
 * here. One facade load per request; REQ-57 fills the Sales next and radar
 * slots from it. Every slot no card has wired is "Not connected yet".
 */
export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  const gate = await ownerViewer();
  if (gate.kind === "expired") return <SessionExpired />;
  const mode = parseMode((await searchParams).mode);
  const now = new Date();
  const panels = placeholderPanels(now);
  // The facade never throws; a throw while building the view gives both slots "Read failed".
  const facade = await loadConsolePanels(createConsoleDeps(gate.viewer, () => now));
  let sales: SalesView;
  try {
    sales = buildSalesView(facade, now);
  } catch {
    const failed = <T,>(panel: string): PanelView<T> => ({
      panel, status: "error", data: null, count: null, lastCheckedAt: now.toISOString(), lastSuccessfulFetchAt: null, staleReason: null, errorMessage: "Read failed", sourceEvidence: [],
    });
    sales = { queue: failed("next"), radar: failed("radar") };
  }
  panels.sales.next = sales.queue;
  panels.sales.radar = sales.radar;
  return <ConsoleBridge mode={mode} panels={panels} sales={sales} email={gate.viewer.email} now={now} />;
}
