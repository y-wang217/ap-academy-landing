"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "../supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  // CASL: express consent must be an affirmative act, so this starts unchecked
  // and is never bundled into the sign-in button.
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const supabase = getBrowserClient();

  if (!supabase) {
    return (
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center justify-center gap-4 px-5 py-14 text-center">
        <h1 className="font-sat-display text-[clamp(1.4rem,4vw,1.9rem)] font-semibold">
          Sign-in isn&apos;t switched on yet
        </h1>
        <p className="text-[14.5px] leading-relaxed text-sat-chalk-dim">
          Everything on the trainer still works without an account — the
          flashcards and the quiz are both unlimited.
        </p>
        <Link
          href="/sat"
          className="rounded-full bg-sat-accent px-7 py-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-sat-card transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-sat-chalk"
        >
          Back to flashcards
        </Link>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || status === "sending") return;

    setStatus("sending");
    setError("");

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        // Read by the handle_new_user trigger, and re-checked on callback so a
        // returning user's latest choice wins.
        data: { marketing_consent: consent },
      },
    });

    if (signInError) {
      setStatus("error");
      setError(signInError.message);
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center justify-center gap-4 px-5 py-14 text-center">
        <h1 className="font-sat-display text-[clamp(1.4rem,4vw,1.9rem)] font-semibold">
          Check your email
        </h1>
        <p className="text-[14.5px] leading-relaxed text-sat-chalk-dim">
          We sent a sign-in link to <strong className="text-sat-chalk">{email}</strong>.
          Open it on this device and you&apos;ll be straight in — no password to
          remember.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="text-[13px] text-sat-chalk-dim underline transition-colors hover:text-sat-chalk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sat-chalk"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center gap-6 px-5 py-12">
      <header className="text-center">
        <h1 className="font-sat-display text-[clamp(1.5rem,4vw,2rem)] font-semibold">
          Save your progress
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-sat-chalk-dim">
          The quiz is free and unlimited either way. An account just remembers
          which words you keep missing. No password, takes about ten seconds.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[12px] uppercase tracking-[0.12em] text-sat-chalk-dim">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-sat-chalk-faint bg-sat-chalk/[0.06] px-4 py-3 text-[15px] text-sat-chalk placeholder:text-sat-chalk-dim/70 focus-visible:border-sat-chalk-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sat-chalk"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-left text-[13px] leading-relaxed text-sat-chalk-dim">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-sat-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sat-chalk"
          />
          <span>
            Email me occasional SAT study tips and news about AP Academy. You can
            unsubscribe from any message. Leaving this unticked won&apos;t affect
            your account.
          </span>
        </label>

        {status === "error" && (
          <p role="alert" className="text-[13px] text-sat-accent">
            {error || "Something went wrong. Try again in a moment."}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-full bg-sat-accent px-7 py-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-sat-card transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-sat-chalk"
        >
          {status === "sending" ? "Sending…" : "Send me a sign-in link"}
        </button>

        <p className="text-center text-[11.5px] leading-relaxed text-sat-chalk-dim">
          We use your email to sign you in and save your progress. See our{" "}
          <Link href="/privacy" className="underline hover:text-sat-chalk">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
