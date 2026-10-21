// Iris policy (REQ-42, spec decision 11): the one place policy text lives.
// Plain data with no imports, so tests and later prompts read it as it is.
// Founder values of Oct 16, 2026. Changing any text means bumping
// POLICY_VERSION, which every stored message records.

export const POLICY_VERSION = 1;

/** A cancellation with at least this many hours of notice is "with notice". */
export const NOTICE_HOURS = 12;

export const REPLY_TYPES = [
  "cancel_with_notice",
  "late_cancel",
  "cancellation",
  "reschedule_request",
  "reschedule_offer",
  "pause_or_stop",
  "general_question",
  "no_reply_needed",
] as const;
export type ReplyType = (typeof REPLY_TYPES)[number];

/** Intents Iris never answers itself: Charlie always replies. */
export const ESCALATE_ONLY = ["billing_question", "refund_request", "no_show", "other"] as const;
export type EscalateOnly = (typeof ESCALATE_ONLY)[number];

export const NEVER_AUTO_SEND: readonly (ReplyType | EscalateOnly)[] = ["pause_or_stop", ...ESCALATE_ONLY];

export type PolicySection = { title: string; text: string; autoSendAllowed: boolean };

export const POLICY: Record<ReplyType | EscalateOnly, PolicySection> = {
  cancel_with_notice: {
    title: "Cancellation with notice",
    text: "A class cancelled with 12 or more hours of notice is always accommodated, with no fee. We offer a make-up class between the missed class and the next scheduled one if a time works. Otherwise the class is credited on next month's invoice.",
    autoSendAllowed: true,
  },
  late_cancel: {
    title: "Late cancellation",
    text: "A class cancelled with under 12 hours of notice has no fee, but that day's class is not guaranteed. We offer a make-up class between the missed class and the next scheduled one if a time works. Otherwise the class is credited on next month's invoice.",
    autoSendAllowed: true,
  },
  cancellation: {
    title: "Cancellation",
    text: "A cancelled class has no fee. We offer a make-up class between the missed class and the next scheduled one if a time works. Otherwise the class is credited on next month's invoice.",
    autoSendAllowed: true,
  },
  reschedule_request: {
    title: "Reschedule request",
    text: "Make-up and reschedule times come only from the teacher's real availability. Until Iris can read it, say that Charlie will send some options.",
    autoSendAllowed: true,
  },
  reschedule_offer: {
    title: "Reschedule offer",
    text: "Offer only the times supplied with the message, which come from the teacher's real availability. Never book a time.",
    autoSendAllowed: true,
  },
  pause_or_stop: {
    title: "Pause or stop",
    text: "A family can pause or stop tutoring at any time, with no notice needed. Unused credits are refunded on the final invoice.",
    autoSendAllowed: false,
  },
  general_question: {
    title: "General question",
    text: "Answer only from facts in this policy and the message. If the answer is not here, say Charlie will follow up personally.",
    autoSendAllowed: true,
  },
  no_reply_needed: {
    title: "No reply needed",
    text: "No reply is sent.",
    autoSendAllowed: true,
  },
  billing_question: {
    title: "Billing question",
    text: "There is one invoice a month, sent on the 1st. Questions about invoices or money go to Charlie.",
    autoSendAllowed: false,
  },
  refund_request: {
    title: "Refund request",
    text: "Refunds are never handled by Iris. Charlie replies personally.",
    autoSendAllowed: false,
  },
  no_show: {
    title: "No-show",
    text: "A class missed with no message before it started is forfeited, and Charlie can override that. Iris never confirms a forfeit.",
    autoSendAllowed: false,
  },
  other: {
    title: "Other",
    text: "Anything this policy does not cover goes to Charlie.",
    autoSendAllowed: false,
  },
};

export const HARD_RULES: readonly string[] = [
  "Escalate legal threats, crisis language and financial hardship.",
  "Escalate a message with two or more requests.",
  "Escalate when unsure.",
  "Never process or promise a refund.",
  "Never name a dollar amount.",
  "Never promise a specific make-up time unless it comes from real teacher availability.",
  "Never confirm a forfeit.",
];

export const HOLDING_LINE = "Charlie will follow up with you personally.";
