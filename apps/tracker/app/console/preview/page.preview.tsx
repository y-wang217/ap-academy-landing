import { notFound } from "next/navigation";
import { ConsoleBridge } from "../../../components/console/shell/bridge";
import { parseMode } from "../../../lib/console/modes";
import { previewEnabled } from "../../../lib/console/preview-flag";
import { demoPanels, demoSales } from "../../../test/console/demo-panels";

export const dynamic = "force-dynamic";

/**
 * The kit with test data, for screenshots and e2e (REQ-55 AC10, tracker ADR 0066).
 * A route only in a build with CONSOLE_PREVIEW=1 (pageExtensions), a 404 at
 * request time without it, and owner-gated by the console layout.
 */
export default async function ConsolePreviewPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  if (!previewEnabled(process.env)) notFound();
  const mode = parseMode((await searchParams).mode);
  const now = new Date();
  const sales = demoSales(now);
  const panels = demoPanels(now);
  panels.sales.next = sales.queue;
  panels.sales.radar = sales.radar;
  return <ConsoleBridge mode={mode} panels={panels} sales={sales} now={now} />;
}
