import { notFound } from "next/navigation";
import { BillingReconciliation, type BillingRow } from "@/components/scheduler/billing-reconciliation";
import { TopBar } from "@/components/top-bar";
import { Notice, Page } from "@/components/ui";
import { reconcileMonth } from "@/lib/domain/billing/reconcile";
import { parseMonth, shiftMonth } from "@/lib/domain/schedule/month";
import { getViewer } from "@/lib/data/queries";
import { loadBillingMonth } from "@/lib/scheduler/billing-handlers";
import { realScheduleDeps } from "@/lib/scheduler/deps";
import { todayIso } from "@/lib/time";

export const dynamic = "force-dynamic";

type Search = { month?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Billing check (REQ-40 AC10), owner only: the structured month next to what
 * the Weekly Schedule text method would count. Reads only local copies; it
 * makes no Notion request and writes nothing.
 */
export default async function BillingCheckPage({ searchParams }: { searchParams: Promise<Search> }) {
  const deps = realScheduleDeps();
  const who = await deps.identity();
  if (who.scope !== "admin") notFound();
  const month = parseMonth(one((await searchParams).month), todayIso());
  const viewer = await getViewer();
  const email = viewer.kind === "signed_out" || viewer.kind === "not_configured" ? undefined : viewer.email;
  const [loaded, names] = await Promise.all([
    loadBillingMonth(deps, month).catch(() => null),
    (deps.studentNames?.() ?? Promise.resolve(new Map<string, string>())).catch(() => new Map<string, string>()),
  ]);

  let body: React.ReactNode;
  if (!loaded || !loaded.ok) {
    body = <Notice tone="error">Could not load classes. Try again.</Notice>;
  } else {
    const rows: BillingRow[] = loaded.input.students.map((s) => {
      const own = loaded.students.find((x) => x.studentId === s.studentId)!;
      return {
        studentId: s.studentId,
        name: names.get(s.studentId) ?? null,
        sync: s.sync,
        occurrences: s.occurrences,
        reconciliation: reconcileMonth({ month, text: own.text, occurrences: s.occurrences, series: own.series, exceptions: own.exceptions }),
      };
    });
    body = (
      <BillingReconciliation
        month={month} prev={shiftMonth(month, -1)} next={shiftMonth(month, 1)} rows={rows}
        downloadHref={`/tracker/api/scheduler/monthly-billing-input?month=${month}`}
      />
    );
  }
  return (
    <>
      {email && <TopBar email={email} />}
      <Page title="Billing check" back={{ href: "/scheduler/schedules", label: "Weekly schedules" }}>{body}</Page>
    </>
  );
}
