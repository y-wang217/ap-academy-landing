/** What every server action returns. A failure is never shown as saved. */
export type Result =
  | { ok: true; message?: string; doneAt?: string | null }
  | { ok: false; error: string; fields?: Record<string, string> };

export const failed = (error: string, fields?: Record<string, string>): Result => ({ ok: false, error, fields });
