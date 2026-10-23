import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FORM_TEXT, outcomeBody, statusOf, type FormInput, type FormStatus } from "../../../lib/console/outcome-client";
import { OutcomeBodySchema } from "../../../lib/console/outcome-schema";
import type { SalesLead } from "../../../lib/console/sales-view";
import { OutcomeFormView } from "./outcome-form";

// REQ-61 AC11, AC12, AC13: the outcome form, rendered with each status, and its client logic.
const LEAD = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", pageUrl: "https://www.notion.so/aaaaaaaaaaaa4aaa8aaaaaaaaaaa0001", name: "Gail Overdue", stage: "Working",
  attempts: 1, lastEditedAt: "2026-10-26T13:00:00.000Z", lostReason: null,
} as unknown as SalesLead;
const INPUT: FormInput = { outcome: "no_answer", note: "Left a voicemail", nextAction: "", due: "" };
const noop = () => {};
const render = (status: FormStatus, input: Partial<FormInput> = {}, lead: Partial<SalesLead> = {}) =>
  renderToStaticMarkup(h(OutcomeFormView, { lead: { ...LEAD, ...lead }, input: { ...INPUT, ...input }, status, onInput: noop, onSubmit: noop, onRefresh: noop, onStartOver: noop }));
const labels = (out: string) => [...out.matchAll(/type="radio"[^>]*\/?>([^<]+)</g)].map((m) => m[1]);

describe("OutcomeFormView", () => {
  it("offers only the outcomes the Stage allows", () => {
    expect(labels(render({ kind: "idle" }))).toEqual([
      "No answer", "Contacted, call back later", "Follow-up scheduled", "Trial booked", "Not interested", "Wrong number", "Do not contact",
    ]);
    expect(labels(render({ kind: "idle" }, {}, { stage: "Awaiting Close" }))).toEqual(["No answer", "Follow-up scheduled", "Not interested", "Do not contact", "Won"]);
    expect(render({ kind: "idle" }, {}, { stage: "Active" })).toContain("No outcome can be logged from Active. Change the Stage in Notion first.");
    expect(render({ kind: "idle" }, {}, { lostReason: "Do not contact" })).not.toContain('type="radio"');
  });

  it("shows the time and next-action fields only where they apply", () => {
    expect(render({ kind: "idle" })).not.toContain("datetime-local");
    expect(render({ kind: "idle" }, { outcome: "call_back" })).toContain("Call back at");
    const follow = render({ kind: "idle" }, { outcome: "follow_up" });
    expect(follow).toContain("Due at");
    expect(follow).toContain("Schedule first lesson");
  });

  it("names the contract fields for Trial booked and Won", () => {
    expect(render({ kind: "idle" }, { outcome: "trial_booked" })).toContain("Trial booked needs in Notion: Parent Name, Student Name, Parent Phone, Subjects, Grade, Target Program, Trial Time, Sales Notes");
    expect(render({ kind: "idle" }, { outcome: "won" }, { stage: "Awaiting Close" })).toContain("Won needs in Notion: Lesson Cadence, Hourly Rate (CAD), Last Payment Date, Subjects");
  });

  it("has no send, call or text control and no tel:, sms: or mailto: link (AC12)", () => {
    for (const status of [{ kind: "idle" }, { kind: "uncertain", message: "x", retryAfterSeconds: 5 }, { kind: "failed", message: "x" }] as FormStatus[]) {
      const out = render(status, { outcome: "follow_up" });
      for (const s of ["tel:", "sms:", "mailto:"]) expect(out).not.toContain(s);
      const buttons = [...out.matchAll(/<button[^>]*>([^<]*)</g)].map((m) => m[1]);
      for (const b of buttons) expect(["Log outcome", "Retry", "Start over", "Refresh"]).toContain(b);
    }
  });

  it("each status shows its text and its one action (AC11, AC13)", () => {
    expect(render({ kind: "saving" })).toContain(FORM_TEXT.saving);
    expect(render({ kind: "saving" })).toContain('aria-busy="true"');
    expect(render({ kind: "done", cadenceUsedUp: true, staffLinked: false })).toContain(`${FORM_TEXT.done} ${FORM_TEXT.cadence} ${FORM_TEXT.noStaff}`);
    expect(render({ kind: "stale" })).toMatch(/This lead changed in Notion[^<]*<button[^>]*>Refresh</);
    const refused = render({ kind: "refused", message: FORM_TEXT.contract, missing: ["Sales Notes"], notionUrl: LEAD.pageUrl });
    expect(refused).toContain("Fill these in Notion first: Sales Notes.");
    expect(refused).toMatch(/href="https:\/\/www\.notion\.so\/[^"]+"[^>]*>Fill in Notion</);
    expect(render({ kind: "uncertain", message: "Not confirmed.", retryAfterSeconds: 40 })).toMatch(/Not confirmed\. Wait 40 s\.[^<]*<button[^>]*>Retry</);
    expect(render({ kind: "failed", message: "Refused." })).toMatch(/<button[^>]*>Start over</);
    const notReady = render({ kind: "not_ready" });
    expect(notReady).toContain(FORM_TEXT.notReady);
    expect(notReady).toMatch(/<button type="submit"[^>]*disabled/);
  });

  it("locks the inputs while saving or unconfirmed, and keeps the note text (AC11)", () => {
    for (const status of [{ kind: "saving" }, { kind: "uncertain", message: "x", retryAfterSeconds: null }] as FormStatus[]) {
      const out = render(status, { outcome: "call_back", due: "2026-10-27T14:00" });
      expect(out).toMatch(/<fieldset[^>]*disabled/);
      expect(out).toMatch(/<textarea[^>]*disabled[^>]*>Left a voicemail</);
      expect(out).toMatch(/type="datetime-local"[^>]*disabled/);
    }
    const failed = render({ kind: "failed", message: "x" });
    expect(failed).not.toMatch(/<fieldset[^>]*disabled/);
    expect(failed).toContain(">Left a voicemail<");
  });

  it("without the lead's last_edited_time the submit is off and the form says to refresh", () => {
    const out = render({ kind: "idle" }, {}, { lastEditedAt: null });
    expect(out).toContain(FORM_TEXT.noEdited);
    expect(out).toMatch(/<button type="submit"[^>]*disabled/);
  });

  it("uses no em dash in its copy", () => {
    for (const t of Object.values(FORM_TEXT)) expect(t).not.toContain("—");
  });
});

describe("outcomeBody and statusOf", () => {
  const REQ = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
  it("builds a body the route accepts, with the screen's expected values", () => {
    const body = outcomeBody(LEAD, INPUT, REQ)!;
    expect(OutcomeBodySchema.parse(body)).toEqual({
      requestId: REQ, pageId: LEAD.id, outcome: "no_answer", expected: { stage: "Working", attempts: 1, lastEditedAt: LEAD.lastEditedAt }, note: "Left a voicemail",
    });
    const follow = outcomeBody(LEAD, { ...INPUT, outcome: "follow_up", nextAction: "Text", due: "2026-10-27T14:00" }, REQ)!;
    expect(OutcomeBodySchema.safeParse(follow).success).toBe(true);
    expect(follow).toMatchObject({ nextAction: "Text", due: new Date("2026-10-27T14:00").toISOString() });
    expect(outcomeBody({ ...LEAD, lastEditedAt: null }, INPUT, REQ)).toBeNull();
  });

  it("maps every answer, and anything unexpected to uncertain", () => {
    expect(statusOf(200, { status: "done", cadenceUsedUp: true, staffLinked: true })).toEqual({ kind: "done", cadenceUsedUp: true, staffLinked: true });
    expect(statusOf(202, { error: "uncertain", message: "m", retryAfterSeconds: 5 })).toEqual({ kind: "uncertain", message: "m", retryAfterSeconds: 5 });
    expect(statusOf(409, { error: "stale", current: {} })).toEqual({ kind: "stale" });
    expect(statusOf(422, { error: "contract_missing", missing: ["Grade"], notionUrl: "u" })).toEqual({ kind: "refused", message: FORM_TEXT.contract, missing: ["Grade"], notionUrl: "u" });
    expect(statusOf(502, { error: "failed", message: "m" })).toEqual({ kind: "failed", message: "m" });
    expect(statusOf(503, { error: "notion_not_ready", missing: ["Txn ID"] })).toEqual({ kind: "not_ready" });
    expect(statusOf(409, { error: "unresolved_transition" })).toMatchObject({ kind: "blocked" });
    expect(statusOf(0, null)).toMatchObject({ kind: "uncertain" });
    expect(statusOf(500, "<html>")).toMatchObject({ kind: "uncertain" });
  });
});
