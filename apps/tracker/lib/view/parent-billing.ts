import {
  creditAmount, creditsOnInvoice, invoiceStatus, openTotal, sharedWith, splitInvoices,
  type Credit, type CreditStatus, type Invoice, type InvoicePill, type Sibling,
} from "../domain/billing";
import { studentName } from "../format";

/**
 * The parent Billing tab's view model (REQ-25). Pure, serialisable and already
 * formatted. Rows carry a pdfHref to the tracker's own proxy route, never a
 * Notion file link.
 */
export type BillingData = {
  childId: string;
  header: { firstName: string; lastInitial: string; gradeLevel: number | null };
  profile: { rate: number | null; cadence: string | null; family: string };
  invoices: Invoice[];
  credits: Credit[];
  /** Invoice number to the siblings on another row with that number. */
  sharers: Record<string, Sibling[]>;
};

export type Pill = { state: string; label: string };
export type BillingCard = {
  title: string;
  amount: string;
  issued: string;
  due: string;
  pill: Pill;
  shared: string | null;
  credit: { total: string; lines: string[] } | null;
  pdfHref: string | null;
};
export type CreditRow = { key: string; date: string; course: string; hours: string; amount: string | null; pill: Pill };
export type PastRow = { key: string; month: string; amount: string; pill: Pill; shared: string | null; pdfHref: string | null };
export type BillingView = {
  header: { name: string; grade: string | null };
  card: BillingCard | null;
  credits: CreditRow[];
  openTotal: string;
  hasOpen: boolean;
  past: PastRow[];
  rateLine: string | null;
};

const dollars = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const withCents = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$420", "$62.50", or "-$60" for a credit. */
export function money(n: number, credit = false): string {
  const abs = Math.abs(n);
  const text = Number.isInteger(Math.round(abs * 100) / 100) ? dollars.format(abs) : withCents.format(abs);
  return `${credit ? "-" : ""}$${text}`;
}

const at = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" });
const dayText = (iso: string | null) => (iso ? fmt({ month: "short", day: "numeric" }).format(at(iso)) : "Not set");
const validMonth = (ym: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
const monthLong = (ym: string) => (validMonth(ym) ? fmt({ month: "long" }).format(at(`${ym}-15`)) : "This month's");
const monthShort = (ym: string) => (validMonth(ym) ? fmt({ month: "short", year: "numeric" }).format(at(`${ym}-15`)) : "No month");

const INVOICE_PILL: Record<InvoicePill, string> = { Paid: "paid", Due: "due", Overdue: "overdue" };
const CREDIT_PILL: Record<CreditStatus, string> = { Open: "open", Applied: "applied", "Made up": "made-up", Forfeited: "forfeited" };

const pdfHref = (childId: string, invoice: Invoice) =>
  invoice.hasPdf ? `/tracker/parent/${childId}/billing/invoices/${invoice.id}` : null;
const amountText = (n: number | null) => (n === null ? "Not set" : money(n));

export function buildBillingView(data: BillingData, today: string): BillingView {
  const { current, past } = splitInvoices(data.invoices, today.slice(0, 7));
  const pill = (i: Invoice): Pill => {
    const label = invoiceStatus(i, today);
    return { state: INVOICE_PILL[label], label };
  };
  const shared = (i: Invoice) => {
    const name = sharedWith(i, data.sharers, data.profile.family);
    return name ? `Shared invoice with ${name}` : null;
  };

  let card: BillingCard | null = null;
  if (current) {
    const netted = creditsOnInvoice(current, data.credits);
    card = {
      title: `${monthLong(current.month)} invoice`,
      amount: amountText(current.amount),
      issued: dayText(current.issued),
      due: dayText(current.due),
      pill: pill(current),
      shared: shared(current),
      credit: current.creditApplied && current.creditApplied > 0
        ? {
          total: `Credit applied: ${money(current.creditApplied, true)}`,
          lines: netted.map((c) => [`Missed ${dayText(c.date)}`, c.course].filter(Boolean).join(" · ")),
        }
        : null,
      pdfHref: pdfHref(data.childId, current),
    };
  }

  const credits = [...data.credits]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .map((c) => {
      const amount = creditAmount(c);
      return {
        key: c.id,
        date: dayText(c.date),
        course: c.course,
        hours: c.hours === null ? "" : `${c.hours.toFixed(1)}h`,
        amount: amount === null ? null : money(amount),
        pill: { state: CREDIT_PILL[c.status], label: c.status },
      };
    });

  const rateParts = [data.profile.rate === null ? null : `${money(data.profile.rate)}/h`, data.profile.cadence].filter(Boolean);
  const grade = data.header.gradeLevel;

  return {
    header: { name: studentName(data.header), grade: grade === null ? null : `Grade ${grade}` },
    card,
    credits,
    openTotal: money(openTotal(data.credits)),
    hasOpen: data.credits.some((c) => c.status === "Open"),
    past: past.map((i) => ({ key: i.id, month: monthShort(i.month), amount: amountText(i.amount), pill: pill(i), shared: shared(i), pdfHref: pdfHref(data.childId, i) })),
    rateLine: rateParts.length ? `Rate: ${rateParts.join(" · ")}` : null,
  };
}
