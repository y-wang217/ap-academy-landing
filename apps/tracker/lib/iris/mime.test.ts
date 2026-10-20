import { describe, expect, it } from "vitest";
import { bodyText, capBody, headerMap, htmlToText, isAutomated, parseFrom, snippetOf, type GmailPart } from "./mime";

// REQ-42 AC14, AC15: the pure parts of reading a Gmail message.
const b64 = (s: string, encoding: BufferEncoding = "utf8") => Buffer.from(s, encoding).toString("base64url");
const part = (mimeType: string, text: string, extra: Partial<GmailPart> = {}): GmailPart => ({ mimeType, body: { data: b64(text) }, ...extra });

describe("bodyText", () => {
  it("prefers text/plain over HTML in a multipart/alternative", () => {
    const payload: GmailPart = { mimeType: "multipart/alternative", parts: [part("text/html", "<p>From <b>HTML</b></p>"), part("text/plain", "From plain")] };
    expect(bodyText(payload)).toBe("From plain");
  });

  it("reduces HTML-only mail to text", () => {
    const html = "<html><head><style>p{color:red}</style><script>alert(1)</script></head><body><p>Hi&nbsp;Charlie,</p><div>Sam is sick &amp; can&#39;t come<br>today.</div><ul><li>one</li><li>two</li></ul></body></html>";
    const text = bodyText({ mimeType: "multipart/alternative", parts: [part("text/html", html)] });
    expect(text).toBe("Hi Charlie,\nSam is sick & can't come\ntoday.\none\ntwo");
    expect(text).not.toMatch(/alert|color:red|</);
  });

  it("walks nested multiparts depth-first", () => {
    const payload: GmailPart = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "multipart/related", parts: [{ mimeType: "multipart/alternative", parts: [part("text/html", "<p>x</p>"), part("text/plain", "nested plain")] }] },
        part("text/plain", "later plain"),
      ],
    };
    expect(bodyText(payload)).toBe("nested plain");
  });

  it("decodes base64url and honours an ISO-8859-1 charset", () => {
    const latin = { mimeType: "text/plain", headers: [{ name: "Content-Type", value: 'text/plain; charset="ISO-8859-1"' }], body: { data: b64("Café à 5h", "latin1") } };
    expect(bodyText(latin)).toBe("Café à 5h");
    expect(bodyText(part("text/plain", "über ü?_-"))).toBe("über ü?_-");
  });

  it("never reads an attachment", () => {
    const payload: GmailPart = { mimeType: "multipart/mixed", parts: [part("text/plain", "secret file", { filename: "notes.txt" }), part("text/plain", "the body")] };
    expect(bodyText(payload)).toBe("the body");
    expect(bodyText({ mimeType: "multipart/mixed", parts: [part("text/plain", "only a file", { filename: "a.txt" })] })).toBe("");
  });

  it("htmlToText collapses blank lines", () => {
    expect(htmlToText("<p>a</p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
  });
});

describe("capBody and snippetOf", () => {
  it("caps a 25,000-character body at 20,000 and marks it truncated", () => {
    expect(capBody("x".repeat(25000))).toEqual({ text: "x".repeat(20000), truncated: true });
    expect(capBody("short")).toEqual({ text: "short", truncated: false });
  });
  it("decodes entities and caps a snippet at 200", () => {
    expect(snippetOf("Tom &amp; Jerry &#39;hi&#39;")).toBe("Tom & Jerry 'hi'");
    expect(snippetOf("y".repeat(300))).toHaveLength(200);
  });
});

describe("parseFrom", () => {
  it.each([
    ["Ann Lee <Ann@X.com>", { email: "ann@x.com", name: "Ann Lee" }],
    ['"Lee, Ann" <ann@x.com>', { email: "ann@x.com", name: "Lee, Ann" }],
    ["ann@x.com", { email: "ann@x.com", name: null }],
    ["  ANN@X.COM ", { email: "ann@x.com", name: null }],
  ])("%s", (from, want) => expect(parseFrom(from)).toEqual(want));
});

describe("headerMap", () => {
  it("keeps the headers Iris reads, by canonical name", () => {
    const h = headerMap({ mimeType: "text/plain", headers: [{ name: "from", value: "a@x.com" }, { name: "Subject", value: "Hi" }, { name: "X-Other", value: "no" }, { name: "list-unsubscribe", value: "<mailto:u@x.com>" }] });
    expect(h.From).toBe("a@x.com");
    expect(h.Subject).toBe("Hi");
    expect(h["List-Unsubscribe"]).toBe("<mailto:u@x.com>");
    expect(Object.keys(h)).not.toContain("X-Other");
  });
});

describe("isAutomated", () => {
  it.each<[Record<string, string>, string, boolean]>([
    [{ "Auto-Submitted": "auto-replied" }, "ann@x.com", true],
    [{ "Auto-Submitted": "no" }, "ann@x.com", false],
    [{ Precedence: "bulk" }, "ann@x.com", true],
    [{ Precedence: "list" }, "ann@x.com", true],
    [{ Precedence: "junk" }, "ann@x.com", true],
    [{ "List-Unsubscribe": "<https://x.com/u>" }, "ann@x.com", true],
    [{}, "noreply@x.com", true],
    [{}, "no-reply@x.com", true],
    [{}, "mailer-daemon@googlemail.com", true],
    [{}, "postmaster@x.com", true],
    [{}, "ann@x.com", false],
  ])("%j from %s is %s", (headers, from, want) => expect(isAutomated(headers, from)).toBe(want));
});
