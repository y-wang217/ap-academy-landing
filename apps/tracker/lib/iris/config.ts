/**
 * Iris settings from the environment (REQ-42). Read at call time, never at
 * module load, so nothing is captured at build (the getServiceClient rule).
 * Only server modules import this file.
 */
export type GmailConfig = { clientEmail: string; privateKey: string; mailbox: string };

export const IRIS_ENV = ["IRIS_CRON_SECRET", "IRIS_ORG_ID", "IRIS_GMAIL_CLIENT_EMAIL", "IRIS_GMAIL_PRIVATE_KEY", "IRIS_GMAIL_MAILBOX"] as const;

/** Set by a human (REQ-44): without it the phone backup writes to-dos but no mention comments. */
export const IRIS_OPTIONAL_ENV = ["NOTION_CHARLIE_USER_ID"] as const;

/** Charlie's Notion user id, mentioned on each new to-do so Notion pushes it to his phone; null when unset. */
export function readCharlieUserId(): string | null {
  return process.env.NOTION_CHARLIE_USER_ID?.trim() || null;
}

export function readIrisRunEnv(): { secret: string | undefined; orgId: string | undefined } {
  return { secret: process.env.IRIS_CRON_SECRET || undefined, orgId: process.env.IRIS_ORG_ID || undefined };
}

/** The service account and mailbox, or null when any is unset. A key pasted with literal \n is repaired. */
export function readGmailConfig(): GmailConfig | null {
  const clientEmail = process.env.IRIS_GMAIL_CLIENT_EMAIL;
  const privateKey = process.env.IRIS_GMAIL_PRIVATE_KEY;
  const mailbox = process.env.IRIS_GMAIL_MAILBOX;
  if (!clientEmail || !privateKey || !mailbox) return null;
  return { clientEmail, privateKey: privateKey.replace(/\\n/g, "\n"), mailbox: mailbox.trim().toLowerCase() };
}

/** Google's token and Gmail hosts. The e2e stack points both at a local mock with IRIS_GMAIL_API_BASE. */
export function gmailBases(): { token: string; api: string } {
  const base = process.env.IRIS_GMAIL_API_BASE?.replace(/\/+$/, "");
  return base
    ? { token: `${base}/token`, api: `${base}/gmail/v1` }
    : { token: "https://oauth2.googleapis.com/token", api: "https://gmail.googleapis.com/gmail/v1" };
}

/** The names (never the values) of the Iris variables that are unset, for the settings page. */
export function missingIrisEnv(): string[] {
  return IRIS_ENV.filter((name) => !process.env[name]);
}

/** The mailbox address for Gmail links, or null when unset. */
export function irisMailbox(): string | null {
  return process.env.IRIS_GMAIL_MAILBOX?.trim().toLowerCase() || null;
}
