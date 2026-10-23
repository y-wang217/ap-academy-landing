/**
 * The reply Iris sends (REQ-48, tracker ADR 0069). Pure: no fetch, no Next,
 * no Supabase. Builds one text/plain RFC 5322 message, base64url-encoded the
 * way Gmail's messages.send takes it. Every header value has CR and LF
 * removed, so text from a parent's subject can never add a header.
 */
const DOMAIN = "apacademy.ca";
const HEADER_MAX = 998;
const IRIS_ID = /^<iris-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@apacademy\.ca>$/i;
const PLAIN_ADDRESS = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

/** A reply that cannot be built, for example a parent address that is not one plain address. */
export class ComposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposeError";
  }
}

/** Our own Message-ID for a send. Migration 0028 writes the same shape. */
export const rfcMessageIdFor = (sendId: string) => `<iris-${sendId}@${DOMAIN}>`;

/** True for a Message-ID Iris made, so the sent-mail read leaves it to the send step. */
export const isIrisMessageId = (value: string | null | undefined) => IRIS_ID.test((value ?? "").trim());

/** "Re: " plus the subject, never twice; a missing subject gets a plain one. */
export function replySubject(subject: string | null): string {
  const s = (subject ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!s) return "Re: your message";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/** RFC 2047 B-encoding for a value with any non-ASCII character; ASCII is left as written. */
export function encodeWord(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function headerValue(name: string, value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  const line = `${name}: ${clean}`;
  if (line.length > HEADER_MAX) throw new ComposeError(`${name} is too long`);
  return line;
}

const wrap = (s: string, width: number) => s.match(new RegExp(`.{1,${width}}`, "g"))?.join("\r\n") ?? "";

export type ReplyInput = {
  from: string;
  to: string;
  subject: string | null;
  /** The inbound message's Message-ID; null leaves In-Reply-To and References out. */
  inReplyTo: string | null;
  messageId: string;
  sendId: string;
  /** The full text, signature included. */
  body: string;
  date: Date;
};

/** The base64url raw message for users.messages.send. Throws ComposeError when it cannot be built safely. */
export function buildReply(input: ReplyInput): string {
  const to = input.to.trim().toLowerCase();
  if (!PLAIN_ADDRESS.test(to)) throw new ComposeError("Parent address unusable");
  const headers = [
    headerValue("From", input.from),
    headerValue("To", to),
    headerValue("Subject", encodeWord(replySubject(input.subject))),
    headerValue("Date", input.date.toUTCString()),
    headerValue("Message-ID", input.messageId),
  ];
  const parent = input.inReplyTo?.replace(/[\r\n]+/g, " ").trim();
  if (parent) headers.push(headerValue("In-Reply-To", parent), headerValue("References", parent));
  headers.push(
    headerValue("X-Iris-Send-Id", input.sendId),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  );
  const body = wrap(Buffer.from(input.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"), "utf8").toString("base64"), 76);
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}\r\n`, "utf8").toString("base64url");
}
