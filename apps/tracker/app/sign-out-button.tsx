"use client";

import { getBrowserClient } from "@ap-academy/db/browser";
import { useState } from "react";

/**
 * Signs out of the one shared session, so landing and /sat are signed out too.
 * Leaves the tracker with a full page load: "/" belongs to landing, and a
 * client-side navigation would stay inside this app's basePath.
 */
export default function SignOutButton() {
  const [failed, setFailed] = useState(false);

  async function signOut() {
    const supabase = getBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setFailed(true);
      return;
    }
    window.location.assign("/");
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={signOut}
        className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-surface hover:opacity-90"
      >
        Sign out
      </button>
      {failed && (
        <p role="alert" className="text-sm text-accent">
          Sign out failed. Try again.
        </p>
      )}
    </div>
  );
}
