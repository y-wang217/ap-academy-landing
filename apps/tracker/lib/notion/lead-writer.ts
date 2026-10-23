import "server-only";
import { z } from "zod";
import { CONTRACT_FIELDS, type ContractField, type LeadPatch, type LeadSnapshot } from "../console/outcomes";
import { TUNING } from "../domain/tuning";
import { NOTION_VERSION, notionApiBaseOverride } from "./config";
import { NotionError } from "./staff";

/**
 * The console's one Notion write path into people records (REQ-61, tracker
 * ADR 0076, workspace ADR 0007). Plain fetch like lessons.ts. It has exactly
 * two write shapes: a Students & Parents PATCH whose keys come from WRITABLE
 * plus `Last Txn`, and a Touches create with seven fixed keys. Contract
 * fields are read as presence only: their values never leave this file.
 * It never archives a page and never writes a billing, parent, note or
 * schedule property.
 */
// The e2e stack points this at a local mock; production leaves the override unset.
const BASE = `${notionApiBaseOverride() ?? "https://api.notion.com"}/v1`;

/** A write that may have landed: timeout, network failure, 409, 429 or 5xx. The caller reads back before any retry. */
export class NotionUncertain extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "NotionUncertain";
  }
}

export const LAST_TXN = "Last Txn";
export const TXN_ID = "Txn ID";

/** The only Students & Parents properties the console writes, besides Last Txn (AC3). */
export const WRITABLE = {
  stage: { name: "Stage", kind: "select" },
  owner: { name: "Owner", kind: "relation" },
  nextAction: { name: "Next Action", kind: "select" },
  nextActionDue: { name: "Next Action Due", kind: "date" },
  attempts: { name: "Attempts", kind: "number" },
  lastContact: { name: "Last Contact", kind: "date" },
  lostReason: { name: "Lost Reason", kind: "select" },
  contactedAt: { name: "Contacted At", kind: "date" },
  trialBookedAt: { name: "Trial Booked At", kind: "date" },
  closedAt: { name: "Closed At", kind: "date" },
} as const satisfies Record<keyof Required<LeadPatch>, { name: string; kind: "select" | "relation" | "date" | "number" }>;

const READ_PROPS = [
  ...Object.values(WRITABLE).map((w) => w.name), "Trial Time", LAST_TXN, ...CONTRACT_FIELDS,
].filter((n, i, all) => all.indexOf(n) === i);
const TOUCH_PROPS = ["Touch", "Type", "Outcome", "Student", "Staff", "Note", TXN_ID] as const;

export type LeadWriterConfig = { token: string; studentsId: string; touchesId: string };
export type FoundTouch = { id: string; studentIds: string[]; txnId: string | null };
export type NewTouch = { studentId: string; staffId: string | null; type: string; outcome: string; title: string; note: string; requestId: string };

export interface LeadWriter {
  /** The properties Notion lacks for a write (`Txn ID` on Touches, `Last Txn` on Students & Parents, a Touches field); empty when ready. */
  checkReady(): Promise<string[]>;
  readLead(pageId: string): Promise<LeadSnapshot>;
  patchLead(pageId: string, patch: LeadPatch, requestId: string): Promise<void>;
  findTouches(requestId: string): Promise<FoundTouch[]>;
  createTouch(input: NewTouch): Promise<{ id: string }>;
  getTouch(id: string): Promise<FoundTouch | null>;
}

const text = (s: string) => [{ type: "text", text: { content: s } }];
const plain = z.array(z.object({ plain_text: z.string() })).transform((v) => v.map((t) => t.plain_text).join(""));
const Schema = z.object({ properties: z.record(z.string(), z.object({ id: z.string(), type: z.string().optional() })) });
const LeadPage = z.object({ id: z.guid(), last_edited_time: z.string(), properties: z.record(z.string(), z.unknown()) });
const TouchPage = z.object({ id: z.guid(), properties: z.record(z.string(), z.unknown()) });
const Query = z.object({ results: z.array(z.unknown()) });

const Select = z.object({ select: z.object({ name: z.string() }).nullable() });
const DateV = z.object({ date: z.object({ start: z.string() }).nullable() });
const NumberV = z.object({ number: z.number().nullable() });
const Relation = z.object({ relation: z.array(z.object({ id: z.string() })) });
const RichText = z.object({ rich_text: plain });

const pick = <T,>(schema: z.ZodType<T>, v: unknown): T | null => {
  const r = schema.safeParse(v);
  return r.success ? r.data : null;
};

/** Whether a Notion property value holds anything, whatever its type. Never returns the value. */
export function hasValue(v: unknown): boolean {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  for (const key of ["title", "rich_text"]) {
    if (Array.isArray(o[key])) return (o[key] as { plain_text?: string }[]).some((t) => (t.plain_text ?? "").trim() !== "");
  }
  if ("select" in o || "status" in o) return Boolean((o.select ?? o.status) as object | null);
  if (Array.isArray(o.multi_select)) return o.multi_select.length > 0;
  if (Array.isArray(o.relation)) return o.relation.length > 0;
  if ("date" in o) return Boolean((o.date as { start?: string } | null)?.start);
  if ("number" in o) return typeof o.number === "number";
  for (const key of ["phone_number", "email", "url"]) if (key in o) return typeof o[key] === "string" && (o[key] as string).trim() !== "";
  return false;
}

function snapshotOf(raw: unknown): LeadSnapshot {
  const page = LeadPage.safeParse(raw);
  if (!page.success) throw new NotionError("Unexpected Notion response");
  const p = page.data.properties;
  const select = (n: string) => pick(Select, p[n])?.select?.name ?? null;
  const date = (n: string) => pick(DateV, p[n])?.date?.start ?? null;
  const present = Object.fromEntries(CONTRACT_FIELDS.map((f) => [f, hasValue(p[f])])) as Record<ContractField, boolean>;
  return {
    id: page.data.id,
    stage: select("Stage"),
    lostReason: select("Lost Reason"),
    attempts: pick(NumberV, p.Attempts)?.number ?? null,
    nextAction: select("Next Action"),
    nextActionDue: date("Next Action Due"),
    owner: pick(Relation, p.Owner)?.relation[0]?.id ?? null,
    lastContact: date("Last Contact"),
    contactedAt: date("Contacted At"),
    trialBookedAt: date("Trial Booked At"),
    closedAt: date("Closed At"),
    trialTime: date("Trial Time"),
    lastEditedAt: page.data.last_edited_time,
    lastTxn: pick(RichText, p[LAST_TXN])?.rich_text.trim() || null,
    present,
  };
}

function touchOf(raw: unknown): FoundTouch {
  const page = TouchPage.safeParse(raw);
  if (!page.success) throw new NotionError("Unexpected Notion response");
  const p = page.data.properties;
  return {
    id: page.data.id,
    studentIds: (pick(Relation, p.Student)?.relation ?? []).map((r) => r.id),
    txnId: pick(RichText, p[TXN_ID])?.rich_text.trim() || null,
  };
}

/** The PATCH body for a plan. A key outside WRITABLE throws before any request (AC3). */
export function leadPatchBody(patch: LeadPatch, requestId: string): { properties: Record<string, unknown> } {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(WRITABLE, key)) throw new NotionError(`Not a writable lead property: ${key}`);
    const w = WRITABLE[key as keyof typeof WRITABLE];
    if (w.kind === "select") properties[w.name] = { select: value === null ? null : { name: String(value) } };
    else if (w.kind === "relation") properties[w.name] = { relation: [] };
    else if (w.kind === "date") properties[w.name] = { date: value === null ? null : { start: String(value) } };
    else properties[w.name] = { number: value as number };
  }
  properties[LAST_TXN] = { rich_text: text(requestId) };
  return { properties };
}

const guid = (id: string) => {
  if (!z.guid().safeParse(id).success) throw new NotionError("Invalid page ID");
  return id;
};

export function createLeadWriter(config: LeadWriterConfig, fetcher: typeof fetch = fetch): LeadWriter {
  const headers = (json = false) => ({
    Authorization: `Bearer ${config.token}`,
    "Notion-Version": NOTION_VERSION,
    ...(json ? { "Content-Type": "application/json" } : {}),
  });

  /** One request. Nothing landed on a 4xx other than 409 and 429; anything else may have. */
  async function call(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetcher(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TUNING.consoleProviderTimeoutMs) });
    } catch {
      throw new NotionUncertain("Notion did not answer");
    }
    if (res.ok) return res;
    if (res.status === 409 || res.status === 429 || res.status >= 500) throw new NotionUncertain(`Notion returned ${res.status}`, res.status);
    throw new NotionError(`Notion returned ${res.status}`, res.status);
  }
  const json = async (res: Response) => res.json().catch(() => null);

  let schemas: { students: Record<string, { id: string; type?: string }>; touches: Record<string, { id: string; type?: string }> } | null = null;
  async function loadSchemas() {
    if (schemas) return schemas;
    const read = async (id: string) => {
      const parsed = Schema.safeParse(await json(await call(`${BASE}/data_sources/${id}`, { method: "GET", headers: headers() })));
      if (!parsed.success) throw new NotionError("Unexpected Notion response");
      return parsed.data.properties;
    };
    const [students, touches] = await Promise.all([read(config.studentsId), read(config.touchesId)]);
    schemas = { students, touches };
    return schemas;
  }
  const isText = (p: { type?: string } | undefined) => p !== undefined && (p.type === undefined || p.type === "rich_text");

  async function leadFilter(): Promise<string> {
    const { students } = await loadSchemas();
    const missing = READ_PROPS.filter((n) => !students[n]);
    if (missing.length) throw new NotionError(`Students & Parents is missing ${missing.join(", ")}`);
    // Notion returns property IDs already URL-encoded, so they go in as they are.
    return READ_PROPS.map((n) => `filter_properties[]=${students[n].id}`).join("&");
  }

  return {
    async checkReady() {
      const { students, touches } = await loadSchemas();
      const missing: string[] = TOUCH_PROPS.filter((n) => n !== TXN_ID && !touches[n]);
      if (!isText(touches[TXN_ID])) missing.push(TXN_ID);
      if (!isText(students[LAST_TXN])) missing.push(LAST_TXN);
      return missing;
    },

    async readLead(pageId) {
      const fq = await leadFilter();
      return snapshotOf(await json(await call(`${BASE}/pages/${guid(pageId)}?${fq}`, { method: "GET", headers: headers() })));
    },

    async patchLead(pageId, patch, requestId) {
      const body = leadPatchBody(patch, requestId);
      await call(`${BASE}/pages/${guid(pageId)}`, { method: "PATCH", headers: headers(true), body: JSON.stringify(body) });
    },

    async findTouches(requestId) {
      const res = await call(`${BASE}/data_sources/${config.touchesId}/query`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ filter: { property: TXN_ID, rich_text: { equals: requestId } }, page_size: 5 }),
      });
      const parsed = Query.safeParse(await json(res));
      if (!parsed.success) throw new NotionError("Unexpected Notion response");
      return parsed.data.results.map(touchOf);
    },

    async createTouch(input) {
      const properties: Record<string, unknown> = {
        Touch: { title: text(input.title) },
        Type: { select: { name: input.type } },
        Outcome: { select: { name: input.outcome } },
        Student: { relation: [{ id: guid(input.studentId) }] },
        ...(input.staffId ? { Staff: { relation: [{ id: guid(input.staffId) }] } } : {}),
        ...(input.note.trim() ? { Note: { rich_text: text(input.note) } } : {}),
        [TXN_ID]: { rich_text: text(input.requestId) },
      };
      const res = await call(`${BASE}/pages`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: config.touchesId }, properties }),
      });
      const parsed = z.object({ id: z.guid() }).safeParse(await json(res));
      if (!parsed.success) throw new NotionUncertain("Unexpected Notion response");
      return { id: parsed.data.id };
    },

    async getTouch(id) {
      try {
        return touchOf(await json(await call(`${BASE}/pages/${guid(id)}`, { method: "GET", headers: headers() })));
      } catch (e) {
        if (e instanceof NotionError && e.status === 404) return null;
        throw e;
      }
    },
  };
}
