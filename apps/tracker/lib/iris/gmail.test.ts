import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { gmailBases, readGmailConfig } from "./config";
import { GMAIL_SCOPE, GMAIL_SEND_SCOPE, GmailError, findSent, getAccessToken, getMessage, gmailPort, gmailSendPort, listMessageIds, sendMessage, signJwt } from "./gmail";

// REQ-42 AC8, AC9: the read-only Gmail client.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config = { clientEmail: "iris-mail@proj.iam.gserviceaccount.com", privateKey: PEM, mailbox: "charlie@apacademy.ca" };
const decode = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString());

type Call = { url: string; method: string; body: string | undefined; signal: AbortSignal | undefined; cache: RequestCache | undefined };
function recorder(handler: (c: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const c = { url: String(url), method: init?.method ?? "GET", body: init?.body ? String(init.body) : undefined, signal: init?.signal ?? undefined, cache: init?.cache };
    calls.push(c);
    return handler(c, calls.length);
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  delete process.env.IRIS_GMAIL_API_BASE;
  delete process.env.IRIS_GMAIL_CLIENT_EMAIL;
  delete process.env.IRIS_GMAIL_PRIVATE_KEY;
  delete process.env.IRIS_GMAIL_MAILBOX;
});

describe("signJwt", () => {
  it("signs an RS256 JWT for the mailbox with the read-only scope", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const jwt = signJwt(config, now);
    const [h, c, sig] = jwt.split(".");
    expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = decode(c);
    expect(claims).toMatchObject({ iss: config.clientEmail, sub: "charlie@apacademy.ca", scope: "https://www.googleapis.com/auth/gmail.readonly", aud: "https://oauth2.googleapis.com/token" });
    expect(claims.iat).toBe(Math.floor(now.getTime() / 1000));
    expect(claims.exp - claims.iat).toBe(3600);
    expect(verify("sha256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    expect(GMAIL_SCOPE).toBe("https://www.googleapis.com/auth/gmail.readonly");
  });

  it("accepts a private key with literal \\n from the env", () => {
    process.env.IRIS_GMAIL_CLIENT_EMAIL = config.clientEmail;
    process.env.IRIS_GMAIL_PRIVATE_KEY = PEM.replace(/\n/g, "\\n");
    process.env.IRIS_GMAIL_MAILBOX = "Charlie@APAcademy.ca";
    const env = readGmailConfig();
    expect(env).not.toBeNull();
    expect(env!.mailbox).toBe("charlie@apacademy.ca");
    expect(() => signJwt(env!, new Date())).not.toThrow();
  });
});

describe("getAccessToken", () => {
  it("posts the jwt-bearer grant and returns the token", async () => {
    const r = recorder(() => json({ access_token: "tok-1", expires_in: 3599, token_type: "Bearer" }));
    expect(await getAccessToken(config, r.fetcher)).toBe("tok-1");
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(r.calls[0].method).toBe("POST");
    const form = new URLSearchParams(r.calls[0].body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(form.get("assertion")?.split(".")).toHaveLength(3);
    expect(r.calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(r.calls[0].cache).toBe("no-store");
  });

  it("turns a refusal into a GmailError with no body text", async () => {
    const r = recorder(() => json({ error: "unauthorized_client", error_description: "charlie@apacademy.ca is not allowed" }, 401));
    const err = await getAccessToken(config, r.fetcher).catch((e) => e);
    expect(err).toBeInstanceOf(GmailError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("Gmail token refused (401)");
    expect(err.message).not.toContain("@");
  });
});

describe("listMessageIds", () => {
  it("passes q and maxResults=100 and follows at most 5 pages", async () => {
    const r = recorder((_c, n) => json({ messages: [{ id: `m${n}`, threadId: `t${n}` }], nextPageToken: `p${n}` }));
    const ids = await listMessageIds("tok", "in:inbox category:primary newer_than:3d", r.fetcher);
    expect(ids).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    expect(r.calls).toHaveLength(5);
    const u = new URL(r.calls[0].url);
    expect(u.origin + u.pathname).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    expect(u.searchParams.get("q")).toBe("in:inbox category:primary newer_than:3d");
    expect(u.searchParams.get("maxResults")).toBe("100");
    expect(new URL(r.calls[1].url).searchParams.get("pageToken")).toBe("p1");
    for (const c of r.calls) expect(c.method).toBe("GET");
  });

  it("returns an empty list for an empty inbox", async () => {
    const r = recorder(() => json({ resultSizeEstimate: 0 }));
    expect(await listMessageIds("tok", "q", r.fetcher)).toEqual([]);
  });

  it("a 403 whose body names an address gives a short GmailError without it", async () => {
    const r = recorder(() => new Response(`{"error":{"message":"Delegation denied for charlie@apacademy.ca ${"x".repeat(500)}"}}`, { status: 403 }));
    const err = await listMessageIds("tok", "q", r.fetcher).catch((e) => e);
    expect(err).toBeInstanceOf(GmailError);
    expect(err.status).toBe(403);
    expect(err.message).toBe("Gmail returned 403");
    expect(err.message.length).toBeLessThanOrEqual(300);
  });

  it("a network throw gives 'Gmail request failed'", async () => {
    const fetcher = (async () => { throw new TypeError("fetch failed: ECONNRESET charlie@apacademy.ca"); }) as unknown as typeof fetch;
    const err = await listMessageIds("tok", "q", fetcher).catch((e) => e);
    expect(err).toBeInstanceOf(GmailError);
    expect(err.message).toBe("Gmail request failed");
    expect(err.status).toBeUndefined();
  });
});

describe("getMessage", () => {
  it("asks for format=full and parses the message", async () => {
    const msg = { id: "m1", threadId: "t1", internalDate: "1760961600000", snippet: "hi", payload: { mimeType: "text/plain", headers: [{ name: "From", value: "a@x.com" }], body: { data: "aGk" } } };
    const r = recorder(() => json(msg));
    const got = await getMessage("tok", "m1", r.fetcher);
    expect(got.id).toBe("m1");
    expect(got.payload.headers?.[0].value).toBe("a@x.com");
    const u = new URL(r.calls[0].url);
    expect(u.pathname).toBe("/gmail/v1/users/me/messages/m1");
    expect(u.searchParams.get("format")).toBe("full");
    expect(r.calls[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("an unexpected shape is a GmailError", async () => {
    const r = recorder(() => json({ nope: true }));
    await expect(getMessage("tok", "m1", r.fetcher)).rejects.toBeInstanceOf(GmailError);
  });
});

describe("IRIS_GMAIL_API_BASE", () => {
  it("rewrites both Google hosts", async () => {
    process.env.IRIS_GMAIL_API_BASE = "http://127.0.0.1:54334/";
    expect(gmailBases()).toEqual({ token: "http://127.0.0.1:54334/token", api: "http://127.0.0.1:54334/gmail/v1" });
    const r = recorder((c) => (c.url.endsWith("/token") ? json({ access_token: "t" }) : json({ messages: [] })));
    await getAccessToken(config, r.fetcher);
    await listMessageIds("t", "q", r.fetcher);
    expect(r.calls.map((c) => new URL(c.url).origin)).toEqual(["http://127.0.0.1:54334", "http://127.0.0.1:54334"]);
    expect(decode(signJwt(config, new Date()).split(".")[1]).aud).toBe("http://127.0.0.1:54334/token");
  });
});

// REQ-48 AC2, AC4, AC9: two tokens with one scope each; send and the verify search.
describe("send scope", () => {
  const scopeOf = (body: string | undefined) => decode(new URLSearchParams(body).get("assertion")!.split(".")[1]).scope;

  it("the default token is read-only; the send token carries gmail.send only", async () => {
    expect(GMAIL_SEND_SCOPE).toBe("https://www.googleapis.com/auth/gmail.send");
    const r = recorder(() => json({ access_token: "t" }));
    await getAccessToken(config, r.fetcher);
    await gmailPort(config, r.fetcher).token();
    await gmailSendPort(config, r.fetcher).readToken();
    await gmailSendPort(config, r.fetcher).sendToken();
    expect(r.calls.map((c) => scopeOf(c.body))).toEqual([GMAIL_SCOPE, GMAIL_SCOPE, GMAIL_SCOPE, GMAIL_SEND_SCOPE]);
  });
});

describe("sendMessage", () => {
  it("posts { raw, threadId } to messages/send and parses the id", async () => {
    const r = recorder(() => json({ id: "gm-1", threadId: "t1", labelIds: ["SENT"] }));
    expect(await sendMessage("tok", "cmF3", "t1", r.fetcher)).toEqual({ id: "gm-1", threadId: "t1" });
    expect(new URL(r.calls[0].url).pathname).toBe("/gmail/v1/users/me/messages/send");
    expect(r.calls[0].method).toBe("POST");
    expect(JSON.parse(r.calls[0].body!)).toEqual({ raw: "cmF3", threadId: "t1" });
    expect(r.calls[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("a non-2xx answer is a status-only GmailError", async () => {
    const r = recorder(() => new Response(`{"error":{"message":"bad for charlie@apacademy.ca"}}`, { status: 500 }));
    const err = await sendMessage("tok", "cmF3", "t1", r.fetcher).catch((e) => e);
    expect(err).toBeInstanceOf(GmailError);
    expect(err.message).toBe("Gmail returned 500");
  });
});

describe("findSent", () => {
  const RFC = "<iris-8f2c6a1e-1111-4111-8111-111111111111@apacademy.ca>";
  const SEND = "8f2c6a1e-1111-4111-8111-111111111111";

  it("searches rfc822msgid first and returns the first id", async () => {
    const r = recorder(() => json({ messages: [{ id: "gm-7", threadId: "t1" }] }));
    expect(await findSent("tok", RFC, "t1", SEND, r.fetcher)).toBe("gm-7");
    expect(new URL(r.calls[0].url).searchParams.get("q")).toBe("rfc822msgid:iris-8f2c6a1e-1111-4111-8111-111111111111@apacademy.ca");
    expect(r.calls).toHaveLength(1);
  });

  it("falls back to the thread's Message-ID and X-Iris-Send-Id headers", async () => {
    const r = recorder((c) =>
      c.url.includes("/threads/")
        ? json({ messages: [
            { id: "in-1", payload: { headers: [{ name: "Message-ID", value: "<abc@mail.example>" }] } },
            { id: "gm-8", payload: { headers: [{ name: "Message-Id", value: "<rewritten@mail.gmail.com>" }, { name: "X-Iris-Send-Id", value: SEND }] } },
          ] })
        : json({ resultSizeEstimate: 0 }),
    );
    expect(await findSent("tok", RFC, "t1", SEND, r.fetcher)).toBe("gm-8");
    const u = new URL(r.calls[1].url);
    expect(u.pathname).toBe("/gmail/v1/users/me/threads/t1");
    expect(u.searchParams.get("format")).toBe("metadata");
    expect(u.searchParams.getAll("metadataHeaders")).toEqual(["Message-ID", "X-Iris-Send-Id"]);
  });

  it("returns null when neither finds it, and throws on a Gmail error", async () => {
    const none = recorder((c) => (c.url.includes("/threads/") ? json({ messages: [] }) : json({})));
    expect(await findSent("tok", RFC, "t1", SEND, none.fetcher)).toBeNull();
    const broken = recorder(() => new Response("{}", { status: 503 }));
    await expect(findSent("tok", RFC, "t1", SEND, broken.fetcher)).rejects.toBeInstanceOf(GmailError);
  });
});
