#!/usr/bin/env node
// Posts the one "your move" comment on a pipeline PR, as github-actions[bot],
// when the next step is Charlie's: a bot-approved PR that carries
// needs-human-merge (merge, or merge and apply a migration), or the bot
// reviewer's round cap. A comment from the Actions bot that @mentions Charlie
// notifies him; his own PR activity does not. One comment per marker and head
// commit. See docs/spec/pipeline-event-chaining.md, R4 and R6 (N2).
//
//   GITHUB_TOKEN=... node scripts/notify-human.mjs --repo o/r --pr 12 --sha <head> --reason merge
//   ... --reason migration --migration 0017
//   ... --reason review-cap --rounds 3
import { fileURLToPath } from "node:url";

export const DEFAULT_USER = "y-wang217";
const API = "https://api.github.com";

export function marker(kind, sha) {
  return `<!-- pipeline-notify ${kind} ${sha} -->`;
}

export function message({ reason, pr, migration, rounds = 3, user = DEFAULT_USER }) {
  switch (reason) {
    case "merge":
      return `@${user} your move: merge #${pr}. The bot reviewer approved it and it carries needs-human-merge, so it will not auto-merge.`;
    case "migration":
      return `@${user} your move: merge #${pr} and apply migration ${migration ?? "(see the diff)"} with the Supabase MCP, then record it in CLAUDE.md. The bot reviewer approved it.`;
    case "review-cap":
      return `@${user} your move: the bot reviewer has requested changes ${rounds} times on #${pr}, so the builder will not be kicked again. Fix it by hand, close it, or push and re-request the review.`;
    default:
      throw new Error(`notify-human: unknown reason "${reason}"`);
  }
}

async function gh(fetchImpl, token, path, init = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

// Posts body + marker on the PR unless a comment already carries the marker.
export async function postOnce({ repo, pr, marker: mark, body, token, fetchImpl = fetch }) {
  try {
    for (let page = 1; page < 20; page++) {
      const res = await gh(fetchImpl, token, `/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`);
      if (!res.ok) return { posted: false, status: res.status, error: (await res.text()).slice(0, 300) };
      const comments = await res.json();
      if (comments.some((c) => String(c.body ?? "").includes(mark))) return { posted: false, reason: "duplicate" };
      if (comments.length < 100) break;
    }
    const res = await gh(fetchImpl, token, `/repos/${repo}/issues/${pr}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: `${body}\n\n${mark}` }),
    });
    if (!res.ok) return { posted: false, status: res.status, error: (await res.text()).slice(0, 300) };
    return { posted: true };
  } catch (e) {
    return { posted: false, error: e.message };
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = parseArgs(process.argv.slice(2));
  const repo = a.repo ?? process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!repo || !a.pr || !a.sha || !a.reason || !token) {
    console.error("notify-human: need --pr, --sha, --reason, a repo (--repo or GITHUB_REPOSITORY) and GITHUB_TOKEN.");
    process.exit(2);
  }
  const kind = a.reason === "review-cap" ? "review-cap" : "your-move";
  const body = message({ reason: a.reason, pr: a.pr, migration: a.migration, rounds: a.rounds ? Number(a.rounds) : undefined, user: a.user });
  postOnce({ repo, pr: a.pr, marker: marker(kind, a.sha), body, token }).then((r) => {
    if (r.posted) console.log(`notify-human: posted "${a.reason}" on #${a.pr} at ${a.sha}.`);
    else if (r.reason === "duplicate") console.log(`notify-human: #${a.pr} at ${a.sha} already has the "${kind}" comment; nothing posted.`);
    else { console.log(`::error::notify-human: could not comment on #${a.pr}: ${r.status ?? ""} ${r.error ?? ""}`); process.exitCode = 1; }
  });
}
