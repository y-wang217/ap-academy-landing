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
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={signOut} className="text-sm font-medium text-accent underline underline-offset-2">
        Sign out
      </button>
      {failed && (
        <span role="alert" className="text-xs text-error">
          Sign out failed. Try again.
        </span>
      )}
    </span>
  );
}
