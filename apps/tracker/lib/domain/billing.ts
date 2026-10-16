/**
 * Parent Billing rules (REQ-25, ADR 0049). Pure: no React, Next, Supabase or
 * Notion, and no clock. `today` and `month` come in as Toronto ISO strings.
 */
export type InvoiceStatus = "Sent" | "Paid";
export type Invoice = {
  id: string;
  number: string;
  /** YYYY-MM of the lessons billed. */
  month: string;
  amount: number | null;
  creditApplied: number | null;
  /** Page IDs in the invoice's Credits relation. */
  creditIds: string[];
  issued: string | null;
  due: string | null;
  status: InvoiceStatus;
  hasPdf: boolean;
  studentIds: string[];
};

export type CreditStatus = "Open" | "Applied" | "Made up" | "Forfeited";
export type Credit = {
  id: string;
  date: string | null;
  course: string;
  hours: number | null;
  rate: number | null;
  status: CreditStatus;
  /** "AP-2026-0010, Nov 2026": the invoice number, then the month. */
  appliedTo: string;
};

export type InvoicePill = "Paid" | "Due" | "Overdue";

/** Paid stays Paid. Sent is Overdue only once its Due date is before today. */
export function invoiceStatus(invoice: Pick<Invoice, "status" | "due">, today: string): InvoicePill {
  if (invoice.status === "Paid") return "Paid";
  return invoice.due && invoice.due.slice(0, 10) < today ? "Overdue" : "Due";
}

/** The invoice number in an Applied To value: the text before the first comma. */
export function appliedToNumber(text: string): string {
  return text.split(",")[0].trim();
}

/**
 * The credits netted on this invoice: Applied rows that name it in Applied To
 * or sit in its Credits relation. An Open credit nets off the next invoice, so
 * it is on no invoice's line yet, wherever it is linked.
 */
export function creditsOnInvoice(invoice: Pick<Invoice, "number" | "creditIds">, credits: Credit[]): Credit[] {
  const linked = new Set(invoice.creditIds.map(normalId));
  return credits.filter((c) => c.status === "Applied" && (appliedToNumber(c.appliedTo) === invoice.number || linked.has(normalId(c.id))));
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Hours × Rate, to the cent; null when either is missing. */
export function creditAmount(c: Pick<Credit, "hours" | "rate">): number | null {
  return c.hours === null || c.rate === null ? null : cents(c.hours * c.rate);
}

export function openTotal(credits: Credit[]): number {
  return cents(credits.filter((c) => c.status === "Open").reduce((sum, c) => sum + (creditAmount(c) ?? 0), 0));
}

export const MAX_PAST_INVOICES = 24;

const byMonthThenIssued = (a: Invoice, b: Invoice) =>
  b.month.localeCompare(a.month) || (b.issued ?? "").localeCompare(a.issued ?? "");

/** This month's invoice (the latest issued when two match) and the rest, newest first, at most 24. */
export function splitInvoices(invoices: Invoice[], month: string): { current: Invoice | null; past: Invoice[] } {
  const sorted = [...invoices].sort(byMonthThenIssued);
  const current = sorted.find((i) => i.month === month) ?? null;
  return { current, past: sorted.filter((i) => i !== current).slice(0, MAX_PAST_INVOICES) };
}

export type Sibling = { firstName: string; family: string };
const familyKey = (s: string) => s.trim().toLowerCase();

/**
 * The first name of a sibling on the same invoice number, only when their
 * Billing Family matches the child's non-empty one. Amounts are never summed.
 */
export function sharedWith(invoice: Pick<Invoice, "number">, sharers: Record<string, Sibling[]>, childFamily: string): string | null {
  const family = familyKey(childFamily);
  if (!family) return null;
  return (sharers[invoice.number] ?? []).find((s) => s.firstName && familyKey(s.family) === family)?.firstName ?? null;
}

/** Notion IDs come with or without dashes; compare them without. */
export function normalId(id: string): string {
  return id.replaceAll("-", "").toLowerCase();
}
