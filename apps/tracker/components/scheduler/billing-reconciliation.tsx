import { Card, Empty, linkClass } from "@/components/ui";
import type { ChargeStateName } from "@/lib/domain/billing/charge-state";
import type { BillingOccurrence } from "@/lib/domain/billing/month-input";
import type { Difference, StudentReconciliation } from "@/lib/domain/billing/reconcile";
import { formatDayHeading } from "@/lib/view/availability-text";

/**
 * The owner's billing check (REQ-40 AC10): per student, the count the Weekly
 * Schedule text method would give next to the structured count, the charge
 * state tallies and every difference. Server-rendered; it computes nothing.
 */
export type BillingRow = {
  studentId: string;
  name: string | null;
  sync: { state: "pending" | "synced" | "failed"; stale: boolean };
  occurrences: BillingOccurrence[];
  reconciliation: StudentReconciliation;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const shortMonth = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3);
const hours = (h: number) => `${Number(h.toFixed(2))} h`;
const classes = (n: number) => `${n} ${n === 1 ? "class" : "classes"}`;

const STATE_TEXT: Record<ChargeStateName, string> = {
  chargeable: "Chargeable",
  credit_owed: "Credit owed",
  made_up: "Made up",
  forfeit_pending: "No-show, you decide",
  not_charged: "Not charged",
};
const ORDER: ChargeStateName[] = ["chargeable", "credit_owed", "made_up", "forfeit_pending", "not_charged"];

export function differenceText(d: Difference): string {
  const other = d.other ? formatDayHeading(d.other) : "";
  switch (d.reason) {
    case "cancelled": return "cancelled, in the text only";
    case "moved_out": return `moved to ${other}, in the text only`;
    case "moved_in": return `moved here from ${other}, not in the text`;
    case "one_off": return "one-off class, not in the text";
    case "before_from": return "before the class starts, in the text only";
    case "after_until": return "after the class ended, in the text only";
    case "duration_changed": return "length differs from the text";
    case "no_class": return "no class on this day, in the text only";
    case "not_in_text": return "class not in the text";
  }
}

function tallies(occ: BillingOccurrence[]): string {
  const parts: string[] = [];
  for (const state of ORDER) {
    const of = occ.filter((o) => o.chargeState === state);
    if (of.length === 0) continue;
    const unconfirmed = of.filter((o) => o.unconfirmed).length;
    parts.push(`${STATE_TEXT[state]} ${of.length}${unconfirmed ? ` (${unconfirmed} unconfirmed)` : ""}`);
  }
  return parts.join(" · ");
}

export function BillingReconciliation({ month, prev, next, rows, downloadHref }: { month: string; prev: string; next: string; rows: BillingRow[]; downloadHref: string }) {
  const agree = rows.filter((r) => !r.reconciliation.unparseable && r.reconciliation.differences.length === 0).length;
  const empty = rows.every((r) => r.occurrences.length === 0 && (r.reconciliation.text?.count ?? 0) === 0 && !r.reconciliation.unparseable);
  return (
    <>
      <nav className="flex flex-wrap items-center gap-4 text-sm" aria-label="Month">
        <a className={linkClass} href={`?month=${prev}`}>‹ {shortMonth(prev)}</a>
        <span className="font-medium">{monthLabel(month)}</span>
        <a className={linkClass} href={`?month=${next}`}>{shortMonth(next)} ›</a>
      </nav>
      <p className="text-sm" data-testid="billing-agree">Text and structured counts agree for {agree} of {rows.length} students.</p>
      <p className="text-sm"><a className={linkClass} href={downloadHref} download>Download JSON</a></p>
      {empty ? <Card><Empty>No classes this month.</Empty></Card> : rows.map((r) => {
        const rec = r.reconciliation;
        const matches = !rec.unparseable && rec.differences.length === 0;
        return (
          <Card key={r.studentId} title={r.name ?? "Student not in the people list"} action={<span className="text-sm">{matches ? "Matches" : "Differs"}</span>}>
            <div className="flex flex-col gap-1 text-sm" data-testid={`billing-${r.studentId}`}>
              {rec.unparseable ? <p>This text would stop the monthly run.</p> : (
                <p>Text: {classes(rec.text!.count)}, {hours(rec.text!.hours)} · Structured: {classes(rec.structured.count)}, {hours(rec.structured.hours)}</p>
              )}
              {r.occurrences.length > 0 && <p className="text-text-muted">{tallies(r.occurrences)}</p>}
              {rec.differences.length > 0 && (
                <ul className="list-disc pl-5">
                  {rec.differences.map((d, i) => <li key={`${d.date}${d.reason}${i}`}>{formatDayHeading(d.date)}, {d.subject}: {differenceText(d)}</li>)}
                </ul>
              )}
              {(r.sync.state !== "synced" || r.sync.stale) && <p>Weekly Schedule is out of date. Sync it first.</p>}
            </div>
          </Card>
        );
      })}
    </>
  );
}
