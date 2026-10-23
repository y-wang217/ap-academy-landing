import { describe, expect, it } from "vitest";
import { IRIS_TEXT, ageText, confidenceText, flagLabel, gmailThreadUrl, intentLabel, notSetUpText, reasonLabel, runSummaryText, stateLabel } from "./iris-text";

// REQ-42 AC26, AC27: the Iris page copy.
describe("iris-text", () => {
  it("labels every state", () => {
    expect(stateLabel("matched", null)).toBe("Family found");
    expect(stateLabel("received", null)).toBe("Waiting for Notion");
    expect(stateLabel("escalated", "unknown_sender")).toBe("Unknown sender");
    expect(stateLabel("escalated", "automated")).toBe("Automated, handled");
    expect(stateLabel("failed", null)).toBe("Failed");
  });

  it("has the list, empty, paused, error and Unpause tick copy", () => {
    expect(IRIS_TEXT).toMatchObject({
      needsYou: "Needs you",
      recent: "Recent mail",
      nothingNeedsYou: "Nothing needs you.",
      noMail: "No mail yet. Iris reads new mail every 15 minutes once it is running.",
      paused: "Iris is paused. It reads no mail until you unpause it in Settings.",
      loadError: "Could not load Iris. Try again shortly.",
      openInGmail: "Open in Gmail",
      unpauseTick: "The privacy page is live and families are writing to charlie@apacademy.ca",
      saveFailed: "Could not save. Try again.",
    });
    expect(notSetUpText(["IRIS_GMAIL_PRIVATE_KEY", "IRIS_CRON_SECRET"])).toBe("Not set up: IRIS_GMAIL_PRIVATE_KEY, IRIS_CRON_SECRET");
  });

  it("uses no em or en dashes anywhere", () => {
    const all = [...Object.values(IRIS_TEXT), ...["matched", "received", "failed"].map((s) => stateLabel(s as "matched", null)), stateLabel("escalated", "automated"), runSummaryText({ result: "ok", stored: 3, matched: 2, escalated: 1 })].join("\n");
    expect(all).not.toMatch(/[–—]/);
  });

  it("says ages in minutes, hours and days", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(ageText("2026-10-20T11:40:00Z", now)).toBe("20 min");
    expect(ageText("2026-10-20T10:00:00Z", now)).toBe("2 h");
    expect(ageText("2026-10-19T11:00:00Z", now)).toBe("1 d");
    expect(ageText("2026-10-20T11:59:50Z", now)).toBe("1 min");
  });

  it("summarises a run and links a Gmail thread", () => {
    expect(runSummaryText({ result: "ok", stored: 3, matched: 2, escalated: 1 })).toBe("ok · 3 new, 2 matched, 1 escalated");
    expect(gmailThreadUrl("charlie@apacademy.ca", "18f2a")).toBe("https://mail.google.com/mail/?authuser=charlie%40apacademy.ca#all/18f2a");
  });
});

// REQ-43 AC14: every new state and reason has a label.
describe("iris-text: classification labels", () => {
  it("labels classified and every escalation reason", () => {
    expect(stateLabel("classified", null)).toBe("Ready for a draft");
    expect(stateLabel("escalated", "flagged", { flags: ["money_dispute"] })).toBe("Sensitive: money dispute");
    expect(stateLabel("escalated", "flagged", { flags: ["legal_threat", "refund"] })).toBe("Sensitive: legal threat, refund");
    expect(stateLabel("escalated", "multi_intent")).toBe("Two requests");
    expect(stateLabel("escalated", "low_confidence")).toBe("Unsure");
    expect(stateLabel("escalated", "escalate_only", { intent: "billing_question" })).toBe("Billing question, for you");
    expect(stateLabel("escalated", "ambiguous_student")).toBe("Which child?");
    expect(stateLabel("escalated", "no_reply_needed")).toBe("No reply needed, handled");
    expect(stateLabel("escalated", null)).toBe("Needs you");
  });

  it("names intents by their policy title and formats confidence as a percent", () => {
    expect(intentLabel("cancellation")).toBe("Cancellation");
    expect(intentLabel("not_a_real_intent")).toBe("not_a_real_intent");
    expect(intentLabel(null)).toBe("Not classified");
    expect(confidenceText(0.92)).toBe("92%");
    expect(confidenceText(0.855)).toBe("86%");
    expect(confidenceText(null)).toBe("-");
  });

  it("has the AI and Mark handled copy, with no em or en dashes", () => {
    expect(IRIS_TEXT).toMatchObject({ aiNotSetUp: "AI is not set up", markHandled: "Mark handled", handled: "Handled", saving: "Saving...", messageLoadError: "Could not load this message.", bodyNotStored: "Body not stored" });
    const all = [
      ...Object.values(IRIS_TEXT),
      ...["flagged", "multi_intent", "low_confidence", "escalate_only", "ambiguous_student", "no_reply_needed"].map((r) => stateLabel("escalated", r, { flags: ["crisis"], intent: "other" })),
      stateLabel("classified", null),
    ].join("\n");
    expect(all).not.toMatch(/[–—]/);
  });
});

// REQ-44 AC13: every new state and reason has a label, and every section an empty line.
describe("iris-text, drafting", () => {
  it("labels the new states and reasons", () => {
    expect(stateLabel("drafted", null)).toBe("Draft waiting");
    expect(stateLabel("approved", null)).toBe("Approved, send by hand");
    expect(stateLabel("sent", null)).toBe("Sent");
    expect(stateLabel("escalated", "needs_charlie")).toBe("Iris wants you to check");
    expect(stateLabel("escalated", "draft_rule")).toBe("Draft held back");
    expect(stateLabel("escalated", "draft_rejected")).toBe("You rejected the draft");
    expect(stateLabel("escalated", "answered_by_charlie")).toBe("You replied in Gmail");
    expect(stateLabel("escalated", "escalate_only", { intent: "no_show" })).toBe("No-show, for you");
    expect(reasonLabel("unknown_sender")).toBe("Unknown sender");
  });

  it("has the section, empty, editor and copy strings, with no em dash", () => {
    expect(IRIS_TEXT).toMatchObject({
      draftsWaiting: "Drafts waiting", sentToday: "Sent today", failedSection: "Failed",
      noDraftsWaiting: "No drafts waiting.", nothingSentToday: "Nothing approved or sent today.", nothingFailed: "Nothing failed.",
      phoneCopyFailed: "Phone copy failed", saveFailed: "Could not save. Try again.", approvedCopy: "Approved. Paste it into Gmail and send it yourself.",
      phoneAlertsOff: "Phone alerts are off (NOTION_CHARLIE_USER_ID is not set).",
    });
    for (const v of Object.values(IRIS_TEXT)) if (typeof v === "string") expect(v).not.toMatch(/[—]/);
  });
});

// REQ-46 AC9: the schedule flag and the schedule no-show reason.
describe("iris-text: schedule-aware cancellations", () => {
  it("labels schedule_unknown and schedule_no_show, with no em or en dashes", () => {
    expect(flagLabel("schedule_unknown")).toBe("schedule unknown");
    expect(reasonLabel("schedule_no_show")).toBe("Wrote after class started");
    expect(stateLabel("escalated", "schedule_no_show", { intent: "no_show" })).toBe("Wrote after class started");
    expect([flagLabel("schedule_unknown"), reasonLabel("schedule_no_show")].join("\n")).not.toMatch(/[–—]/);
  });
});

// REQ-47 AC11: the two new schedule flags and the offer note.
describe("iris-text: make-up offers", () => {
  it("labels the flags and carries the offer note, with no em dash", () => {
    expect(flagLabel("availability_not_entered")).toBe("teacher availability not entered");
    expect(flagLabel("no_free_slot")).toBe("no free make-up time");
    expect(IRIS_TEXT.offerNote).toBe("Times come from the teacher's availability. Nothing is booked: book the time the family picks in Schedule.");
    expect(IRIS_TEXT.bookInSchedule).toBe("Open Schedule");
    expect([IRIS_TEXT.offerNote, IRIS_TEXT.bookInSchedule, flagLabel("availability_not_entered"), flagLabel("no_free_slot")].join("\n")).not.toMatch(/[–—]/);
  });
});
