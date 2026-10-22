import "server-only";
import { sign } from "node:crypto";
import { z } from "zod";
import { gmailBases, type GmailConfig } from "./config";
import type { GmailPort } from "./intake";
import type { GmailPart } from "./mime";

/**
 * Gmail, read-only (REQ-42, tracker ADR 0059). A service account with
 * domain-wide delegation acts as the mailbox. The JWT is signed with
 * node:crypto and every call is plain fetch with a 10 second timeout, parsed
 * with Zod. The only calls are messages.list and messages.get: Iris cannot
 * change, label or send mail until Iris 8/9 widens the scope.
 */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TIMEOUT_MS = 10_000;
const MAX_LIST_PAGES = 5;

/** A Gmail or token failure. The message is built from the status only, never from a response body. */
export class GmailError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message.slice(0, 300));
    this.name = "GmailError";
  }
}

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

export function signJwt(config: GmailConfig, now: Date): string {
  const iat = Math.floor(now.getTime() / 1000);
  const head = b64({ alg: "RS256", typ: "JWT" });
  const claims = b64({ iss: config.clientEmail, sub: config.mailbox, scope: GMAIL_SCOPE, aud: gmailBases().token, iat, exp: iat + 3600 });
  const signature = sign("sha256", Buffer.from(`${head}.${claims}`), config.privateKey).toString("base64url");
  return `${head}.${claims}.${signature}`;
}

async function call(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetcher(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new GmailError("Gmail request failed");
  }
}

async function parse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new GmailError("Unexpected Gmail response", res.status);
  return parsed.data;
}

const Token = z.object({ access_token: z.string().min(1) });

/** One token per run, held in memory only. */
export async function getAccessToken(config: GmailConfig, fetcher: typeof fetch = fetch, now: Date = new Date()): Promise<string> {
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(config, now) });
  const res = await call(fetcher, gmailBases().token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new GmailError(`Gmail token refused (${res.status})`, res.status);
  return (await parse(res, Token)).access_token;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const ListPage = z.object({
  messages: z.array(z.object({ id: z.string().min(1), threadId: z.string().min(1) })).optional(),
  nextPageToken: z.string().optional(),
});

/** The most ids one list returns: 5 pages of 100. A list this long may have been cut (REQ-45). */
export const MAX_LIST_IDS = MAX_LIST_PAGES * 100;

/** Message ids for a query, newest first as Gmail gives them, across at most 5 pages. */
export async function listMessageIds(token: string, q: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  return (await listMessageRefs(token, q, fetcher)).map((r) => r.id);
}

/** Message ids with their thread ids, from the same messages.list call (REQ-45). */
export async function listMessageRefs(token: string, q: string, fetcher: typeof fetch = fetch): Promise<{ id: string; threadId: string }[]> {
  const ids: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({ q, maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await call(fetcher, `${gmailBases().api}/users/me/messages?${params}`, { method: "GET", headers: auth(token) });
    if (!res.ok) throw new GmailError(`Gmail returned ${res.status}`, res.status);
    const data = await parse(res, ListPage);
    ids.push(...(data.messages ?? []).map((m) => ({ id: m.id, threadId: m.threadId })));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

const Part: z.ZodType<GmailPart> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    body: z.object({ data: z.string().optional(), size: z.number().optional(), attachmentId: z.string().optional() }).optional(),
    parts: z.array(Part).optional(),
  }),
);

export const GmailMessage = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  internalDate: z.string().regex(/^\d+$/),
  snippet: z.string().default(""),
  /** SENT marks mail the mailbox itself sent (REQ-44): only that supersedes a draft. */
  labelIds: z.array(z.string()).optional(),
  payload: Part,
});
export type GmailMessage = z.infer<typeof GmailMessage>;

export async function getMessage(token: string, id: string, fetcher: typeof fetch = fetch): Promise<GmailMessage> {
  const res = await call(fetcher, `${gmailBases().api}/users/me/messages/${encodeURIComponent(id)}?format=full`, { method: "GET", headers: auth(token) });
  if (!res.ok) throw new GmailError(`Gmail returned ${res.status}`, res.status);
  return parse(res, GmailMessage);
}

/** The Gmail port the intake uses, bound to one service account. */
export function gmailPort(config: GmailConfig, fetcher: typeof fetch = fetch): GmailPort {
  return {
    token: () => getAccessToken(config, fetcher),
    list: (token, q) => listMessageIds(token, q, fetcher),
    listRefs: (token, q) => listMessageRefs(token, q, fetcher),
    get: (token, id) => getMessage(token, id, fetcher),
  };
}
