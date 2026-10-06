import type { Trend } from "@/lib/domain/trend";
import { TREND_LABEL, TREND_TONE } from "@/lib/view/pill-text";

const TONE_CLASS = {
  ok: "bg-ok-bg text-ok",
  neutral: "bg-background text-text-muted",
  warn: "bg-warn-bg text-warn",
} as const;

/** The course status pill (ADR 0031). Words carry the meaning; the tone repeats it. */
export function TrendPill({ trend }: { trend: Trend }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[TREND_TONE[trend]]}`}>{TREND_LABEL[trend]}</span>;
}
