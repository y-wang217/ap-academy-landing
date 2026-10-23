import "server-only";
import { sign } from "node:crypto";
import { z } from "zod";
import { gmailBases, type GmailConfig } from "./config";
import type { GmailPort } from "./intake";
import type { GmailPart } from "./mime";

/**
 * Gmail (REQ-42, tracker ADR 0059; widened by ADR 0069 for REQ-48). A service
 * account with domain-wide delegation acts as the mailbox. The JWT is signed
 * with node:crypto and every call is plain fetch with a 10 second timeout,
 * parsed with Zod. Each token carries one scope. The read-only token makes
 * messages.list, messages.get and threads.get; the send token makes only
 * messages.send, for an approved reply. Iris never changes, labels or
 * deletes mail.
 */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
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

export function signJwt(config: GmailConfig, now: Date, scope: string = GMAIL_SCOPE): string {
  const iat = Math.floor(now.getTime() / 1000);
  const head = b64({ alg: "RS256", typ: "JWT" });
  const claims = b64({ iss: config.clientEmail, sub: config.mailbox, scope, aud: gmailBases().token, iat, exp: iat + 3600 });
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

/** One token per run and scope, held in memory only. Read-only unless the send scope is asked for. */
export async function getAccessToken(config: GmailConfig, fetcher: typeof fetch = fetch, now: Date = new Date(), scope: string = GMAIL_SCOPE): Promise<string> {
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(config, now, scope) });
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

const Sent = z.object({ id: z.string().min(1), threadId: z.string().min(1) });

/** users.messages.send with the send token: the raw message into the parent's thread. A non-2xx answer throws a status-only error. */
export async function sendMessage(token: string, raw: string, threadId: string | null, fetcher: typeof fetch = fetch): Promise<{ id: string; threadId: string }> {
  const res = await call(fetcher, `${gmailBases().api}/users/me/messages/send`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  });
  if (!res.ok) throw new GmailError(`Gmail returned ${res.status}`, res.status);
  return parse(res, Sent);
}

const ThreadMeta = z.object({
  messages: z.array(z.object({ id: z.string().min(1), payload: z.object({ headers: z.array(z.object({ name: z.string(), value: z.string() })).optional() }).optional() })).optional(),
});

/**
 * Whether a send already reached Gmail, with the read-only token. First a
 * search for our Message-ID; then, in case Gmail rewrote it, the thread's
 * Message-ID and X-Iris-Send-Id headers. Returns the Gmail id or null, and
 * throws on a Gmail error, so "unknown" never reads as "not sent".
 */
export async function findSent(token: string, rfcMessageId: string, gmailThreadId: string | null, sendId: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const bare = rfcMessageId.replace(/^<|>$/g, "");
  const found = await listMessageIds(token, `rfc822msgid:${bare}`, fetcher);
  if (found.length > 0) return found[0];
  if (!gmailThreadId) return null;
  const params = new URLSearchParams([["format", "metadata"], ["metadataHeaders", "Message-ID"], ["metadataHeaders", "X-Iris-Send-Id"]]);
  const res = await call(fetcher, `${gmailBases().api}/users/me/threads/${encodeURIComponent(gmailThreadId)}?${params}`, { method: "GET", headers: auth(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new GmailError(`Gmail returned ${res.status}`, res.status);
  const thread = await parse(res, ThreadMeta);
  for (const m of thread.messages ?? []) {
    for (const h of m.payload?.headers ?? []) {
      const name = h.name.toLowerCase();
      if ((name === "message-id" && h.value.trim() === rfcMessageId) || (name === "x-iris-send-id" && h.value.trim() === sendId)) return m.id;
    }
  }
  return null;
}

/** What the send step needs from Gmail (REQ-48). Two tokens, one scope each. */
export type GmailSendPort = {
  readToken(): Promise<string>;
  sendToken(): Promise<string>;
  send(token: string, raw: string, threadId: string | null): Promise<{ id: string; threadId: string }>;
  findSent(token: string, rfcMessageId: string, gmailThreadId: string | null, sendId: string): Promise<string | null>;
};

/** The send port, bound to one service account. The send token is fetched only when a send is about to happen. */
export function gmailSendPort(config: GmailConfig, fetcher: typeof fetch = fetch): GmailSendPort {
  return {
    readToken: () => getAccessToken(config, fetcher),
    sendToken: () => getAccessToken(config, fetcher, new Date(), GMAIL_SEND_SCOPE),
    send: (token, raw, threadId) => sendMessage(token, raw, threadId, fetcher),
    findSent: (token, rfcMessageId, gmailThreadId, sendId) => findSent(token, rfcMessageId, gmailThreadId, sendId, fetcher),
  };
}
