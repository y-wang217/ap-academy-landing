// node --test scripts/design-approver.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blocksToMarkdown,
  splitCard,
  structuralCheck,
  parseClaudeOutput,
  validateVerdict,
  decide,
  reviewCard,
  isPaused,
  CHECK_IDS,
  MARKER,
} from "./design-approver.mjs";

const rt = (text, annotations = {}) => [{ plain_text: text, annotations }];
const block = (type, text, extra = {}) => ({ type, has_children: false, [type]: { rich_text: rt(text), ...extra } });
const row = (...cells) => ({ type: "table_row", table_row: { cells: cells.map((c) => rt(c)) } });

const GOOD_DESIGN = `# Design: REQ-30 Export a student's goals as CSV
**Summary:** A tutor can download one student's goals as a CSV file from the student page.
**Risk:** Low (read-only export of data the tutor can already see)
## Problem
Tutors copy goals by hand into progress reports for parents every month. They need a one-click export of a single student's goals, in the order shown on the student page, that opens cleanly in Google Sheets.
## Acceptance criteria
- [ ] AC1: A tutor on the student page clicks Export and receives a file named goals-<student>.csv with one row per goal.
- [ ] AC2: A signed-in user who is not staff on that student's org gets 403 from GET /tracker/api/students/{id}/goals.csv.
## Approach
- \`apps/tracker/app/api/students/[id]/goals.csv/route.ts\`: new GET handler that reuses getDb() and the existing goals query, so RLS decides who sees what.
- \`apps/tracker/lib/domain/csv.ts\`: pure toCsv(rows) with RFC 4180 quoting, no new dependency.
- \`apps/tracker/components/student/GoalsPanel.tsx\`: an Export link (plain anchor) next to the goals heading; states are the existing ones.
## Migration
None.
## Test plan
| Test | Type | Covers |
|---|---|---|
| \`apps/tracker/lib/domain/csv.test.ts\` quoting, header, order | unit | AC1 |
| \`apps/tracker/app/api/students/goals-csv.test.ts\` 200 for staff, 403 for outsider | integration | AC1, AC2 |
## Out of scope
Exporting assessments or tasks.
## Risks and edge cases
Goal text with commas, quotes or newlines breaks naive CSV; toCsv quotes every field. An empty goal list returns just the header row.
## Decisions for approval
| # | Decision | Options | Default if you say nothing |
|---|---|---|---|
| 1 | New dependencies | None | None |
`;

const REQUIREMENT = `Tutors want to export goals.\n## Requirements\n- One student's goals as CSV.\n---`;

const verdictOf = (verdict, overrides = {}) => ({
  verdict,
  summary: "ok",
  checks: CHECK_IDS.map((id) => ({ id, pass: verdict === "approve", note: verdict === "approve" ? "" : "fails" })),
  gaps: verdict === "approve" ? [] : ["AC1: say what the file contains."],
  ...overrides,
});
// A non-approve verdict where only C3 fails, so C8 (the risk label) passes.
const onlyC3 = (verdict, overrides = {}) => verdictOf(verdict, {
  checks: CHECK_IDS.map((id) => ({ id, pass: id !== "C3", note: id === "C3" ? "fails" : "" })),
  ...overrides,
});

test("blocksToMarkdown renders headings, lists, to-dos, code and tables", () => {
  const md = blocksToMarkdown([
    block("heading_2", "Acceptance criteria"),
    block("to_do", "AC1: works", { checked: false }),
    { type: "bulleted_list_item", has_children: true, bulleted_list_item: { rich_text: [...rt("File "), ...rt("a.ts", { code: true })] },
      children: [block("bulleted_list_item", "nested")] },
    { type: "table", table: { has_column_header: true }, children: [row("Test", "Covers"), row("x.test.ts", "AC1")] },
    { type: "divider", divider: {} },
  ]);
  assert.equal(md, [
    "## Acceptance criteria",
    "- [ ] AC1: works",
    "- File `a.ts`",
    "  - nested",
    "| Test | Covers |",
    "|---|---|",
    "| x.test.ts | AC1 |",
    "---",
  ].join("\n"));
});

test("splitCard separates the requirement from the design", () => {
  const { requirement, design } = splitCard(`${REQUIREMENT}\n${GOOD_DESIGN}`);
  assert.match(requirement, /One student's goals/);
  assert.doesNotMatch(requirement, /Summary/);
  assert.match(design, /^# Design: REQ-30/);
  assert.equal(splitCard("Just a requirement, no design yet.").design, "");
});

test("structuralCheck passes a complete, well-worded design", () => {
  assert.deepEqual(structuralCheck({ design: GOOD_DESIGN, riskProperty: "Low" }), []);
});

test("structuralCheck flags missing design, sections, thin wording and placeholders", () => {
  assert.match(structuralCheck({ design: "" })[0], /No design/);

  const noRisks = GOOD_DESIGN.replace(/## Risks and edge cases[\s\S]*?## Decisions/, "## Decisions");
  assert.ok(structuralCheck({ design: noRisks }).some((p) => /Risks and edge cases/.test(p)));

  const shortAc = GOOD_DESIGN.replace(/AC2: .*/, "AC2: returns 403.");
  assert.ok(structuralCheck({ design: shortAc }).some((p) => /AC2 .*too short/.test(p)));

  const unmapped = GOOD_DESIGN.replace("| AC1, AC2 |", "| AC1 |");
  assert.ok(structuralCheck({ design: unmapped }).some((p) => /AC2 has no row in the Test plan/.test(p)));

  const placeholder = GOOD_DESIGN.replace("| 1 | New dependencies | None | None |", "| 1 | ... | ... | ... |");
  assert.ok(structuralCheck({ design: placeholder }).some((p) => /placeholder/.test(p)));

  const tbd = GOOD_DESIGN.replace("Exporting assessments or tasks.", "TBD");
  assert.ok(structuralCheck({ design: tbd }).some((p) => /placeholder/.test(p)));

  const noPaths = GOOD_DESIGN.replace(/`apps\/[^`]+`/g, "a file");
  assert.ok(structuralCheck({ design: noPaths }).some((p) => /real file path/.test(p)));

  assert.ok(structuralCheck({ design: GOOD_DESIGN, riskProperty: "Medium" }).some((p) => /Risk/.test(p)));
});

test("parseClaudeOutput reads structured output, fenced text, and rejects errors", () => {
  const v = verdictOf("approve");
  assert.deepEqual(parseClaudeOutput(JSON.stringify({ type: "result", structured_output: v })), v);
  const fenced = JSON.stringify({ type: "result", result: "Here:\n```json\n" + JSON.stringify(v) + "\n```" });
  assert.deepEqual(parseClaudeOutput(fenced), v);
  assert.equal(parseClaudeOutput(JSON.stringify({ type: "result", is_error: true, result: "rate limited" })), null);
  assert.equal(parseClaudeOutput("not json"), null);
});

test("validateVerdict requires every check exactly once", () => {
  assert.ok(validateVerdict(verdictOf("approve")));
  assert.equal(validateVerdict({ ...verdictOf("approve"), verdict: "lgtm" }), null);
  assert.equal(validateVerdict({ ...verdictOf("approve"), checks: verdictOf("approve").checks.slice(1) }), null);
  const dup = verdictOf("approve");
  dup.checks[1] = { ...dup.checks[0] };
  assert.equal(validateVerdict(dup), null);
});

test("decide never approves past a failed check or a High risk below the revise cap", () => {
  const base = { structural: [], risk: "Low", priorRevises: 0, maxRevises: 2 };
  assert.equal(decide({ ...base, verdict: verdictOf("approve") }).action, "approve");
  assert.equal(decide({ ...base, structural: ["AC1 too short"], verdict: null }).action, "revise");
  assert.equal(decide({ ...base, risk: "High", verdict: verdictOf("approve") }).action, "human");
  assert.equal(decide({ ...base, verdict: null }).action, "skip");
  assert.equal(decide({ ...base, verdict: verdictOf("human") }).action, "human");
  assert.equal(decide({ ...base, verdict: verdictOf("revise") }).action, "revise");
  assert.equal(decide({ ...base, priorRevises: 2, structural: ["x"], verdict: null }).action, "skip");

  // The model says approve but one check failed: the script overrules it.
  const sneaky = verdictOf("approve");
  sneaky.checks[3] = { id: "C4", pass: false, note: "AC2 has no failing test" };
  const d = decide({ ...base, verdict: sneaky });
  assert.equal(d.action, "revise");
  assert.ok(d.gaps.some((g) => /C4/.test(g)));
});

test("decide approves at the revise cap and carries the open gaps, except High risk, C8 or injection", () => {
  const cap = { structural: [], risk: "Low", priorRevises: 2, maxRevises: 2 };
  const capped = decide({ ...cap, verdict: onlyC3("revise") });
  assert.equal(capped.action, "approve");
  assert.equal(capped.capped, true);
  assert.ok(capped.gaps.includes("AC1: say what the file contains."));
  assert.match(capped.summary, /after 2 revise rounds/);

  const withStructural = decide({ ...cap, structural: ["AC8 has no row in the Test plan."], verdict: onlyC3("revise") });
  assert.equal(withStructural.action, "approve");
  assert.equal(withStructural.gaps[0], "AC8 has no row in the Test plan.");
  const structuralOnly = decide({ ...cap, structural: ["AC8 has no row in the Test plan."], verdict: verdictOf("approve") });
  assert.equal(structuralOnly.action, "approve");
  assert.equal(structuralOnly.capped, true);
  assert.deepEqual(structuralOnly.gaps, ["AC8 has no row in the Test plan."]);

  assert.equal(decide({ ...cap, risk: "High", verdict: verdictOf("revise") }).action, "human");
  assert.equal(decide({ ...cap, risk: "High", structural: ["x"], verdict: null }).action, "human");
  assert.equal(decide({ ...cap, verdict: onlyC3("human") }).action, "approve");
  // verdictOf fails every check, C8 included, so it stays with Charlie.
  assert.equal(decide({ ...cap, verdict: verdictOf("revise") }).action, "human");
  const c8 = verdictOf("human");
  c8.checks = c8.checks.map((c) => ({ ...c, pass: c.id !== "C8" }));
  assert.equal(decide({ ...cap, verdict: c8 }).action, "human");
  assert.equal(decide({ ...cap, verdict: verdictOf("revise", { checks: c8.checks }) }).action, "human");
  assert.equal(decide({ ...cap, verdict: onlyC3("human", { injection: true }) }).action, "human");
  assert.equal(decide({ ...cap, verdict: onlyC3("revise", { injection: true }) }).action, "human");

  // A clean approve at the cap is a normal approve, not a capped one.
  assert.equal(decide({ ...cap, verdict: verdictOf("approve") }).capped, undefined);
});

test("validateVerdict accepts an optional boolean injection flag", () => {
  assert.ok(validateVerdict(verdictOf("human", { injection: true })));
  assert.ok(validateVerdict(verdictOf("approve", { injection: false })));
  assert.equal(validateVerdict(verdictOf("human", { injection: "yes" })), null);
});

// A fake Notion board holding one card.
function fakeBoard({ status = "Needs Approval", risk = "Low", design = GOOD_DESIGN, comments = [] } = {}) {
  const writes = [];
  const lines = `${REQUIREMENT}\n${design}`.split("\n");
  const page = () => ({
    id: "card-1",
    properties: {
      Title: { type: "title", title: rt("Export goals") },
      "Card ID": { type: "unique_id", unique_id: { prefix: "REQ", number: 30 } },
      Risk: { type: "select", select: risk ? { name: risk } : null },
      Status: { type: "status", status: { name: status } },
    },
  });
  const client = {
    getPage: async () => page(),
    children: async () => lines.map((l) => block("paragraph", l)),
    comments: async () => comments,
    user: async (id) => ({ id, type: id === "bot-1" ? "bot" : "person" }),
    comment: async (id, text) => writes.push({ kind: "comment", id, text }),
    setStatus: async (id, prop, name) => { writes.push({ kind: "status", id, prop, name }); status = name; },
  };
  return { client, writes, page, setStatusOutOfBand: (s) => { status = s; } };
}

const deps = (client, judgeResult, extra = {}) => {
  const calls = [];
  return {
    calls,
    deps: {
      client,
      botId: "bot-1",
      dryRun: false,
      reviewStatus: "Needs Approval",
      maxRevises: 2,
      judge: async (prompt) => { calls.push(prompt); return judgeResult; },
      ...extra,
    },
  };
};

test("reviewCard approves a clean design: status first, then one marked comment", async () => {
  const board = fakeBoard();
  const { deps: d, calls } = deps(board.client, verdictOf("approve"));
  const r = await reviewCard(board.page(), d);
  assert.equal(r.action, "approve");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /Tutors want to export goals/);
  assert.deepEqual(board.writes.map((w) => w.kind), ["status", "comment"]);
  assert.equal(board.writes[0].name, "Approved");
  assert.ok(board.writes[1].text.startsWith(MARKER));
  assert.match(board.writes[1].text, /sha:[0-9a-f]{12}/);
});

test("reviewCard sends structural failures to Revise without calling Claude", async () => {
  const board = fakeBoard({ design: GOOD_DESIGN.replace(/AC2: .*/, "AC2: returns 403.") });
  const { deps: d, calls } = deps(board.client, verdictOf("approve"));
  const r = await reviewCard(board.page(), d);
  assert.equal(r.action, "revise");
  assert.equal(calls.length, 0);
  assert.equal(board.writes[0].name, "Revise");
  assert.match(board.writes[1].text, /AC2 .*too short/);
  assert.match(board.writes[1].text, /revise 1 of 2/);
});

test("reviewCard leaves High risk cards for Charlie and does not call Claude", async () => {
  const board = fakeBoard({ risk: "High", design: GOOD_DESIGN.replace("**Risk:** Low", "**Risk:** High") });
  const { deps: d, calls } = deps(board.client, verdictOf("approve"));
  const r = await reviewCard(board.page(), d);
  assert.equal(r.action, "human");
  assert.equal(calls.length, 0);
  assert.deepEqual(board.writes.map((w) => w.kind), ["comment"]);
});

test("reviewCard skips a design it already reviewed, and the dry run writes nothing", async () => {
  const first = fakeBoard();
  await reviewCard(first.page(), deps(first.client, verdictOf("human")).deps);
  const marker = first.writes.find((w) => w.kind === "comment").text;

  const again = fakeBoard({ comments: [{ created_by: { id: "bot-1" }, rich_text: rt(marker) }] });
  const { deps: d, calls } = deps(again.client, verdictOf("approve"));
  assert.equal((await reviewCard(again.page(), d)).action, "skip");
  assert.equal(calls.length, 0);
  assert.equal(again.writes.length, 0);

  const dry = fakeBoard();
  const r = await reviewCard(dry.page(), deps(dry.client, verdictOf("approve"), { dryRun: true }).deps);
  assert.equal(r.action, "approve");
  assert.equal(dry.writes.length, 0);
});

test("reviewCard writes nothing when the card moved while Claude was judging", async () => {
  const board = fakeBoard();
  const { deps: d } = deps(board.client, verdictOf("approve"), {
    judge: async () => { board.setStatusOutOfBand("Revise"); return verdictOf("approve"); },
  });
  const r = await reviewCard(board.page(), d);
  assert.equal(r.action, "skip");
  assert.equal(board.writes.length, 0);
});

test("reviewCard counts earlier revises and approves the third round with the open gaps", async () => {
  const old = (sha) => ({ created_by: { id: "bot-1" }, rich_text: rt(`${MARKER} Revise (sha:${sha}, revise 1 of 2). x`) });
  const board = fakeBoard({ comments: [old("aaaaaaaaaaaa"), old("bbbbbbbbbbbb")] });
  const { deps: d } = deps(board.client, onlyC3("revise"));
  const r = await reviewCard(board.page(), d);
  assert.equal(r.action, "approve");
  assert.deepEqual(board.writes.map((w) => w.kind), ["status", "comment"]);
  assert.equal(board.writes[0].name, "Approved");
  assert.match(board.writes[1].text, /^\[design-approver\] Approved at cap \(sha:[0-9a-f]{12}, after 2 revise rounds\)/);
  assert.match(board.writes[1].text, /Open gaps for the builder:\n1\. AC1: say what the file contains\./);
});

test("reviewCard at the cap still sends High risk and C8 failures to Charlie", async () => {
  const old = (sha) => ({ created_by: { id: "bot-1" }, rich_text: rt(`${MARKER} Revise (sha:${sha}, revise 1 of 2). x`) });
  const comments = [old("aaaaaaaaaaaa"), old("bbbbbbbbbbbb")];
  const high = fakeBoard({ risk: "High", comments });
  const h = deps(high.client, verdictOf("revise"));
  assert.equal((await reviewCard(high.page(), h.deps)).action, "human");
  assert.equal(h.calls.length, 0);
  assert.deepEqual(high.writes.map((w) => w.kind), ["comment"]);

  const c8 = verdictOf("human");
  c8.checks = c8.checks.map((c) => ({ ...c, pass: c.id !== "C8" }));
  const under = fakeBoard({ comments });
  assert.equal((await reviewCard(under.page(), deps(under.client, c8).deps)).action, "human");
  assert.deepEqual(under.writes.map((w) => w.kind), ["comment"]);
});

test("reviewCard at the cap still judges a structurally thin design, and lists the structural gaps", async () => {
  const old = (sha) => ({ created_by: { id: "bot-1" }, rich_text: rt(`${MARKER} Revise (sha:${sha}, revise 1 of 2). x`) });
  const board = fakeBoard({ design: GOOD_DESIGN.replace(/AC2: .*/, "AC2: returns 403."), comments: [old("aaaaaaaaaaaa"), old("bbbbbbbbbbbb")] });
  const { deps: d, calls } = deps(board.client, verdictOf("approve"));
  const r = await reviewCard(board.page(), d);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /Structural pre-check: failed/);
  assert.match(calls[0], /AC2 .*too short/);
  assert.equal(r.action, "approve");
  assert.equal(board.writes[0].name, "Approved");
  assert.match(board.writes[1].text, /AC2 .*too short/);
});

test("reviewCard re-judges an unchanged design sent back after a Revise", async () => {
  const first = fakeBoard();
  await reviewCard(first.page(), deps(first.client, verdictOf("revise")).deps);
  const marker = first.writes.find((w) => w.kind === "comment").text;
  assert.match(marker, /Revise \(sha:/);

  const again = fakeBoard({ comments: [
    { created_by: { id: "bot-1" }, rich_text: rt(`${MARKER} Revise (sha:aaaaaaaaaaaa, revise 1 of 2). x`) },
    { created_by: { id: "bot-1" }, rich_text: rt(marker.replace("revise 1 of 2", "revise 2 of 2")) },
  ] });
  const { deps: d, calls } = deps(again.client, onlyC3("revise"));
  const r = await reviewCard(again.page(), d);
  assert.equal(calls.length, 1);
  assert.equal(r.action, "approve");
  assert.equal(again.writes[0].name, "Approved");
});

test("reviewCard labels person and bot comments for the C11 check", async () => {
  const board = fakeBoard({ comments: [
    { created_by: { id: "charlie" }, rich_text: rt("Please add a 403 test.") },
    { created_by: { id: "bot-1" }, rich_text: rt("designer note") },
  ] });
  const { deps: d, calls } = deps(board.client, verdictOf("approve"));
  await reviewCard(board.page(), d);
  assert.match(calls[0], /\[person\] Please add a 403 test\./);
  assert.match(calls[0], /\[bot\] designer note/);
});

test("isPaused reads the Paused to-do on the control page", async () => {
  const client = (checked) => ({ children: async () => [block("paragraph", "Controls"), block("to_do", "Paused", { checked })] });
  assert.equal(await isPaused(client(true), "ctl"), true);
  assert.equal(await isPaused(client(false), "ctl"), false);
});

test("splitCard keeps a revision's change list with the design", () => {
  const md = `${REQUIREMENT}\n# REQ-30: Export goals\n**Changes from last version:**\n- Added AC2.\n- Renamed the route.\n- Moved the helper.\n${GOOD_DESIGN.split("\n").slice(1).join("\n")}`;
  const { requirement, design } = splitCard(md);
  assert.match(design, /^# REQ-30: Export goals\n\*\*Changes from last version/);
  assert.doesNotMatch(requirement, /Changes from last version/);
});

test("bold labels with trailing spaces and bold headings still parse", () => {
  const md = blocksToMarkdown([
    { type: "paragraph", has_children: false, paragraph: { rich_text: [...rt("Summary: ", { bold: true }), ...rt("A tutor downloads goals.")] } },
    { type: "heading_2", has_children: false, heading_2: { rich_text: rt("Approach", { bold: true }) } },
  ]);
  assert.equal(md, "**Summary:** A tutor downloads goals.\n## **Approach**");
  const bolded = GOOD_DESIGN.replace("## Approach", "## **Approach**");
  assert.deepEqual(structuralCheck({ design: bolded, riskProperty: "Low" }), []);
});
