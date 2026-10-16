import { invoicePdfResponse, readNotionId } from "@/lib/data/parent-billing";
import { getViewer, listChildren } from "@/lib/data/queries";
import { getBillingReader } from "@/lib/notion/cached";
import { notionApiBaseOverride } from "@/lib/notion/config";

export const dynamic = "force-dynamic";

const gone = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });

/** One invoice PDF for a parent's own child, streamed through the tracker with no-store (REQ-25, AC9, AC10). */
export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string; invoiceId: string }> }) {
  const reader = getBillingReader();
  if (!reader) return gone();
  return invoicePdfResponse(await params, {
    getViewer,
    listChildren,
    readNotionId,
    fetchInvoicePdf: reader.invoicePdf,
    fetcher: fetch,
    apiBase: notionApiBaseOverride(),
  });
}
