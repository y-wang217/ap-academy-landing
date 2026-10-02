"use client";

import { useState } from "react";
import { getBrowserClient } from "../sat/supabase/client";

type State = "idle" | "working" | "done" | "error";

/**
 * Deliberately a button rather than an action on page load: email scanners
 * prefetch links, and a GET that unsubscribes would silently opt people out.
 * Two clicks total from the email, which still satisfies CASL.
 */
export default function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<State>("idle");
  const supabase = getBrowserClient();

  if (state === "done") {
    return (
      <>
        <h1 className="mt-6 font-serif text-[28px] leading-tight text-dark">
          You&apos;re unsubscribed
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          You won&apos;t get any more marketing email from us. Your SAT trainer
          account is untouched — sign-in links will still work.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mt-6 font-serif text-[28px] leading-tight text-dark">
        Unsubscribe from marketing email?
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        You&apos;ll stop receiving study tips and news. This won&apos;t delete
        your SAT trainer account or affect sign-in.
      </p>

      {state === "error" && (
        <p role="alert" className="mt-4 text-[14px] text-accent">
          That didn&apos;t work. Email{" "}
          <a href="mailto:y.wang217@gmail.com" className="underline">
            y.wang217@gmail.com
          </a>{" "}
          and we&apos;ll do it manually.
        </p>
      )}

      <button
        type="button"
        disabled={state === "working"}
        onClick={async () => {
          if (!supabase) return setState("error");
          setState("working");
          const { data, error } = await supabase.rpc("unsubscribe_by_token", {
            token,
          });
          setState(error || data !== true ? "error" : "done");
        }}
        className="mt-6 rounded-lg bg-accent px-6 py-3 text-[14px] font-semibold text-text-on-dark transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {state === "working" ? "Unsubscribing…" : "Unsubscribe me"}
      </button>
    </>
  );
}
