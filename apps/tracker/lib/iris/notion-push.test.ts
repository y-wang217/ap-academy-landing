import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TUNING } from "../domain/tuning";
import type { FamilyEntry } from "../notion/parents";
import { dayTitle, refOf, runPush, type PushDeps } from "./notion-push";
import { POLICY_VERSION, SIGNATURE } from "./policy";
import type { MessageInsert, MessagePatch } from "./store";
import { fakeIrisStore } from "./store.fake";

// REQ-44 AC16 to AC22: the Notion phone backup, against a fetch spy that behaves like Notion.
const CONFIG = { token: "secret", workId: "3031b455-9be0-4f8d-b200-70fcfcf1a0b8", logId: "03257601-dfe2-42dd-affb-49dcfe1d2dcf" };
const CHARLIE = "c0ffee00-0000-4000-8000-000000000001";
const SAM = "33333333-3333-4333-8333-333333333333";
const FAMILIES: FamilyEntry[] = [{ studentId: SAM, studentName: "Sam Park", stage: "Active", parentEmail: "pat@y.com", parentName: "Pat Park" }];
const T0 = Date.parse("2026-10-21T16:00:00Z");
const DAY = "2026-10-21";
const SENTINEL = "SENTINEL-PARENT-TEXT-7731";

type Call = { method: string; path: string; body: Record<string, unknown> | undefined };
function notion() {
  const calls: Call[] = [];
  const pages = new Map<string, { ds: string; props: Record<string, unknown> }>();
  const blocks = new Map<string, { parent: string; type: string; text: string }>();
  const fail = new Set<string>();
  let failNext: string | null = null;
  const textOf = (rt: unknown) => ((rt as { text?: { content: string } }[]) ?? []).map((r) => r.text?.content ?? "").join("");
  const fetcher = (async (url: string, init: RequestInit) => {
    const path = url.replace(/^https:\/\/api\.notion\.com\/v1/, "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const method = init.method ?? "GET";
    calls.push({ method, path, body });
    const key = `${method} ${path.replace(/[0-9a-f-]{36}/g, ":id").replace(/\?.*$/, "")}`;
    if (fail.has(key) || failNext === key) {
      if (failNext === key) failNext = null;
      return new Response("{}", { status: 500 });
    }
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
    if (method === "POST" && path === "/pages") {
      const id = randomUUID();
      pages.set(id, { ds: body.parent.data_source_id, props: body.properties });
      return json({ id, url: `https://notion.so/${id}` });
    }
    if (method === "PATCH" && /^\/pages\//.test(path)) return json({});
    if (method === "POST" && /\/query$/.test(path)) {
      const hits = [...pages.entries()].filter(([, p]) => p.ds === CONFIG.workId && textOf((p.props.Name as { title: unknown }).title) === body.filter.title.equals);
      return json({ results: hits.map(([id]) => ({ id })) });
    }
    if (method === "POST" && path === "/comments") return json({ id: randomUUID() });
    const m = /^\/blocks\/([0-9a-f-]{36})(\/children)?/.exec(path);
    if (m && m[2] && method === "PATCH") {
      const added = (body.children as { type: string; to_do?: { rich_text: unknown } }[]).map((c) => {
        const id = randomUUID();
        blocks.set(id, { parent: m[1], type: c.type, text: textOf(c.to_do?.rich_text) });
        return { id };
      });
      return json({ results: added });
    }
    if (m && m[2] && method === "GET") {
      return json({ results: [...blocks.entries()].filter(([, b]) => b.parent === m[1]).map(([id, b]) => ({ id, type: b.type, to_do: { checked: false, rich_text: [{ plain_text: b.text }] } })), has_more: false, next_cursor: null });
    }
    if (m && method === "DELETE") {
      if (!blocks.has(m[1])) return new Response("{}", { status: 404 });
      blocks.delete(m[1]);
      return json({});
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, pages, blocks, fail, failOnce: (k: string) => (failNext = k), fetcher };
}

type Msg = MessageInsert & Partial<MessagePatch>;
function world(o: { charlie?: string | null } = {}) {
  const db = fakeIrisStore();
  const n = notion();
  let clock = T0;
  const deps = (x: Partial<PushDeps> = {}): PushDeps => ({
    store: db.store, config: CONFIG, charlieUserId: o.charlie === undefined ? CHARLIE : o.charlie, siteUrl: "https://www.apacademy.ca", mailbox: "charlie@apacademy.ca",
    directory: async () => FAMILIES, now: () => new Date(clock), fetcher: n.fetcher, ...x,
  });
  let i = 0;
  const add = async (m: Partial<Msg> = {}, draft: string | null = "Hi Pat,\n\nThanks for letting me know.") => {
    const thread = await db.store.saveThread(`g-thread-${++i}`, { matchState: "matched", notionStudentIds: [SAM], parentEmail: "pat@y.com", subject: "Sick", firstReceivedAt: "x", lastInboundAt: "x", purgeAt: "2027-01-01T00:00:00Z" });
    const r = await db.store.insertMessage({
      threadId: thread.id, gmailMessageId: `m${i}`, rfcMessageId: null, direction: "inbound", source: "external", fromEmail: "pat@y.com", fromName: "Pat Park",
      receivedAt: new Date(T0 - 3600_000 + i * 1000).toISOString(), bodyText: `Sam is sick. ${SENTINEL}`, bodyTruncated: false, snippet: SENTINEL,
      state: "drafted", stateChangedAt: null, escalationReason: null, policyVersion: POLICY_VERSION, handledAt: null, retryCount: 0, lastError: null, purgeAt: "2027-01-01T00:00:00Z",
    });
    await db.store.updateMessage(r.id!, { intent: "cancellation", notionStudentId: SAM, ...m });
    if (draft) await db.store.insertDraft({ messageId: r.id!, replyType: "cancellation", bodyText: draft, policyVersion: POLICY_VERSION });
    return r.id!;
  };
  const todos = () => [...n.blocks.values()].filter((b) => b.type === "to_do");
  return { db, n, deps, add, todos, setClock: (ms: number) => (clock = ms), run: (x: Partial<PushDeps> = {}) => runPush(deps(x)) };
}
const bodies = (calls: Call[]) => calls.map((c) => JSON.stringify(c.body ?? {}));

describe("runPush: the day page (AC16)", () => {
  it("creates one Work page per Toronto date with the listed properties, and reuses it", async () => {
    const w = world();
    await w.add();
    await w.run();
    await w.add();
    await w.run();
    const work = [...w.n.pages.values()].filter((p) => p.ds === CONFIG.workId);
    expect(work).toHaveLength(1);
    expect(work[0].props).toMatchObject({
      Area: { select: { name: "Delivery" } }, Type: { select: { name: "Recurring" } }, State: { select: { name: "Next" } },
      Owner: { rich_text: [{ text: { content: "Charlie" } }] }, Alignment: { select: { name: "Maintenance" } }, "Due / Review": { date: { start: DAY } },
    });
    expect(JSON.stringify(work[0].props)).toContain(dayTitle(DAY));
    expect(dayTitle(DAY)).toBe("Iris replies — 2026-10-21");
  });

  it("adopts the page by exact title after a lost write", async () => {
    const w = world();
    await w.add();
    await w.run();
    w.db.pushDays.clear();
    await w.add();
    await w.run();
    expect([...w.n.pages.values()].filter((p) => p.ds === CONFIG.workId)).toHaveLength(1);
  });
});

describe("runPush: one to-do and one comment per item (AC17, AC18)", () => {
  it("a drafted message gets a to-do with names, links, ref and the signed reply in a code block", async () => {
    const w = world();
    const id = await w.add();
    expect(await w.run()).toMatchObject({ pushed: 1, failed: 0 });
    const create = w.n.calls.find((c) => c.method === "PATCH" && /\/children$/.test(c.path))!;
    const todo = (create.body!.children as { to_do: { rich_text: { text: { content: string } }[]; checked: boolean; children: { type: string }[] } }[])[0].to_do;
    expect(todo.rich_text[0].text.content).toBe(`Pat re Sam: Cancellation (Draft waiting) ref ${refOf(id)}`);
    expect(todo.checked).toBe(false);
    const json = JSON.stringify(todo.children);
    expect(json).toContain(`https://www.apacademy.ca/tracker/iris/messages/${id}`);
    expect(json).toContain("mail.google.com");
    expect(json).toContain(JSON.stringify(`Hi Pat,\n\nThanks for letting me know.\n\n${SIGNATURE}`).slice(1, -1));
    expect(todo.children.map((c) => c.type)).toContain("code");
  });

  it("an escalation without a draft has no code block; an unknown sender says so with no address", async () => {
    const w = world();
    await w.add({ state: "escalated", escalationReason: "unknown_sender", intent: null, notionStudentId: null, fromEmail: "stranger@z.com" }, null);
    await w.run();
    const create = w.n.calls.find((c) => c.method === "PATCH" && /\/children$/.test(c.path))!;
    const json = JSON.stringify(create.body);
    expect(json).toContain("Unknown sender re -");
    expect(json).not.toContain('"code"');
    expect(json).not.toContain("stranger@z.com");
  });

  it("automated mail and no_reply_needed get none", async () => {
    const w = world();
    await w.add({ state: "escalated", escalationReason: "automated", handledAt: new Date(T0).toISOString() }, null);
    await w.add({ state: "escalated", escalationReason: "no_reply_needed", handledAt: new Date(T0).toISOString() }, null);
    await w.run();
    expect(w.todos()).toHaveLength(0);
  });

  it("each new to-do gets one comment mentioning Charlie, with the ref and intent and no names", async () => {
    const w = world();
    const id = await w.add();
    await w.run();
    const comments = w.n.calls.filter((c) => c.path === "/comments");
    expect(comments).toHaveLength(1);
    const rt = comments[0].body!.rich_text as { type: string; mention?: { user: { id: string } }; text?: { content: string } }[];
    expect(rt[0]).toEqual({ type: "mention", mention: { type: "user", user: { object: "user", id: CHARLIE } } });
    expect(rt[1].text!.content).toBe(` New Iris item ref ${refOf(id)}: Cancellation`);
    expect(JSON.stringify(comments[0].body)).not.toMatch(/Pat|Sam/);
  });

  it("with NOTION_CHARLIE_USER_ID unset, to-dos are written with no comment", async () => {
    const w = world({ charlie: null });
    await w.add();
    expect(await w.run()).toMatchObject({ pushed: 1 });
    expect(w.n.calls.filter((c) => c.path === "/comments")).toHaveLength(0);
  });
});

describe("runPush: what never reaches Notion (AC19)", () => {
  it("no request carries the parent's text or address, checked only on creation, and no to-do is edited", async () => {
    const w = world();
    await w.add();
    await w.add({ state: "escalated", escalationReason: "flagged", flags: ["refund"] }, null);
    await w.run();
    await w.run();
    for (const b of bodies(w.n.calls)) {
      expect(b).not.toContain(SENTINEL);
      expect(b).not.toContain("pat@y.com");
    }
    const withChecked = w.n.calls.filter((c) => JSON.stringify(c.body ?? {}).includes('"checked"'));
    expect(withChecked.every((c) => c.method === "PATCH" && /\/children$/.test(c.path))).toBe(true);
    const todoIds = [...w.n.blocks.keys()];
    expect(w.n.calls.some((c) => c.method === "PATCH" && todoIds.some((id) => c.path === `/blocks/${id}`))).toBe(false);
  });
});

describe("runPush: failures and retries (AC20)", () => {
  it("a Notion 500 marks the push failed, keeps the draft, and the next run retries it", async () => {
    const w = world();
    const id = await w.add();
    w.n.failOnce("PATCH /blocks/:id/children");
    const first = await w.run();
    expect(first).toMatchObject({ pushed: 0, failed: 1 });
    expect(first.error).toBe("Notion returned 500");
    const row = [...w.db.pushes.values()].find((p) => p.messageId === id)!;
    expect(row).toMatchObject({ state: "failed", attempts: 1, lastError: "Notion returned 500" });
    expect(w.db.messages.get(id)!.state).toBe("drafted");
    expect(await w.run()).toMatchObject({ pushed: 1 });
    expect(w.todos()).toHaveLength(1);
  });

  it("when the earlier append did reach Notion, the retry adopts the to-do by its ref", async () => {
    const w = world();
    const id = await w.add();
    // The append lands, then the row write is lost: simulate with a failing comment and a cleared block id.
    w.n.failOnce("POST /comments");
    await w.run();
    const row = [...w.db.pushes.values()].find((p) => p.messageId === id)!;
    row.notionBlockId = null;
    await w.run();
    expect(w.todos()).toHaveLength(1);
    expect(row.state === "pushed" || [...w.db.pushes.values()].find((p) => p.messageId === id)!.state === "pushed").toBe(true);
  });

  it(`after ${TUNING.irisMaxPushAttempts} attempts the push stays failed`, async () => {
    const w = world();
    const id = await w.add();
    w.n.fail.add("PATCH /blocks/:id/children");
    for (let i = 0; i < TUNING.irisMaxPushAttempts + 2; i++) await w.run();
    const row = [...w.db.pushes.values()].find((p) => p.messageId === id)!;
    expect(row).toMatchObject({ state: "failed", attempts: TUNING.irisMaxPushAttempts });
  });
});

describe("runPush: Work Log and retention (AC21, AC22)", () => {
  it("one Work Log entry per date, linked to the page, its counts updated on each run that pushed", async () => {
    const w = world();
    await w.add();
    await w.run();
    await w.add({ state: "escalated", escalationReason: "multi_intent" }, null);
    await w.run();
    const logs = [...w.n.pages.values()].filter((p) => p.ds === CONFIG.logId);
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0].props.Work)).toMatch(/[0-9a-f-]{36}/);
    const update = w.n.calls.filter((c) => c.method === "PATCH" && /^\/pages\//.test(c.path)).pop()!;
    expect(JSON.stringify(update.body)).toContain("Drafts: 1. Escalations: 1. Phone copies failed: 0.");
  });

  it("deletes the to-do of a message within a day of purge, or gone, and removes its row", async () => {
    const w = world();
    const keep = await w.add();
    const soon = await w.add();
    const gone = await w.add();
    await w.run();
    // A day later "soon" is 12 hours from its purge date.
    w.setClock(T0 + 86_400_000);
    const purgeAt = new Date(T0 + 86_400_000 + 12 * 3600_000).toISOString();
    w.db.messages.get(soon)!.purgeAt = purgeAt;
    for (const p of w.db.pushes.values()) if (p.messageId === soon) p.purgeAt = purgeAt;
    w.db.messages.delete(gone);
    expect(w.todos()).toHaveLength(3);
    const out = await w.run();
    expect(out.removed).toBe(2);
    expect(w.todos()).toHaveLength(1);
    expect([...w.db.pushes.values()].map((p) => p.messageId)).toEqual([keep]);
  });

  it("a message already within a day of its purge is never copied", async () => {
    const w = world();
    await w.add({ purgeAt: new Date(T0 + 12 * 3600_000).toISOString() });
    expect(await w.run()).toMatchObject({ pushed: 0 });
    expect(w.todos()).toHaveLength(0);
  });

  it("nothing to push makes no Notion call beyond the retention check", async () => {
    const w = world();
    expect(await w.run()).toEqual({ pushed: 0, failed: 0, removed: 0, error: null });
    expect(w.n.calls).toEqual([]);
  });
});
