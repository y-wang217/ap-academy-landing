"use client";

import { getBrowserClient } from "../supabase/client";

/**
 * Records one answered question. Fire-and-forget: a student mid-quiz should
 * never be blocked or shown an error because logging failed, and everything
 * derived from `attempts` tolerates a missing row.
 */
export function logAttempt(userId: string, wordId: number, correct: boolean): void {
  const supabase = getBrowserClient();
  if (!supabase) return;

  void supabase
    .from("attempts")
    .insert({ user_id: userId, word_id: wordId, correct })
    .then(({ error }) => {
      if (error && process.env.NODE_ENV !== "production") {
        console.warn("attempt not logged:", error.message);
      }
    });
}
