/** Words and tone for the course status pill (ADR 0031). */
import type { Trend } from "../domain/trend";

export const TREND_LABEL: Record<Trend, string> = {
  improving: "Improving",
  stable: "Stable",
  needs_focus: "Needs focus",
  no_grades: "No grades yet",
};

/** The app palette: green for a rise, amber for a gap, neutral otherwise. Red stays for errors. */
export const TREND_TONE: Record<Trend, "ok" | "neutral" | "warn"> = {
  improving: "ok",
  stable: "neutral",
  needs_focus: "warn",
  no_grades: "neutral",
};
