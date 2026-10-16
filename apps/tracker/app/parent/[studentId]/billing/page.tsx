import { ParentBilling } from "@/components/parent-billing";
import { Card, Empty, Notice } from "@/components/ui";
import { loadChildBilling } from "@/lib/data/parent-billing";
import { getBillingReader } from "@/lib/notion/cached";
import { parentChild } from "@/lib/pages";
import { todayIso } from "@/lib/time";

export const dynamic = "force-dynamic";

/** The child's invoices, credits and rate, read-only from Notion (REQ-25, ADR 0049). */
export default async function ParentBillingPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { viewer, child } = await parentChild(studentId);
  // The layout already shows "Not ready yet"; no billing read runs for an unpublished child.
  if (!child.published) return null;

  const data = await loadChildBilling(viewer, child, { reader: getBillingReader() }, todayIso());
  if (data.kind === "not_available") {
    return (
      <Card>
        <Empty>Billing not available yet</Empty>
      </Card>
    );
  }
  if (data.kind === "error") {
    return (
      <Card>
        <Notice tone="error">Could not load billing. Try again later.</Notice>
      </Card>
    );
  }
  return <ParentBilling view={data.view} />;
}
