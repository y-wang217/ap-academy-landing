"use client";

import { useState, useSyncExternalStore } from "react";
import BookCallLink from "./BookCallLink";

// The one-line offer at the very top, for the parent who already knows what
// they want. Dismissal lasts the tab (sessionStorage), never longer: a parent
// who comes back tomorrow should see it again.

const DISMISSED_KEY = "ap-announcement-dismissed";

const subscribe = () => () => {};
const readDismissed = () => {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false; // Storage blocked: the bar simply shows.
  }
};
const serverSnapshot = () => false;

export default function AnnouncementBar() {
  const dismissedEarlier = useSyncExternalStore(subscribe, readDismissed, serverSnapshot);
  const [dismissedNow, setDismissedNow] = useState(false);

  const dismiss = () => {
    setDismissedNow(true);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to persist; the bar is already hidden for this render.
    }
  };

  if (dismissedEarlier || dismissedNow) return null;

  return (
    <div className="bg-dark text-text-on-dark">
      <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-4 px-5 py-2.5 md:px-10">
        <p className="text-[13.5px] leading-snug">
          <span className="hidden sm:inline">1-on-1 tutoring for grade 11 and 12 math, physics and chemistry. </span>
          Your first lesson is free.{" "}
          <BookCallLink
            placement="announcement"
            className="font-semibold underline decoration-accent-light/60 underline-offset-4 transition-colors hover:text-accent-light"
          >
            Book a call
          </BookCallLink>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-text-on-dark-muted transition-colors hover:bg-white/10 hover:text-text-on-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
