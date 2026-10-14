#!/usr/bin/env node
// PreToolUse hook: hard blocks on dangerous commands and protected files.
// Exit code 2 blocks the tool call and feeds stderr back to Claude.
import { readFileSync } from "node:fs";

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch {}
const tool = input.tool_name || "";
const ti = input.tool_input || {};

const deny = (why) => { console.error(`BLOCKED by pipeline guard: ${why}`); process.exit(2); };

// PowerShell is Claude Code's second shell tool on Windows.
if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(ti.command || "");
  const rules = [
    [/git\s+push\b[^\n]*[\s:](main|master)(\s|$)/, "pushing to the default branch. Push your req/ branch and open a PR."],
    [/git\s+push\b[^\n]*(--force\b|-f\b)(?!-with-lease)/, "force push. Use --force-with-lease on your own req/ branch only."],
    [/git\s+(reset\s+--hard|clean\s+-[a-z]*f)/, "destructive git command."],
    [/gh\s+pr\s+merge\b/, "merging. Only the reviewer workflow and branch protection merge PRs."],
    [/gh\s+(repo|secret|api\s+-X\s*(DELETE|PUT))/, "repo admin or secrets via gh."],
    [/supabase\s+(db\s+(push|reset)|migration\s+repair|link)/, "touching a remote Supabase database. Write the migration file only; a human applies it."],
    [/vercel\b[^\n]*--prod/, "production deploy."],
    [/npm\s+publish|yarn\s+publish|pnpm\s+publish/, "publishing a package."],
    [/rm\s+-rf?\s+(\/|~|\.\s*$|\*)/, "recursive delete of a broad path."],
    [/(cat|type|Get-Content)\s+[^\n]*\.env/, "reading .env secrets."],
  ];
  for (const [re, why] of rules) if (re.test(cmd)) deny(why);
}

if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
  const p = String(ti.file_path || ti.notebook_path || "").replace(/\\/g, "/");
  const protectedPaths = [
    [/\/\.env(\.|$)/, ".env files"],
    [/\/\.claude\/hooks\//, "pipeline hooks"],
    [/\/\.claude\/settings(\.local)?\.json$/, "Claude settings"],
    [/\/\.claude\/pipeline\.json$/, "pipeline config"],
    [/\/\.github\/workflows\//, "CI workflows"],
  ];
  for (const [re, why] of protectedPaths) if (re.test(p)) deny(`editing ${why} is reserved for a human.`);
}

process.exit(0);
