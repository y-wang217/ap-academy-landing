// node --test scripts/notify-human.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { marker, message, postOnce } from "./notify-human.mjs";

function fakeGitHub(existing = []) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if ((init.method ?? "GET") === "GET") {
      // Two pages: the first full, the second empty, so pagination is exercised.
      const page = new URL(url).searchParams.get("page");
      const body = page === "1" ? existing : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
    }
    return { ok: true, status: 201, text: async () => JSON.stringify({ id: 1 }), json: async () => ({ id: 1 }) };
  };
  return { calls, fetchImpl };
}

test("marker and message name the move and the head commit", () => {
  assert.equal(marker("your-move", "abc123"), "<!-- pipeline-notify your-move abc123 -->");
  assert.match(message({ reason: "merge", pr: 7 }), /^@y-wang217 your move: merge #7\b/);
  assert.match(message({ reason: "migration", pr: 7, migration: "0017" }), /merge #7 and apply migration 0017/);
  assert.match(message({ reason: "review-cap", pr: 7, rounds: 3 }), /requested changes 3 times on #7/);
  assert.match(message({ reason: "merge", pr: 7, user: "someone" }), /^@someone /);
  assert.throws(() => message({ reason: "party", pr: 7 }), /reason/);
});

test("postOnce posts a comment carrying the marker when none exists", async () => {
  const gh = fakeGitHub([{ body: "unrelated comment" }]);
  const r = await postOnce({ repo: "o/r", pr: 7, marker: marker("your-move", "abc"), body: "@y-wang217 your move: merge #7", token: "t", fetchImpl: gh.fetchImpl });
  assert.equal(r.posted, true);
  const post = gh.calls.find((c) => c.init.method === "POST");
  assert.ok(post);
  assert.equal(post.url, "https://api.github.com/repos/o/r/issues/7/comments");
  assert.equal(post.init.headers.Authorization, "Bearer t");
  const body = JSON.parse(post.init.body).body;
  assert.match(body, /^@y-wang217 your move: merge #7/);
  assert.ok(body.includes("<!-- pipeline-notify your-move abc -->"));
});

test("postOnce is idempotent per marker and head commit", async () => {
  const m = marker("your-move", "abc");
  const dup = fakeGitHub([{ body: `@y-wang217 your move: merge #7\n\n${m}` }]);
  const r = await postOnce({ repo: "o/r", pr: 7, marker: m, body: "x", token: "t", fetchImpl: dup.fetchImpl });
  assert.equal(r.posted, false);
  assert.equal(r.reason, "duplicate");
  assert.ok(!dup.calls.some((c) => c.init.method === "POST"));

  // A new head commit gets a new marker and a new comment.
  const fresh = fakeGitHub([{ body: `@y-wang217 your move: merge #7\n\n${m}` }]);
  const r2 = await postOnce({ repo: "o/r", pr: 7, marker: marker("your-move", "def"), body: "x", token: "t", fetchImpl: fresh.fetchImpl });
  assert.equal(r2.posted, true);
});

test("postOnce reports an API failure instead of throwing", async () => {
  const r = await postOnce({ repo: "o/r", pr: 7, marker: "m", body: "x", token: "t", fetchImpl: async () => ({ ok: false, status: 403, text: async () => "forbidden", json: async () => ({}) }) });
  assert.equal(r.posted, false);
  assert.equal(r.status, 403);
  assert.match(r.error, /forbidden/);
});
