import { describe, expect, it } from "vitest";
import { buildReply, ComposeError, encodeWord, isIrisMessageId, rfcMessageIdFor, replySubject, type ReplyInput } from "./compose";
import { withSignature } from "./draft-rules";
import { SIGNATURE } from "./policy";

// REQ-48 AC2: the raw reply Gmail receives.
const SEND = "8f2c6a1e-1111-4111-8111-111111111111";
const base: ReplyInput = {
  from: "charlie@apacademy.ca",
  to: "Ann@Example.com",
  subject: "Sam is sick",
  inReplyTo: "<abc@mail.example>",
  messageId: rfcMessageIdFor(SEND),
  sendId: SEND,
  body: withSignature("Hi Ann,\n\nThanks for letting me know."),
  date: new Date("2026-10-22T19:00:00Z"),
};

/** Splits the decoded message into header lines and the decoded body. */
function decode(raw: string) {
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const [head, body] = text.split("\r\n\r\n");
  return { text, headers: head.split("\r\n"), body: Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8") };
}
const header = (lines: string[], name: string) => lines.find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}: `))?.slice(name.length + 2);

describe("buildReply", () => {
  it("writes every header, in order, with CRLF line ends", () => {
    const { text, headers } = decode(buildReply(base));
    expect(headers.map((l) => l.split(":")[0])).toEqual([
      "From", "To", "Subject", "Date", "Message-ID", "In-Reply-To", "References", "X-Iris-Send-Id", "MIME-Version", "Content-Type", "Content-Transfer-Encoding",
    ]);
    expect(header(headers, "From")).toBe("charlie@apacademy.ca");
    expect(header(headers, "To")).toBe("ann@example.com");
    expect(header(headers, "Subject")).toBe("Re: Sam is sick");
    expect(header(headers, "Message-ID")).toBe(`<iris-${SEND}@apacademy.ca>`);
    expect(header(headers, "In-Reply-To")).toBe("<abc@mail.example>");
    expect(header(headers, "References")).toBe("<abc@mail.example>");
    expect(header(headers, "X-Iris-Send-Id")).toBe(SEND);
    expect(header(headers, "MIME-Version")).toBe("1.0");
    expect(header(headers, "Content-Type")).toBe("text/plain; charset=UTF-8");
    expect(header(headers, "Date")).toBe("Thu, 22 Oct 2026 19:00:00 GMT");
    expect(text.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("the body decodes to the draft with the signature once, and no automated line", () => {
    const { body } = decode(buildReply(base));
    expect(body.replace(/\r\n/g, "\n")).toBe(`Hi Ann,\n\nThanks for letting me know.\n\n${SIGNATURE}`);
    expect(body).not.toMatch(/automat|sent by iris/i);
  });

  it("wraps the base64 body at 76 characters", () => {
    const { text } = decode(buildReply({ ...base, body: "x".repeat(500) }));
    const lines = text.split("\r\n\r\n")[1].split("\r\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(76);
  });

  it("leaves In-Reply-To and References out when the inbound id is null", () => {
    const { headers } = decode(buildReply({ ...base, inReplyTo: null }));
    expect(header(headers, "In-Reply-To")).toBeUndefined();
    expect(header(headers, "References")).toBeUndefined();
  });

  it("strips CR and LF from header values, so a subject cannot add a header", () => {
    const { headers } = decode(buildReply({ ...base, subject: "Hi\r\nBcc: evil@example.com", inReplyTo: "<a@b>\r\nX-Evil: 1" }));
    expect(headers.some((l) => /^bcc:/i.test(l) || /^x-evil:/i.test(l))).toBe(false);
    expect(header(headers, "Subject")).toBe("Re: Hi Bcc: evil@example.com");
  });

  it("B-encodes a non-ASCII subject", () => {
    const { headers } = decode(buildReply({ ...base, subject: "Café à 5h" }));
    const subject = header(headers, "Subject")!;
    expect(subject).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    expect(Buffer.from(subject.slice(10, -2), "base64").toString("utf8")).toBe("Re: Café à 5h");
  });

  it("throws ComposeError when the parent address is not one plain address", () => {
    for (const to of ["", "ann", "Ann <ann@example.com>", "a@x.com, b@y.com", "a@x.com\r\nBcc: c@d.com"]) {
      expect(() => buildReply({ ...base, to }), to).toThrow(ComposeError);
    }
  });

  it("throws on a header over 998 characters", () => {
    expect(() => buildReply({ ...base, subject: "x".repeat(1000) })).toThrow(ComposeError);
  });
});

describe("replySubject and ids", () => {
  it("adds Re: once, case-insensitively, and names a missing subject", () => {
    expect(replySubject("Sam is sick")).toBe("Re: Sam is sick");
    expect(replySubject("Re: Sam is sick")).toBe("Re: Sam is sick");
    expect(replySubject("RE: Sam")).toBe("RE: Sam");
    expect(replySubject(null)).toBe("Re: your message");
    expect(replySubject("  ")).toBe("Re: your message");
  });

  it("encodeWord leaves ASCII alone", () => {
    expect(encodeWord("Re: plain")).toBe("Re: plain");
  });

  it("our Message-ID is recognised, others are not", () => {
    expect(isIrisMessageId(rfcMessageIdFor(SEND))).toBe(true);
    expect(isIrisMessageId(` ${rfcMessageIdFor(SEND)} `)).toBe(true);
    expect(isIrisMessageId("<iris-x@apacademy.ca>")).toBe(false);
    expect(isIrisMessageId("<abc@mail.example>")).toBe(false);
    expect(isIrisMessageId(undefined)).toBe(false);
  });
});
