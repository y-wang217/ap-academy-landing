"use client";

import { getBrowserClient } from "@ap-academy/db/browser";
import Link from "next/link";
import { useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginForm({ next, linkFailed }: { next: string; linkFailed: boolean }) {
  const [email, setEmail] = useState("");
  // CASL: express consent is an affirmative act, so this starts unchecked and
  // is never bundled into the sign-in button. Same rule as /sat/login.
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const supabase = getBrowserClient();

  if (!supabase) {
    return (
      <Shell>
        <h1 className="font-serif text-3xl">Sign-in is not available yet</h1>
        <Link href="/" className="text-accent underline">
          Back to the main site
        </Link>
      </Shell>
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
        // Read by the handle_new_user trigger and re-checked by the callback.
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
      <Shell>
        <h1 className="font-serif text-3xl">Check your email</h1>
        <p className="text-text-secondary">
          We sent a sign-in link to <strong>{email}</strong>. Open it on this device to
          sign in.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="self-start text-sm text-text-muted underline"
        >
          Use a different email
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl">Sign in</h1>
        <p className="text-text-secondary">We email you a link. No password needed.</p>
      </header>

      {linkFailed && (
        <p role="alert" className="text-sm text-accent">
          That link didn&apos;t work. Links work once, in the browser that asked for
          them. Send a new one.
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5 text-sm text-text-muted">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-border bg-surface px-4 py-3 text-base text-text-primary"
          />
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span>
            Email me occasional study tips and news about AP Academy. You can unsubscribe
            from any message. Leaving this unticked won&apos;t affect your account.
          </span>
        </label>

        {status === "error" && (
          <p role="alert" className="text-sm text-accent">
            {error || "Something went wrong. Try again in a moment."}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-full bg-accent px-7 py-3 text-sm font-semibold text-text-on-dark hover:opacity-90 disabled:opacity-60"
        >
          {status === "sending" ? "Sending..." : "Send me a sign-in link"}
        </button>

        <p className="text-center text-xs text-text-muted">
          We use your email to sign you in. See our{" "}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col justify-center gap-6 px-4 py-12">
      {children}
    </main>
  );
}
