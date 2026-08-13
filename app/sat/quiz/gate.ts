/**
 * Soft daily limit for anonymous users. Client-side by design: this is friction
 * that prompts registration, not access control. Clearing localStorage gets
 * around it, and that is an accepted outcome — do not add server enforcement.
 */
export const DAILY_LIMIT = 10;

const STORAGE_KEY = "sat-quiz-daily";

type DailyRecord = { date: string; count: number };

/** Local calendar date, so the counter rolls over at the student's midnight. */
function today(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function readCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("date" in parsed) ||
      !("count" in parsed)
    ) {
      return 0;
    }
    const record = parsed as DailyRecord;
    if (record.date !== today() || typeof record.count !== "number") return 0;
    return record.count;
  } catch {
    // Private browsing, disabled storage, or malformed JSON — fail open.
    return 0;
  }
}

export function bumpCount(): number {
  const next = readCount() + 1;
  if (typeof window !== "undefined") {
    try {
      const record: DailyRecord = { date: today(), count: next };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Storage unavailable — the session still works, it just won't persist.
    }
  }
  return next;
}
