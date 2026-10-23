import { POLICY } from "../iris/policy";
import type { MessageState } from "../iris/store";

/** Every line of Iris copy (REQ-42, REQ-43, REQ-44, REQ-47, REQ-48). Plain, short, no em dashes. */
export const IRIS_TEXT = {
  title: "Iris inbox",
  settingsTitle: "Iris settings",
  needsYou: "Needs you",
  recent: "Recent mail",
  nothingNeedsYou: "Nothing needs you.",
  noMail: "No mail yet. Iris reads new mail every 15 minutes once it is running.",
  paused: "Iris is paused. It reads no mail until you unpause it in Settings.",
  loadError: "Could not load Iris. Try again shortly.",
  openInGmail: "Open in Gmail",
  statusPaused: "Paused",
  statusRunning: "Running",
  pause: "Pause",
  unpause: "Unpause",
  unpauseTick: "The privacy page is live and families are writing to charlie@apacademy.ca",
  runNow: "Run now",
  lastRun: "Last run",
  lastError: "Last error",
  none: "none",
  never: "Never",
  saveFailed: "Could not save. Try again.",
  runFailed: "The run failed. See the last error.",
  aiNotSetUp: "AI is not set up",
  aiNotSetUpDetail: "Matched mail waits at Family found until ANTHROPIC_API_KEY is set.",
  confidenceThreshold: "Escalate under",
  markHandled: "Mark handled",
  handled: "Handled",
  saving: "Saving...",
  messageLoadError: "Could not load this message.",
  messageNotFound: "This message is not here. It may have been deleted.",
  bodyNotStored: "Body not stored",
  whatIrisRead: "What Iris read",
  intent: "Intent",
  confidence: "Confidence",
  flags: "Flags",
  reason: "Reason",
  policyVersion: "Policy version",
  from: "From",
  received: "Received",
  state: "State",
  inbox: "Inbox",
  draftsWaiting: "Drafts waiting",
  sentToday: "Sent today",
  failedSection: "Failed",
  noDraftsWaiting: "No drafts waiting.",
  nothingSentToday: "Nothing approved or sent today.",
  nothingFailed: "Nothing failed.",
  phoneCopyFailed: "Phone copy failed",
  thread: "Thread",
  parent: "Parent",
  charlie: "Charlie",
  noEarlierMessages: "No earlier messages in this thread.",
  draft: "Draft",
  noDraft: "No draft for this message.",
  policyUsed: "Policy used",
  offerNote: "Times come from the teacher's availability. Nothing is booked: book the time the family picks in Schedule.",
  bookInSchedule: "Open Schedule",
  policyVersionNote: (drafted: number, current: number) => `Drafted under policy version ${drafted}; current is ${current}.`,
  signatureNote: "Added below your reply:",
  approve: "Approve and send",
  saveEdit: "Save edit",
  reject: "Reject",
  rejectReason: "Why are you rejecting it?",
  copy: "Copy",
  copied: "Copied",
  approvedCopy: "Approved. Paste it into Gmail and send it yourself.",
  sending: "Sending...",
  sendingNow: "Approved. Sending now.",
  sendPending: (error: string) => `Approved. Not sent yet: ${error}. Iris tries again on its next run.`,
  sentAt: (time: string) => `Sent ${time}`,
  sendFailed: (error: string) => `Send failed: ${error}`,
  retry: "Retry",
  retrying: "Retrying...",
  olderVersions: "Earlier versions",
  versionLine: (version: number, state: string, by: string) => `Version ${version}, ${state}, by ${by}`,
  phoneAlertsOff: "Phone alerts are off (NOTION_CHARLIE_USER_ID is not set).",
  confidenceShort: "conf.",
} as const;

const FLAG_LABELS: Record<string, string> = {
  money_dispute: "money dispute",
  schedule_unknown: "schedule unknown",
  availability_not_entered: "teacher availability not entered",
  no_free_slot: "no free make-up time",
  legal_threat: "legal threat",
  crisis: "crisis",
  hardship: "hardship",
  refund: "refund",
};
export const flagLabel = (f: string) => FLAG_LABELS[f] ?? f;

/** An intent by its policy title: "Cancellation". */
export function intentLabel(intent: string | null): string {
  if (!intent) return "Not classified";
  return (POLICY as Record<string, { title: string } | undefined>)[intent]?.title ?? intent;
}

/** 0.92 as "92%". */
export const confidenceText = (c: number | null) => (c === null ? "-" : `${Math.round(c * 100)}%`);

/** Why a message needs Charlie, for the phone copy and the reason line. */
export function reasonLabel(reason: string | null, extra: { flags?: string[]; intent?: string | null } = {}): string {
  switch (reason) {
    case "automated":
      return "Automated, handled";
    case "unknown_sender":
      return "Unknown sender";
    case "flagged":
      return extra.flags && extra.flags.length > 0 ? `Sensitive: ${extra.flags.map(flagLabel).join(", ")}` : "Sensitive";
    case "multi_intent":
      return "Two requests";
    case "low_confidence":
      return "Unsure";
    case "escalate_only":
      return extra.intent ? `${intentLabel(extra.intent)}, for you` : "For you";
    case "ambiguous_student":
      return "Which child?";
    case "no_reply_needed":
      return "No reply needed, handled";
    case "needs_charlie":
      return "Iris wants you to check";
    case "draft_rule":
      return "Draft held back";
    case "schedule_no_show":
      return "Wrote after class started";
    case "draft_rejected":
      return "You rejected the draft";
    case "answered_by_charlie":
      return "You replied in Gmail";
    default:
      return "Needs you";
  }
}

export const DRAFT_STATE_LABELS: Record<string, string> = {
  proposed: "proposed",
  approved: "approved",
  rejected: "rejected",
  superseded: "replaced",
  sent: "sent",
  failed: "failed",
};

export function stateLabel(state: MessageState, reason: string | null, extra: { flags?: string[]; intent?: string | null } = {}): string {
  switch (state) {
    case "drafted":
      return "Draft waiting";
    case "approved":
      return "Approved, sending";
    case "sent":
      return "Sent";
    case "matched":
      return "Family found";
    case "received":
      return "Waiting for Notion";
    case "classified":
      return "Ready for a draft";
    case "failed":
      return "Failed";
    case "escalated":
      // escalate_only keeps its old wording when the intent is unknown.
      return reason === "escalate_only" ? `${intentLabel(extra.intent ?? null)}, for you` : reasonLabel(reason, extra);
  }
}

export const notSetUpText = (names: string[]) => `Not set up: ${names.join(", ")}`;

/** "20 min", "2 h", "1 d": how long ago, rounded down, at least a minute. */
export function ageText(iso: string, nowMs: number): string {
  const minutes = Math.max(1, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function runSummaryText(r: { result: string; stored: number; matched: number; escalated: number }): string {
  return `${r.result} · ${r.stored} new, ${r.matched} matched, ${r.escalated} escalated`;
}

export function gmailThreadUrl(mailbox: string | null, threadId: string): string {
  const user = mailbox ? `?authuser=${encodeURIComponent(mailbox)}` : "";
  return `https://mail.google.com/mail/${user}#all/${encodeURIComponent(threadId)}`;
}

/** The eval page and the readiness card (REQ-45). Plain, short, no em dashes. */
export const EVAL_TEXT = {
  title: "Evaluation",
  link: "Evaluation",
  paused: "Iris is paused: import and evaluation wait until it runs",
  empty: "No history imported yet. Import history reads the last 365 days of family mail.",
  loadError: "Could not load evaluation. Try again.",
  importLabel: "Import",
  runLabel: "Run",
  importHistory: "Import history",
  runEvaluation: "Run evaluation",
  recordResults: "Record results",
  runNow: "Run now",
  requested: "Requested. It runs with the next poll.",
  pending: "Waiting for the next poll",
  notStarted: "Not started",
  capped: "Some older mail was not imported",
  stale: "Stopped: the policy or model changed. Run it again.",
  latestRun: "Latest recorded run",
  noRun: "No run recorded yet.",
  detailsPurged: "Details purged; aggregates kept",
  confusion: "Confusion (gold rows, predicted columns)",
  sensitiveRecall: "sensitive recall",
  type: "type",
  count: "count",
  precision: "precision",
  recall: "recall",
  meanRating: "mean rating",
  filterUnlabelled: "Unlabelled",
  filterLabelled: "Labelled",
  filterAll: "All",
  message: "Message",
  charlieReplied: "Charlie replied",
  noReply: "No reply found",
  goldIntent: "Gold intent",
  goldReplyType: "Gold reply type",
  escalate: "Escalate",
  yes: "yes",
  no: "no",
  note: "Note",
  none: "None",
  save: "Save",
  saved: "Saved",
  irisDraft: (policy: number) => `Iris draft (policy ${policy})`,
  irisEscalated: "Iris would escalate this one.",
  evalError: "The AI call failed for this message.",
  rating: "Rating",
  ratingHint: "5 means you would send it as is.",
  saveRating: "Save rating",
  escalateWithType: "Escalate yes needs reply type None.",
  readiness: "Auto-send readiness",
  never: "Never sent automatically",
  met: "met",
  notMet: "not met",
  noRecordedRun: "no recorded run",
  staleRun: "the recorded run is out of date",
  noSwitchNote: "No type can be switched on yet. That comes with a later card.",
} as const;

export const evalCountsText = (s: { storedInbound: number; storedReplies: number; skipped: number }) =>
  `${s.storedInbound} messages, ${s.storedReplies} replies, ${s.skipped} skipped`;

export const evalProgressText = (done: number, total: number, unrated: number) => `${done} of ${total} · ${unrated} drafts unrated`;

export const pageText = (page: number, pages: number) => `Page ${page} of ${Math.max(1, pages)}`;

/** One gate condition, in words, for the readiness card (REQ-45 AC11). */
export function gateConditionText(condition: string, ctx: { count: number; streak: number; threshold: number }): string {
  switch (condition) {
    case "labelled_count":
      return `${ctx.count}/${ctx.threshold} labelled`;
    case "precision":
      return EVAL_TEXT.precision;
    case "sensitive_recall":
      return EVAL_TEXT.sensitiveRecall;
    case "mean_rating":
      return EVAL_TEXT.meanRating;
    case "streak":
      return `streak ${ctx.streak}/${ctx.threshold}`;
    case "no_run":
      return EVAL_TEXT.noRecordedRun;
    case "stale_run":
      return EVAL_TEXT.staleRun;
    default:
      return condition;
  }
}

/** The conditions the card lists for every candidate type, in order. */
export const READINESS_CONDITIONS = ["labelled_count", "precision", "sensitive_recall", "mean_rating", "streak"] as const;

export const neverLineText = (types: readonly string[]) => `${EVAL_TEXT.never}: ${types.join(", ")}`;

/** A ratio as two decimals, or "-". */
export const ratioText = (v: number | null | undefined) => (v === null || v === undefined ? "-" : v.toFixed(2));
