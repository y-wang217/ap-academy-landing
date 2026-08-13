// Thin event-tracking seam. Components call track(); wiring these events to a
// real analytics platform is the instrumentation session — until then events
// accumulate on window.dataLayer where any tag manager can pick them up.

type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<EventParams & { event: string }>;
  }
}

export function track(event: string, params: EventParams = {}) {
  if (typeof window === "undefined") return;
  (window.dataLayer ??= []).push({ event, ...params });
  if (process.env.NODE_ENV === "development") {
    console.debug("[analytics]", event, params);
  }
}
