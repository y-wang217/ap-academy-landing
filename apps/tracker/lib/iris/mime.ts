import { TUNING } from "../domain/tuning";

/**
 * Reading a Gmail message (REQ-42). Pure: no fetch, no Next, no Supabase.
 * Attachments are never read; only the first text part becomes the body.
 */
export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};

const KEPT = ["From", "Subject", "Date", "Message-ID", "In-Reply-To", "References", "Auto-Submitted", "Precedence", "List-Unsubscribe"] as const;
export type Headers = Partial<Record<(typeof KEPT)[number], string>>;

/** The headers Iris reads, by canonical name. Header names are case-insensitive. */
export function headerMap(payload: GmailPart): Headers {
  const out: Headers = {};
  for (const h of payload.headers ?? []) {
    const name = KEPT.find((k) => k.toLowerCase() === h.name.toLowerCase());
    if (name && out[name] === undefined) out[name] = h.value;
  }
  return out;
}

/** "Ann Lee <Ann@X.com>" gives { email: "ann@x.com", name: "Ann Lee" }. */
export function parseFrom(from: string): { email: string; name: string | null } {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(from);
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1]?.trim() ? m[1].trim() : null };
  return { email: from.trim().toLowerCase(), name: null };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
/** A code point fromCodePoint accepts and that is not a lone surrogate. */
const validCodePoint = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff);

/** Mail is untrusted input: an entity that names no valid character is left as written, never thrown on. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (!lower.startsWith("#")) return whole;
    const n = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return validCodePoint(n) ? String.fromCodePoint(n) : whole;
  });
}

/** HTML reduced to text for Charlie to read. Nothing executes it; React escapes it on display. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|ul|ol|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return tidy(decodeEntities(text));
}

/** Trims each line and keeps at most one blank line in a row. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const charsetOf = (part: GmailPart): string => {
  const type = part.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
  return /charset="?([^";\s]+)"?/i.exec(type)?.[1] ?? "utf-8";
};

function decodePart(part: GmailPart): string {
  const bytes = Buffer.from(part.body?.data ?? "", "base64url");
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charsetOf(part));
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return decoder.decode(bytes);
}

function firstPart(part: GmailPart, mimeType: string): GmailPart | null {
  if (part.filename) return null;
  if (part.mimeType?.toLowerCase() === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const hit = firstPart(child, mimeType);
    if (hit) return hit;
  }
  return null;
}

/** The first text/plain part, else the first text/html part reduced to text, else "". */
export function bodyText(payload: GmailPart): string {
  const plain = firstPart(payload, "text/plain");
  if (plain) return tidy(decodePart(plain));
  const html = firstPart(payload, "text/html");
  return html ? htmlToText(decodePart(html)) : "";
}

export function capBody(text: string): { text: string; truncated: boolean } {
  const max = TUNING.irisBodyMaxChars;
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

export function snippetOf(gmailSnippet: string): string {
  return decodeEntities(gmailSnippet).slice(0, TUNING.irisSnippetChars);
}

/** Bulk, list and machine mail: stored without a body and never shown under Needs you (AC15). */
export function isAutomated(headers: Headers, fromEmail: string): boolean {
  const auto = headers["Auto-Submitted"]?.trim().toLowerCase();
  if (auto && auto !== "no") return true;
  if (/^(bulk|list|junk)$/i.test(headers.Precedence?.trim() ?? "")) return true;
  if (headers["List-Unsubscribe"] !== undefined) return true;
  const local = fromEmail.split("@")[0] ?? "";
  return /no-?reply/.test(local) || local === "mailer-daemon" || local === "postmaster";
}
