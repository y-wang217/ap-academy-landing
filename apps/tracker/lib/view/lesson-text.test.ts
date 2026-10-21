import { describe, expect, it } from "vitest";
import { LESSON_TEXT, lessonErrorText, LESSON_ERRORS, loggedLabel, outcomeBadge, outcomeView } from "./lesson-text";

describe("REQ-39 AC11: lesson copy", () => {
  it("names each state with the exact lines", () => {
    expect(loggedLabel("2026-10-15")).toBe("Logged (Thu Oct 15)");
    expect(outcomeView({ linkable: true, outcome: null })).toEqual({ kind: "actions" });
    expect(outcomeView({ linkable: true, outcome: { state: "delivered", lessonDate: "2026-10-15", lessonUrl: "u" } })).toEqual({ kind: "delivered", label: "Logged (Thu Oct 15)", url: "u" });
    expect(outcomeView({ linkable: true, outcome: { state: "no_show" } })).toEqual({ kind: "no_show", label: "No-show" });
    expect(outcomeView({ linkable: true, outcome: { state: "logging", stale: false } })).toEqual({ kind: "logging", label: "Saving to Notion…", retry: false });
    expect(outcomeView({ linkable: true, outcome: { state: "logging", stale: true } })).toEqual({ kind: "logging", label: "Not saved to Notion yet.", retry: true });
    expect(outcomeView({ linkable: false, outcome: null })).toBeNull();
    expect(outcomeView({ linkable: undefined, outcome: undefined })).toBeNull();
  });
  it("the card face shows a badge only for logged and no-show", () => {
    expect(outcomeBadge({ outcome: { state: "delivered", lessonDate: "2026-10-15", lessonUrl: "u" } })).toEqual({ icon: "✓", label: "Logged" });
    expect(outcomeBadge({ outcome: { state: "no_show" } })).toEqual({ icon: "✕", label: "No-show" });
    expect(outcomeBadge({ outcome: { state: "logging", stale: false } })).toBeNull();
    expect(outcomeBadge({ outcome: null })).toBeNull();
  });
  it("the fixed lines are the design's", () => {
    expect(LESSON_TEXT).toMatchObject({
      log: "Log this class", openLesson: "Open lesson in Notion", notesHint: "Add your notes in Notion. Do not also send the Log a Lesson form for this class.",
      noShow: "Mark no-show", confirmNoShow: "Mark this class as a no-show? Only Charlie can undo it.", tryAgain: "Try again", clear: "Clear",
      confirmClearNoShow: "Clear this no-show?", confirmUnlink: "Unlink this lesson? The Notion row stays. Only its class link is cleared.",
      notSetUp: "Lesson logging is not set up yet.", statusUnavailable: "Could not load lesson status.", frozen: "This class is already logged or marked. Ask Charlie to clear it first.",
    });
  });
  it("one line per error code, and a fallback", () => {
    for (const code of ["not_linkable", "already_recorded", "log_in_progress", "duplicate_link", "notion_failed", "lessons_not_ready", "ref_in_use", "lesson_linked_elsewhere", "lesson_mismatch", "forbidden", "not_found", "has_outcome"]) {
      expect(LESSON_ERRORS[code], code).toBeTruthy();
      expect(lessonErrorText(code)).toBe(LESSON_ERRORS[code]);
    }
    expect(lessonErrorText(undefined)).toBe("That did not save. Please try again.");
  });
  it("no copy uses an em dash", () => {
    const all = [...Object.values(LESSON_TEXT), ...Object.values(LESSON_ERRORS), loggedLabel("2026-10-15")];
    for (const s of all) expect(s).not.toContain("—");
  });
});
