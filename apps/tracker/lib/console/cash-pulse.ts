import { invoiceStatus } from "../domain/billing";
import { localDateOf } from "../time";
import type { InvoiceRow } from "./contracts";
import type { FunnelWindow } from "./trial-funnel";

/**
 * The cash pulse (REQ-59, tracker ADR 0073). Pure, integer cents. Only Paid rows are
 * collected; Sent rows are outstanding, split into due and overdue by invoiceStatus(); Draft
 * and Void are counts only; any other status is listed as not recognised. A row with no amount
 * or no date is listed, never summed and never treated as 0.
 */
export type InvoiceRef = { id: string; href: string; studentName: string | null; month: string | null; date: string | null; cents: number | null; label: string | null };
export type MoneyLine = { cents: number; rows: InvoiceRef[]; missingAmount: InvoiceRef[] };
export type CashPulse = {
  window: FunnelWindow;
  collected: MoneyLine & { byIssued: number; undated: InvoiceRef[] };
  outstandingDue: MoneyLine;
  outstandingOverdue: MoneyLine;
  drafts: InvoiceRef[];
  voids: InvoiceRef[];
  unrecognised: InvoiceRef[];
  creditsAppliedCents: number;
};

export const toCents = (amount: number) => Math.round(amount * 100);

const line = (): MoneyLine => ({ cents: 0, rows: [], missingAmount: [] });

export function cashPulse(input: { window: FunnelWindow; today: string; invoices: InvoiceRow[] }): CashPulse {
  const { window } = input;
  const inWindow = (d: string | null) => d !== null && d >= window.from && d <= window.to;
  const out: CashPulse = {
    window,
    collected: { ...line(), byIssued: 0, undated: [] },
    outstandingDue: line(),
    outstandingOverdue: line(),
    drafts: [], voids: [], unrecognised: [],
    creditsAppliedCents: 0,
  };
  const ref = (r: InvoiceRow, date: string | null, label: string | null = null): InvoiceRef => ({
    id: r.id, href: r.pageUrl, studentName: r.studentName, month: r.month, date, cents: r.amount === null ? null : toCents(r.amount), label,
  });
  const add = (target: MoneyLine, r: InvoiceRow, item: InvoiceRef) => {
    if (r.amount === null) target.missingAmount.push({ ...item, label: "amount missing" });
    else {
      target.cents += toCents(r.amount);
      target.rows.push(item);
    }
  };
  const credit = (r: InvoiceRow) => (r.creditApplied === null ? 0 : toCents(r.creditApplied));

  for (const r of input.invoices) {
    const issued = localDateOf(r.issued);
    switch (r.status) {
      case "Paid": {
        const paidOn = localDateOf(r.paidOn);
        const date = paidOn ?? issued;
        if (date === null) {
          out.collected.undated.push(ref(r, null, "no date"));
          break;
        }
        if (!inWindow(date)) break;
        const byIssued = paidOn === null;
        add(out.collected, r, ref(r, date, byIssued ? "paid date not recorded" : null));
        if (r.amount !== null) {
          if (byIssued) out.collected.byIssued += 1;
          out.creditsAppliedCents += credit(r);
        }
        break;
      }
      case "Sent": {
        const overdue = invoiceStatus({ status: "Sent", due: r.due }, input.today) === "Overdue";
        add(overdue ? out.outstandingOverdue : out.outstandingDue, r, ref(r, localDateOf(r.due), overdue ? "overdue" : null));
        if (inWindow(issued)) out.creditsAppliedCents += credit(r);
        break;
      }
      case "Draft":
        out.drafts.push(ref(r, issued));
        break;
      case "Void":
        if (issued === null || inWindow(issued)) out.voids.push(ref(r, issued));
        break;
      default:
        out.unrecognised.push(ref(r, issued, r.status ? `Status ${r.status}` : "no status"));
    }
  }
  return out;
}
