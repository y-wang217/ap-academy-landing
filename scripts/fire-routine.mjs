#!/usr/bin/env node
// Fires a claude.ai Claude Code routine through its API trigger (a "kick").
// Used by scripts/design-approver.mjs (approver -> build or design), by the
// reviewer workflow (changes requested -> build), and as the fallback when the
// fire_trigger tool is not available inside a routine run.
//
// Every kick is best effort. Nothing here throws, and the CLI always exits 0:
// a failed kick is a ::warning::, and the routine's own schedule picks the card
// up later. See docs/spec/pipeline-event-chaining.md, R1 and R3.
//
//   ROUTINE_BUILD_FIRE_URL=... ROUTINE_BUILD_FIRE_TOKEN=... \
//     node scripts/fire-routine.mjs build --chain 0 --from reviewer --card REQ-23
//
// --chain is the sender's own depth; the fire text carries depth + 1.
import { readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROUTINES = ["design", "build"];
export const DEFAULT_MAX_CHAIN = 12;

// The only thing a stage reads from a fire payload: the first chain=<digits>.
// Anything else, including a malformed or missing value, counts as depth 0.
export function parseChain(text) {
  const m = /\bchain=(\d{1,6})\b/.exec(String(text ?? ""));
  return m ? Number(m[1]) : 0;
}

export function kickText({ chain, from, card }) {
  const parts = [`chain=${chain}`, `from=${from}`];
  if (card) parts.push(`card=${card}`);
  return parts.join(" ");
}

export function routineEnv(routine, env = process.env) {
  const key = String(routine).toUpperCase();
  return { url: env[`ROUTINE_${key}_FIRE_URL`], token: env[`ROUTINE_${key}_FIRE_TOKEN`] };
}

// POST to the routine's /fire endpoint. Resolves to a result, never rejects.
export async function fireRoutine({ url, token, text, fetchImpl = fetch }) {
  if (!url || !token) return { ok: false, skipped: true, error: "missing url or token" };
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const bodyText = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: bodyText.slice(0, 300) };
    let sessionUrl;
    try { sessionUrl = JSON.parse(bodyText).claude_code_session_url; } catch {}
    return { ok: true, status: res.status, sessionUrl };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// One kick with the chain rule applied: a sender at or above max_chain sends
// nothing; otherwise the receiver starts at depth + 1. Logs GitHub Actions
// annotations so the run summary shows what happened.
export async function kick({ routine, depth = 0, from, card, maxChain = DEFAULT_MAX_CHAIN, env = process.env, fetchImpl = fetch, log = console.log }) {
  const name = `ap-${routine}`;
  if (depth >= maxChain) {
    const summary = `chain limit reached (depth ${depth}, max_chain ${maxChain}); ${name} not kicked`;
    log(`::notice::${summary}.`);
    return { ok: false, skipped: true, reason: "max_chain", summary };
  }
  const { url, token } = routineEnv(routine, env);
  const key = routine.toUpperCase();
  if (!url || !token) {
    const summary = `${name} not kicked: ROUTINE_${key}_FIRE_URL and ROUTINE_${key}_FIRE_TOKEN are not both set`;
    log(`::notice::${summary} (PIPELINE.md, Event chaining).`);
    return { ok: false, skipped: true, reason: "unconfigured", summary };
  }
  const chain = depth + 1;
  const r = await fireRoutine({ url, token, text: kickText({ chain, from, card }), fetchImpl });
  if (r.ok) {
    const summary = `kicked ${name} (chain ${chain})${r.sessionUrl ? `: ${r.sessionUrl}` : ""}`;
    log(summary);
    return { ...r, chain, summary };
  }
  const summary = `kick ${name} (chain ${chain}) failed: ${r.status ?? "network"} ${r.error ?? ""}`.trim();
  log(`::warning::${summary}`);
  return { ...r, chain, summary };
}

function readMaxChain() {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const pipeline = JSON.parse(readFileSync(join(root, ".claude/pipeline.json"), "utf8"));
    return Number.isInteger(pipeline.max_chain) ? pipeline.max_chain : DEFAULT_MAX_CHAIN;
  } catch {
    return DEFAULT_MAX_CHAIN;
  }
}

function parseArgs(argv) {
  const out = { routine: argv[0] };
  for (let i = 1; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs(process.argv.slice(2));
  if (!ROUTINES.includes(args.routine)) {
    console.log(`::warning::fire-routine: unknown routine "${args.routine}"; expected one of ${ROUTINES.join(", ")}. Nothing fired.`);
    process.exit(0);
  }
  const depth = Math.max(0, parseInt(args.chain ?? "0", 10) || 0);
  kick({ routine: args.routine, depth, from: args.from ?? "unknown", card: args.card, maxChain: readMaxChain() }).then((r) => {
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${r.summary}\n`);
  });
}
