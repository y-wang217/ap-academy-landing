/** Every line of Iris copy (REQ-42). Plain, short, no em dashes. */
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
} as const;

export function stateLabel(state: "received" | "matched" | "escalated" | "failed", reason: string | null): string {
  switch (state) {
    case "matched":
      return "Family found";
    case "received":
      return "Waiting for Notion";
    case "failed":
      return "Failed";
    case "escalated":
      return reason === "automated" ? "Automated, handled" : reason === "unknown_sender" ? "Unknown sender" : "Needs you";
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
