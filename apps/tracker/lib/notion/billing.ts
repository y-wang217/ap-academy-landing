import "server-only";
import { z } from "zod";
import type { InvoiceSource, ReadResult } from "../console/contracts";
import { normalId, type Credit, type CreditStatus, type Invoice, type Sibling } from "../domain/billing";
import { NOTION_VERSION, notionApiBaseOverride, type BillingConfig, type NotionConfig } from "./config";
import { pagedQuery, parseRows, prop, propertyFilter, type ReaderOptions, val } from "./paged";
import { NotionError } from "./staff";

export type { BillingConfig } from "./config";

/**
 * The parent Billing tab's Notion reads (REQ-25, ADR 0049), plain fetch and
 * Zod like students.ts. Read-only: every request is a GET or a data source
 * query. Each one names its properties with filter_properties, both list
 * queries are filtered on the child's own Students & Parents page, and every
 * property not listed here is dropped at the parse step. A PDF's file URL
 * leaves this file only through fetchInvoicePdf, for the server-side proxy.
 */

// The e2e stack points this at a local mock; production leaves the override unset.
const BASE = `${notionApiBaseOverride() ?? "https://api.notion.com"}/v1`;
const MAX_SIBLINGS = 4;
const MAX_SHARER_NUMBERS = 25;

const P = {
  invoice: "Invoice", month: "Month", amount: "Amount (CAD)", creditApplied: "Credit Applied (CAD)", credits: "Credits",
  issued: "Issued", due: "Due", status: "Status", pdf: "PDF", student: "Student",
  date: "Date", course: "Course", hours: "Hours", rate: "Rate (CAD)", creditStatus: "Credit Status", appliedTo: "Applied To",
  name: "Student Name", hourlyRate: "Hourly Rate (CAD)", cadence: "Lesson Cadence", family: "Billing Family",
} as const;
const INVOICE_PROPS = [P.invoice, P.month, P.amount, P.creditApplied, P.credits, P.issued, P.due, P.status, P.pdf, P.student];
const CREDIT_PROPS = [P.date, P.course, P.hours, P.rate, P.creditStatus, P.appliedTo, P.student];
const CHILD_PROPS = [P.hourlyRate, P.cadence, P.family];
const SIBLING_PROPS = [P.name, P.family];
const SHARER_PROPS = [P.invoice, P.student, P.status];
const PDF_PROPS = [P.invoice, P.student, P.status, P.pdf];

/** Property name to ID for one data source (schema only, no row data). */
export type PropertyLookup = (dataSourceId: string) => Promise<Record<string, string>>;
export type ReadOptions = { fetcher?: typeof fetch; lookup?: PropertyLookup };

const headers = (config: BillingConfig, json = false) => ({
  Authorization: `Bearer ${config.token}`,
  "Notion-Version": NOTION_VERSION,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function call(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetcher(url, { ...init, cache: "no-store" });
  } catch {
    throw new NotionError("Notion request failed");
  }
}

const Schema = z.object({ properties: z.record(z.string(), z.object({ id: z.string() })) });

/** The uncached lookup: one schema GET. cached.ts wraps it for page loads. */
export function schemaLookup(config: BillingConfig, fetcher: typeof fetch = fetch): PropertyLookup {
  return async (dataSourceId) => {
    const res = await call(fetcher, `${BASE}/data_sources/${dataSourceId}`, { method: "GET", headers: headers(config) });
    if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
    const parsed = Schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new NotionError("Unexpected Notion response");
    return Object.fromEntries(Object.entries(parsed.data.properties).map(([name, p]) => [name, p.id]));
  };
}

async function idsFor(config: BillingConfig, opts: ReadOptions, dataSourceId: string, names: readonly string[]): Promise<string> {
  const map = await (opts.lookup ?? schemaLookup(config, opts.fetcher))(dataSourceId);
  const ids = names.map((n) => map[n]);
  if (ids.some((i) => !i)) throw new NotionError("A billing database is missing a needed property");
  // Notion returns property IDs already URL-encoded, so they go in as they are.
  return ids.map((i) => `filter_properties[]=${i}`).join("&");
}

const plain = z.array(z.object({ plain_text: z.string() })).transform((v) => v.map((t) => t.plain_text).join(""));
const Title = z.object({ title: plain });
const Text = z.object({ rich_text: plain }).optional();
const Num = z.object({ number: z.number().nullable() }).optional();
const DateProp = z.object({ date: z.object({ start: z.string() }).nullable() }).optional();
const Select = z.object({ select: z.object({ name: z.string() }).nullable() }).optional();
const Relation = z.object({ relation: z.array(z.object({ id: z.string() })) }).optional();
const Files = z.object({ files: z.array(z.object({ type: z.string(), file: z.object({ url: z.string() }).optional() })) }).optional();

const relIds = (r: z.output<typeof Relation>) => (r?.relation ?? []).map((x) => x.id);
const hasChild = (ids: string[], notionId: string) => ids.some((id) => normalId(id) === normalId(notionId));
const day = (d: z.output<typeof DateProp>) => d?.date?.start.slice(0, 10) ?? null;
const visible = (s: string | undefined): s is Invoice["status"] => s === "Sent" || s === "Paid";
const CREDIT_STATUSES: readonly string[] = ["Open", "Applied", "Made up", "Forfeited"] satisfies CreditStatus[];

const InvoicePage = z.object({
  id: z.guid(),
  properties: z.object({
    [P.invoice]: Title,
    [P.month]: Text,
    [P.amount]: Num,
    [P.creditApplied]: Num,
    [P.credits]: Relation,
    [P.issued]: DateProp,
    [P.due]: DateProp,
    [P.status]: Select,
    [P.pdf]: Files,
    [P.student]: Relation,
  }),
});

/** One visible invoice of this child, or null (Draft, Void, another student, an unexpected shape). */
function parseInvoice(raw: unknown, notionId: string): Invoice | null {
  const page = InvoicePage.safeParse(raw);
  if (!page.success) return null;
  const p = page.data.properties;
  const status = p[P.status]?.select?.name;
  const studentIds = relIds(p[P.student]);
  if (!visible(status) || !hasChild(studentIds, notionId)) return null;
  return {
    id: page.data.id,
    number: p[P.invoice].title.trim(),
    month: (p[P.month]?.rich_text ?? "").trim(),
    amount: p[P.amount]?.number ?? null,
    creditApplied: p[P.creditApplied]?.number ?? null,
    creditIds: relIds(p[P.credits]),
    issued: day(p[P.issued]),
    due: day(p[P.due]),
    status,
    hasPdf: (p[P.pdf]?.files ?? []).some((f) => f.type === "file"),
    studentIds,
  };
}

const CreditPage = z.object({
  id: z.guid(),
  properties: z.object({
    [P.date]: DateProp,
    [P.course]: Text,
    [P.hours]: Num,
    [P.rate]: Num,
    [P.creditStatus]: Select,
    [P.appliedTo]: Text,
    [P.student]: Relation,
  }),
});

function parseCredit(raw: unknown, notionId: string): Credit | null {
  const page = CreditPage.safeParse(raw);
  if (!page.success) return null;
  const p = page.data.properties;
  const status = p[P.creditStatus]?.select?.name ?? "";
  if (!CREDIT_STATUSES.includes(status) || !hasChild(relIds(p[P.student]), notionId)) return null;
  return {
    id: page.data.id,
    date: day(p[P.date]),
    course: (p[P.course]?.rich_text ?? "").trim(),
    hours: p[P.hours]?.number ?? null,
    rate: p[P.rate]?.number ?? null,
    status: status as CreditStatus,
    appliedTo: (p[P.appliedTo]?.rich_text ?? "").trim(),
  };
}

const QueryResponse = z.object({
  results: z.array(z.unknown()),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
});

/** Every page of one filtered query, capped at 50 pages of 100 like fetchStaff. */
async function queryAll(config: BillingConfig, fetcher: typeof fetch, dataSourceId: string, props: string, body: Record<string, unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 50; guard++) {
    const res = await call(fetcher, `${BASE}/data_sources/${dataSourceId}/query?${props}`, {
      method: "POST",
      headers: headers(config, true),
      body: JSON.stringify({ page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
    const parsed = QueryResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new NotionError("Unexpected Notion response");
    out.push(...parsed.data.results);
    if (!parsed.data.has_more || !parsed.data.next_cursor) return out;
    cursor = parsed.data.next_cursor;
  }
  throw new NotionError("Too many Notion pages");
}

const childFilter = (notionId: string) => ({ property: P.student, relation: { contains: notionId } });
const hiddenStatuses = [
  { property: P.status, select: { does_not_equal: "Draft" } },
  { property: P.status, select: { does_not_equal: "Void" } },
];

/** The child's Sent and Paid invoices, Month descending. */
export async function fetchInvoices(config: BillingConfig, notionId: string, opts: ReadOptions = {}): Promise<Invoice[]> {
  const fetcher = opts.fetcher ?? fetch;
  const props = await idsFor(config, opts, config.invoicesId, INVOICE_PROPS);
  const rows = await queryAll(config, fetcher, config.invoicesId, props, {
    filter: { and: [childFilter(notionId), ...hiddenStatuses] },
    sorts: [{ property: P.month, direction: "descending" }],
  });
  return rows.map((r) => parseInvoice(r, notionId)).filter((i): i is Invoice => i !== null);
}

/** Every missed-session credit of the child, Date descending. */
export async function fetchCredits(config: BillingConfig, notionId: string, opts: ReadOptions = {}): Promise<Credit[]> {
  const fetcher = opts.fetcher ?? fetch;
  const props = await idsFor(config, opts, config.creditsId, CREDIT_PROPS);
  const rows = await queryAll(config, fetcher, config.creditsId, props, {
    filter: childFilter(notionId),
    sorts: [{ property: P.date, direction: "descending" }],
  });
  return rows.map((r) => parseCredit(r, notionId)).filter((c): c is Credit => c !== null);
}

async function getPage(config: BillingConfig, fetcher: typeof fetch, pageId: string, props: string): Promise<unknown | null> {
  const res = await call(fetcher, `${BASE}/pages/${pageId}?${props}`, { method: "GET", headers: headers(config) });
  if (res.status === 404) return null;
  if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
  return res.json().catch(() => {
    throw new NotionError("Unexpected Notion response");
  });
}

const ChildPage = z.object({
  properties: z.object({ [P.hourlyRate]: Num, [P.cadence]: Select, [P.family]: Text }),
});
export type ChildBilling = { rate: number | null; cadence: string | null; family: string };

/** The rate line and the Billing Family key from the child's own Students & Parents page. */
export async function fetchChildBilling(config: BillingConfig, notionId: string, opts: ReadOptions = {}): Promise<ChildBilling> {
  if (!z.guid().safeParse(notionId).success) throw new NotionError("Invalid page ID");
  const props = await idsFor(config, opts, config.studentsId, CHILD_PROPS);
  const body = await getPage(config, opts.fetcher ?? fetch, notionId, props);
  const page = ChildPage.safeParse(body);
  if (!page.success) throw new NotionError(body === null ? "Student page not found" : "Unexpected Notion response");
  const p = page.data.properties;
  return { rate: p[P.hourlyRate]?.number ?? null, cadence: p[P.cadence]?.select?.name ?? null, family: (p[P.family]?.rich_text ?? "").trim() };
}

const SharerPage = z.object({ properties: z.object({ [P.invoice]: Title, [P.student]: Relation, [P.status]: Select }) });

/** For each invoice number, the other students on a visible row with that number. One query, at most 25 numbers. */
export async function fetchInvoiceSharers(config: BillingConfig, numbers: string[], notionId: string, opts: ReadOptions = {}): Promise<Record<string, string[]>> {
  const wanted = [...new Set(numbers.filter(Boolean))].slice(0, MAX_SHARER_NUMBERS);
  if (wanted.length === 0) return {};
  const props = await idsFor(config, opts, config.invoicesId, SHARER_PROPS);
  const rows = await queryAll(config, opts.fetcher ?? fetch, config.invoicesId, props, {
    filter: { and: [{ or: wanted.map((n) => ({ property: P.invoice, title: { equals: n } })) }, ...hiddenStatuses] },
  });
  const out: Record<string, string[]> = {};
  for (const raw of rows) {
    const page = SharerPage.safeParse(raw);
    if (!page.success || !visible(page.data.properties[P.status]?.select?.name)) continue;
    const number = page.data.properties[P.invoice].title.trim();
    if (!wanted.includes(number)) continue;
    const others = relIds(page.data.properties[P.student]).filter((id) => normalId(id) !== normalId(notionId));
    if (others.length) out[number] = [...new Set([...(out[number] ?? []), ...others])];
  }
  return out;
}

const SiblingPage = z.object({ properties: z.object({ [P.name]: Title, [P.family]: Text }) });

/** First name and Billing Family for at most 4 sibling pages. A missing page is skipped. */
export async function fetchSiblingNames(config: BillingConfig, ids: string[], opts: ReadOptions = {}): Promise<Record<string, Sibling>> {
  const wanted = [...new Set(ids)].filter((id) => z.guid().safeParse(id).success).slice(0, MAX_SIBLINGS);
  if (wanted.length === 0) return {};
  const props = await idsFor(config, opts, config.studentsId, SIBLING_PROPS);
  const fetcher = opts.fetcher ?? fetch;
  const out: Record<string, Sibling> = {};
  for (const id of wanted) {
    const page = SiblingPage.safeParse(await getPage(config, fetcher, id, props));
    if (!page.success) continue;
    const p = page.data.properties;
    out[id] = { firstName: p[P.name].title.trim().split(/\s+/)[0] ?? "", family: (p[P.family]?.rich_text ?? "").trim() };
  }
  return out;
}

const PdfPage = z.object({
  parent: z.object({ data_source_id: z.string().optional() }).optional(),
  properties: z.object({ [P.invoice]: Title, [P.student]: Relation, [P.status]: Select, [P.pdf]: Files }),
});

/**
 * The PDF of one of the child's visible invoices, for the server-side proxy
 * only. Null when the ID is not a GUID, the page is missing, is not in the
 * Invoices data source, is another student's, is not Sent or Paid, or has no
 * Notion-hosted file (an external link is refused).
 */
export async function fetchInvoicePdf(config: BillingConfig, invoiceId: string, notionId: string, opts: ReadOptions = {}): Promise<{ number: string; fileUrl: string } | null> {
  if (!z.guid().safeParse(invoiceId).success || !z.guid().safeParse(notionId).success) return null;
  const props = await idsFor(config, opts, config.invoicesId, PDF_PROPS);
  const page = PdfPage.safeParse(await getPage(config, opts.fetcher ?? fetch, invoiceId, props));
  if (!page.success) return null;
  const source = page.data.parent?.data_source_id;
  const p = page.data.properties;
  if (!source || normalId(source) !== normalId(config.invoicesId)) return null;
  if (!visible(p[P.status]?.select?.name) || !hasChild(relIds(p[P.student]), notionId)) return null;
  const file = (p[P.pdf]?.files ?? []).find((f) => f.type === "file")?.file;
  return file ? { number: p[P.invoice].title.trim(), fileUrl: file.url } : null;
}

/** Every billing read for one request, bound to one config and one property lookup. */
export type BillingReader = {
  childBilling(notionId: string): Promise<ChildBilling>;
  invoices(notionId: string): Promise<Invoice[]>;
  credits(notionId: string): Promise<Credit[]>;
  sharers(numbers: string[], notionId: string): Promise<Record<string, string[]>>;
  siblings(ids: string[]): Promise<Record<string, Sibling>>;
  invoicePdf(invoiceId: string, notionId: string): Promise<{ number: string; fileUrl: string } | null>;
};

export function createBillingReader(config: BillingConfig, opts: ReadOptions = {}): BillingReader {
  return {
    childBilling: (id) => fetchChildBilling(config, id, opts),
    invoices: (id) => fetchInvoices(config, id, opts),
    credits: (id) => fetchCredits(config, id, opts),
    sharers: (numbers, id) => fetchInvoiceSharers(config, numbers, id, opts),
    siblings: (ids) => fetchSiblingNames(config, ids, opts),
    invoicePdf: (invoiceId, id) => fetchInvoicePdf(config, invoiceId, id, opts),
  };
}

/**
 * The Founder Console's org-wide invoice read (REQ-54, ADR 0065): every
 * status, values passed through exactly as Notion holds them, nothing
 * computed (ADR 0049). Read-only, through the shared pager.
 */
export const ORG_INVOICE_PROPS = ["Status", "Paid On", "Amount (CAD)", "Credit Applied (CAD)", "Issued", "Due", "Month", "Student"] as const;

const OrgInvoicePage = z.object({
  id: z.guid(),
  properties: z.object({
    Status: prop.select,
    "Paid On": prop.date,
    "Amount (CAD)": prop.number,
    "Credit Applied (CAD)": prop.number,
    Issued: prop.date,
    Due: prop.date,
    Month: prop.text,
    Student: prop.relation,
  }),
});

const toOrgInvoice = (page: z.output<typeof OrgInvoicePage>): InvoiceSource => {
  const p = page.properties;
  return {
    id: page.id,
    status: val.select(p.Status),
    paidOn: val.date(p["Paid On"]),
    amount: val.number(p["Amount (CAD)"]),
    creditApplied: val.number(p["Credit Applied (CAD)"]),
    issued: val.date(p.Issued),
    due: val.date(p.Due),
    month: val.text(p.Month),
    studentIds: val.ids(p.Student),
  };
};

/** Every invoice in the org, Month descending. */
export async function fetchOrgInvoices(config: NotionConfig, opts: ReaderOptions): Promise<ReadResult<InvoiceSource>> {
  const fetcher = opts.fetcher ?? fetch;
  const filterQuery = await propertyFilter(config.token, fetcher, config.dataSourceId, ORG_INVOICE_PROPS, "Invoices");
  const read = await pagedQuery({
    token: config.token, fetcher, dataSourceId: config.dataSourceId, filterQuery, maxPages: opts.maxPages,
    body: { sorts: [{ property: "Month", direction: "descending" }] },
  });
  return { ...parseRows(read.rows, OrgInvoicePage, toOrgInvoice), complete: read.complete, pages: read.pages };
}
