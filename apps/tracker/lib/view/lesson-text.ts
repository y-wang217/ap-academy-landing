import { formatDayHeading } from "./availability-text";

/**
 * Copy for lesson logging (REQ-39 AC11). Plain and short, no em dashes.
 * The class dialog and the Unlinked lessons page read every line from here.
 */
export const LESSON_TEXT = {
  log: "Log this class",
  logging: "Saving to Notion…",
  notSaved: "Not saved to Notion yet.",
  tryAgain: "Try again",
  openLesson: "Open lesson in Notion",
  notesHint: "Add your notes in Notion. Do not also send the Log a Lesson form for this class.",
  noShow: "Mark no-show",
  noShowLabel: "No-show",
  confirmNoShow: "Mark this class as a no-show? Only Charlie can undo it.",
  clear: "Clear",
  confirmClearNoShow: "Clear this no-show?",
  confirmUnlink: "Unlink this lesson? The Notion row stays. Only its class link is cleared.",
  notSetUp: "Lesson logging is not set up yet.",
  statusUnavailable: "Could not load lesson status.",
  frozen: "This class is already logged or marked. Ask Charlie to clear it first.",
  link: "Link",
  linking: "Linking…",
  open: "Open",
  noMatch: "No matching lesson in Notion.",
  listError: "Could not load lessons from Notion. Try again.",
  listEmpty: "Every class in these dates is logged or marked.",
} as const;

export const LESSON_ERRORS: Record<string, string> = {
  not_linkable: "This class cannot be logged: it is cancelled or has not happened yet.",
  already_recorded: "This class is already logged or marked.",
  log_in_progress: "Another save for this class is in progress. Try again in a minute.",
  duplicate_link: "Two lessons in Notion point at this class. Ask Charlie to fix it in Notion.",
  notion_failed: "Notion did not answer. Try again.",
  lessons_not_ready: LESSON_TEXT.notSetUp,
  ref_in_use: "Another lesson in Notion is already linked to this class.",
  lesson_linked_elsewhere: "That lesson is already linked to another class.",
  lesson_mismatch: "That lesson's teacher, student or date does not match this class.",
  forbidden: "This is not available for your account.",
  not_found: "That class or lesson was not found.",
  has_outcome: LESSON_TEXT.frozen,
};

export const lessonErrorText = (code: string | undefined) => (code && LESSON_ERRORS[code]) || "That did not save. Please try again.";

export type OutcomeState =
  | { state: "logging"; stale: boolean }
  | { state: "delivered"; lessonDate: string | null; lessonUrl: string }
  | { state: "no_show" };

export const loggedLabel = (lessonDate: string | null) => (lessonDate ? `Logged (${formatDayHeading(lessonDate)})` : "Logged");

export type OutcomeView =
  | { kind: "actions" }
  | { kind: "delivered"; label: string; url: string }
  | { kind: "no_show"; label: string }
  | { kind: "logging"; label: string; retry: boolean };

/** What the class dialog shows for a past class; null for future and cancelled classes. */
export function outcomeView(card: { linkable?: boolean; outcome?: OutcomeState | null }): OutcomeView | null {
  if (!card.linkable) return null;
  const o = card.outcome;
  if (!o) return { kind: "actions" };
  if (o.state === "delivered") return { kind: "delivered", label: loggedLabel(o.lessonDate), url: o.lessonUrl };
  if (o.state === "no_show") return { kind: "no_show", label: LESSON_TEXT.noShowLabel };
  return { kind: "logging", label: o.stale ? LESSON_TEXT.notSaved : LESSON_TEXT.logging, retry: o.stale };
}

/** The card face's badge: "✓ Logged" or "No-show". */
export function outcomeBadge(card: { outcome?: OutcomeState | null }): { icon: string; label: string } | null {
  if (card.outcome?.state === "delivered") return { icon: "✓", label: "Logged" };
  if (card.outcome?.state === "no_show") return { icon: "✕", label: LESSON_TEXT.noShowLabel };
  return null;
}
