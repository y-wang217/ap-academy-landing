// Iris policy (REQ-42, spec decision 11): the one place policy text lives.
// Plain data with no imports, so tests and later prompts read it as it is.
// Founder values of Oct 16, 2026. Changing any text means bumping
// POLICY_VERSION, which every stored message records. Version 2 (REQ-43)
// adds the classifier intents, the flags and the sensitive-trigger phrases.
// Version 3 (REQ-44) adds the voice rules, the signature and what gets a draft.
// Version 4 (REQ-46) splits cancellations by notice from the scheduler.

export const POLICY_VERSION = 4;

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

/**
 * How every draft reads (REQ-44, spec 4.4). The model writes the body only.
 * Worded apart from HARD_RULES, which belong to the classifier prompt.
 */
export const VOICE_RULES: readonly string[] = [
  "Write plainly and briefly, in the first person, as Charlie.",
  "Do not sign the email: the signature is added for you.",
  "Do not say or suggest that an AI, an assistant or an automated system wrote it.",
  "Do not mention any dollar amount or price.",
  "Do not name a specific make-up or class time unless one is supplied below.",
  "Do not confirm that a missed class is forfeited.",
  "Do not promise money back.",
  `If you are unsure, use this line and set needs_charlie: "${HOLDING_LINE}"`,
];

/** Appended by code to every reply, once (spec decision 13). */
export const SIGNATURE = "Charlie\nAP Academy";

/** Classified intents that get a draft (spec 4.4). */
export const DRAFTABLE_INTENTS = ["cancellation", "reschedule_request", "pause_or_stop", "general_question"] as const;
/** Escalate-only intents that still get a draft for Charlie to edit. */
export const DRAFTABLE_ESCALATIONS = ["no_show"] as const;
/** What a classified cancellation becomes once the scheduler shows its notice (REQ-46). */
export const SCHEDULE_REPLY_TYPES = ["cancel_with_notice", "late_cancel"] as const;
export type DraftableType = (typeof DRAFTABLE_INTENTS)[number] | (typeof DRAFTABLE_ESCALATIONS)[number] | (typeof SCHEDULE_REPLY_TYPES)[number];

/**
 * What the classifier may answer (REQ-43). cancel_with_notice and late_cancel
 * come from the scheduler, never the model (REQ-46); reschedule_offer (Iris
 * 7/9) is a reply type it never picks either.
 */
export const CLASSIFIER_INTENTS = [
  "cancellation",
  "reschedule_request",
  "pause_or_stop",
  "general_question",
  "no_reply_needed",
  "billing_question",
  "refund_request",
  "no_show",
  "other",
] as const;
export type ClassifierIntent = (typeof CLASSIFIER_INTENTS)[number];

export const INTENT_HINTS: Record<ClassifierIntent, string> = {
  cancellation: "The family says a class will not happen, for example the student is sick or away.",
  reschedule_request: "The family asks to move a class to another time.",
  pause_or_stop: "The family wants to pause or stop tutoring.",
  general_question: "A question about classes, timing or tutoring that is not about money.",
  no_reply_needed: "A thank-you, an acknowledgement or a note that needs no answer.",
  billing_question: "Anything about an invoice, a payment, a charge or a price.",
  refund_request: "The family asks for money back.",
  no_show: "The family explains or asks about a class the student missed without telling anyone first.",
  other: "Anything that fits none of the intents above.",
};

/** Intents that need one named child: a sibling family that names none escalates. */
export const CHILD_SCOPED: readonly ClassifierIntent[] = ["cancellation", "reschedule_request"];

/** Sensitive flags (Iris Policy Rules R-3, plus refund). Any flag escalates. */
export const FLAGS = ["money_dispute", "legal_threat", "crisis", "hardship", "refund"] as const;
export type Flag = (typeof FLAGS)[number];

/**
 * Flags code adds after the schedule read (REQ-46). Kept out of FLAGS, so the
 * classifier is never asked for them and they never escalate.
 */
export const SCHEDULE_FLAGS = ["schedule_unknown"] as const;

export const FLAG_HINTS: Record<Flag, string> = {
  money_dispute: "The family disputes a charge, an amount or a payment.",
  legal_threat: "A threat of legal action, a chargeback, a complaint body or a public review.",
  crisis: "Self-harm, abuse, danger or a family crisis.",
  hardship: "Medical trouble, a death, or financial hardship.",
  refund: "Any mention of a refund or money back.",
};

/**
 * The keyword backstop: lower-case phrases that add a flag whatever the model
 * says. They can only escalate. Synthetic, no real parent words.
 */
export const SENSITIVE_TRIGGERS: Record<Flag, readonly string[]> = {
  money_dispute: ["charged twice", "double charged", "didn't authorize", "did not authorize", "overcharged", "wrong amount", "dispute the charge", "never agreed to pay"],
  legal_threat: ["chargeback", "lawyer", "legal action", "small claims", "better business bureau", "bbb", "bad review", "sue you", "report you"],
  crisis: ["self-harm", "hurt himself", "hurt herself", "hurt themselves", "suicid", "abuse", "unsafe at home", "police were called", "family emergency"],
  hardship: ["passed away", "funeral", "in the hospital", "lost his job", "lost her job", "lost my job", "laid off", "can't afford", "cannot afford", "diagnosed with"],
  refund: ["refund", "money back", "reimburse"],
};
