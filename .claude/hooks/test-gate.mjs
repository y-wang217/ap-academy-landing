#!/usr/bin/env node
// Stop / SubagentStop hook: refuse to let Claude finish while the gate is red.
// Only runs when there are code changes vs the default branch, so design and
// review runs (docs or no changes) are never blocked.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const cfg = JSON.parse(readFileSync(join(root, ".claude", "pipeline.json"), "utf8"));

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch {}

const sh = (cmd) => execSync(cmd, { cwd: root, stdio: "pipe", encoding: "utf8", shell: true });

function changedFiles() {
  const files = new Set();
  const add = (out) => out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).forEach((f) => files.add(f));
  try { add(sh(`git diff --name-only origin/${cfg.default_branch}...HEAD`)); } catch {}
  try { add(sh("git diff --name-only HEAD")); } catch {}
  try { add(sh("git ls-files --others --exclude-standard")); } catch {}
  return [...files].filter((f) => !cfg.gate_ignore_paths.some((p) => f.startsWith(p)));
}

// Escape hatch for the Blocked procedure: the agent writes this file after
// marking the card Blocked, so it can stop cleanly. It is gitignored.
if (existsSync(join(root, ".claude", "state", "blocked"))) process.exit(0);

const code = changedFiles();
if (code.length === 0) process.exit(0); // nothing to gate

const commands = cfg.gate_commands.filter((c) => !c.startsWith("REPLACE_ME"));
if (commands.length === 0) {
  console.log(JSON.stringify({ decision: "block", reason: "Test gate is not configured: set gate_commands in .claude/pipeline.json." }));
  process.exit(0);
}

const failures = [];
for (const cmd of commands) {
  try { sh(cmd); }
  catch (e) {
    const out = `${e.stdout || ""}\n${e.stderr || ""}`.trim().split(/\r?\n/).slice(-40).join("\n");
    failures.push(`$ ${cmd}\n${out}`);
  }
}

if (failures.length === 0) process.exit(0);

const prefix = input.stop_hook_active
  ? "The gate is STILL failing. If you cannot fix it this turn, follow the Blocked procedure in your agent instructions (increment Attempts, comment on the Notion card, set Blocked) and then stop.\n\n"
  : "";
console.log(JSON.stringify({
  decision: "block",
  reason: `${prefix}Test gate failed. You may not finish until these pass:\n\n${failures.join("\n\n")}`
}));
process.exit(0);
