"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserClient } from "./supabase/client";

export type SatUserState = {
  user: User | null;
  /** True until the first auth check resolves, or forever-false with no Supabase. */
  loading: boolean;
};

/**
 * Current signed-in user, or null. Resolves immediately to
 * `{ user: null, loading: false }` when Supabase isn't configured, so callers
 * fall back to anonymous behaviour without special-casing it.
 */
export function useSatUser(): SatUserState {
  const supabase = getBrowserClient();
  const [state, setState] = useState<SatUserState>({
    user: null,
    loading: supabase !== null,
  });

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) setState({ user: data.user ?? null, loading: false });
      })
      .catch(() => {
        // Supabase unreachable. Fall back to anonymous rather than leaving
        // `loading` stuck true.
        if (active) setState({ user: null, loading: false });
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ user: session?.user ?? null, loading: false });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return state;
}
