import "server-only";
import { z } from "zod";
import type { Sibling } from "../domain/billing";
import type { BillingReader } from "../notion/billing";
import { buildBillingView, type BillingView } from "../view/parent-billing";
import type { Db } from "./client";

/**
 * The parent Billing tab's reads (REQ-25, ADR 0049). The child's Notion link
 * comes from tracker.students on the parent's own client, so the 0016 parent
 * policy decides which child a parent may ask about; every Notion read is then
 * filtered on that link. Read-only.
 */
export type ChildBilling = { kind: "not_available" } | { kind: "error" } | { kind: "ready"; view: BillingView };
export type BillingDeps = { reader: BillingReader | null };

const ChildRow = z.object({ notion_student_id: z.guid().nullable(), grade_level: z.number().nullable() });

export async function loadChildBilling(
  viewer: { db: Db },
  child: { id: string; firstName: string; lastInitial: string },
  deps: BillingDeps,
  today: string,
): Promise<ChildBilling> {
  const reader = deps.reader;
  if (!reader) return { kind: "not_available" };
  let row: z.output<typeof ChildRow>;
  try {
    const { data, error } = await viewer.db.tracker.from("students").select("notion_student_id, grade_level").eq("id", child.id).maybeSingle();
    if (error || !data) return { kind: "error" };
    row = ChildRow.parse(data);
  } catch {
    return { kind: "error" };
  }
  const notionId = row.notion_student_id;
  if (!notionId) return { kind: "not_available" };

  let core: [Awaited<ReturnType<BillingReader["childBilling"]>>, Awaited<ReturnType<BillingReader["invoices"]>>, Awaited<ReturnType<BillingReader["credits"]>>];
  try {
    core = await Promise.all([reader.childBilling(notionId), reader.invoices(notionId), reader.credits(notionId)]);
  } catch {
    return { kind: "error" };
  }
  const [profile, invoices, credits] = core;

  // The shared line is a nicety: a failed sharer or sibling read drops it and the page still renders.
  let sharers: Record<string, Sibling[]> = {};
  try {
    const others = await reader.sharers(invoices.map((i) => i.number), notionId);
    const ids = [...new Set(Object.values(others).flat())];
    const siblings = ids.length ? await reader.siblings(ids) : {};
    sharers = Object.fromEntries(Object.entries(others).map(([number, list]) => [number, list.flatMap((id) => (siblings[id] ? [siblings[id]] : []))]));
  } catch {
    sharers = {};
  }

  return {
    kind: "ready",
    view: buildBillingView({
      childId: child.id,
      header: { firstName: child.firstName, lastInitial: child.lastInitial, gradeLevel: row.grade_level },
      profile,
      invoices,
      credits,
      sharers,
    }, today),
  };
}

/** The child's Notion link, read under the parent's own policies. Null when missing or unreadable. */
export async function readNotionId(db: Db, studentId: string): Promise<string | null> {
  try {
    const { data, error } = await db.tracker.from("students").select("notion_student_id").eq("id", studentId).maybeSingle();
    if (error || !data) return null;
    const row = z.object({ notion_student_id: z.guid().nullable() }).safeParse(data);
    return row.success ? row.data.notion_student_id : null;
  } catch {
    return null;
  }
}

const FILE_HOST_SUFFIXES = [".amazonaws.com", ".notion.so", ".notion-static.com"];

/**
 * Notion-hosted files only (Decision 6): https on an allowlisted host, or the
 * NOTION_API_BASE origin when the e2e mock sets it. Nothing else is fetched.
 */
export function fileHostAllowed(fileUrl: string, apiBase: string | null): boolean {
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return false;
  }
  if (apiBase) {
    try {
      if (url.origin === new URL(apiBase).origin) return true;
    } catch {
      // A malformed override allows nothing extra.
    }
  }
  return url.protocol === "https:" && FILE_HOST_SUFFIXES.some((s) => url.hostname.endsWith(s));
}

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PDF_TIMEOUT_MS = 15_000;

export type PdfDeps = {
  getViewer: () => Promise<{ kind: string; db?: Db }>;
  listChildren: (db: Db) => Promise<{ id: string; published: boolean }[]>;
  readNotionId: (db: Db, studentId: string) => Promise<string | null>;
  fetchInvoicePdf: (invoiceId: string, notionId: string) => Promise<{ number: string; fileUrl: string } | null>;
  fetcher: typeof fetch;
  apiBase: string | null;
};

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });
const badGateway = () => new Response(null, { status: 502, headers: { "Cache-Control": "private, no-store, max-age=0" } });
const isGuid = (s: string) => z.guid().safeParse(s).success;

/** Read a body up to the cap; null when it is larger. */
async function readCapped(res: Response, cap: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > cap) return null;
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * GET /tracker/parent/[studentId]/billing/invoices/[invoiceId] (AC9, AC10).
 * Every refusal is a bare 404; a failed or oversize file is a bare 502. The
 * signed file URL is fetched here, per request, and never sent or kept.
 */
export async function invoicePdfResponse(params: { studentId: string; invoiceId: string }, deps: PdfDeps): Promise<Response> {
  if (!isGuid(params.studentId) || !isGuid(params.invoiceId)) return notFound();
  const viewer = await deps.getViewer();
  if (viewer.kind !== "parent" || !viewer.db) return notFound();
  const children = await deps.listChildren(viewer.db).catch(() => []);
  if (!children.some((c) => c.id === params.studentId && c.published)) return notFound();
  const notionId = await deps.readNotionId(viewer.db, params.studentId);
  if (!notionId) return notFound();

  let pdf: { number: string; fileUrl: string } | null;
  try {
    pdf = await deps.fetchInvoicePdf(params.invoiceId, notionId);
  } catch {
    return badGateway();
  }
  if (!pdf || !fileHostAllowed(pdf.fileUrl, deps.apiBase)) return notFound();

  let bytes: Uint8Array | null;
  try {
    const res = await deps.fetcher(pdf.fileUrl, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(PDF_TIMEOUT_MS) });
    if (!res.ok) return badGateway();
    bytes = await readCapped(res, MAX_PDF_BYTES);
  } catch {
    return badGateway();
  }
  if (!bytes) return badGateway();

  const filename = pdf.number.replace(/[^A-Za-z0-9-]/g, "") || "invoice";
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
