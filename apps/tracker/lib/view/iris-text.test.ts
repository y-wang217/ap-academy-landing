import { describe, expect, it } from "vitest";
import { IRIS_TEXT, ageText, gmailThreadUrl, notSetUpText, runSummaryText, stateLabel } from "./iris-text";

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
