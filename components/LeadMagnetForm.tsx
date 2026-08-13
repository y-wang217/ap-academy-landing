"use client";

import { useEffect, useRef, useState } from "react";
import { CONTACT, LEAD_MAGNET_ENDPOINT, LEAD_MAGNET_PDF_URL } from "@/app/config";
import { track } from "@/lib/analytics";

// Lead capture for the "mistakes blueprint" breakdown. One component for every
// call site; `source` records which stage/page produced the signup. Until
// LEAD_MAGNET_ENDPOINT is configured the component degrades to a prefilled
// email CTA instead of pretending to submit.

type Props = {
  source: string;
  cta?: string;
};

const GRADE_LEVELS = ["Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const MIN_SUBMIT_INTERVAL_MS = 15_000;
const MAX_SUBMITS = 5;

const inputClass =
  "block w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[14px] text-dark placeholder:text-text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function LeadMagnetForm({ source, cta = "Get the full step-by-step breakdown" }: Props) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const lastSubmitAt = useRef(0);
  const submitCount = useRef(0);

  useEffect(() => {
    track("lead_magnet_view", { source });
  }, [source]);

  if (!LEAD_MAGNET_ENDPOINT) {
    const subject = encodeURIComponent("Send me the Path to Waterloo breakdown");
    const body = encodeURIComponent(
      `Hi Charlie,\n\nPlease send me the full step-by-step breakdown.\n\n(From: ${source})`,
    );
    return (
      <div className="rounded-xl border border-border-accent bg-accent-bg p-5">
        <p className="text-[15px] font-semibold text-dark">{cta}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-secondary">
          Email us and we&apos;ll send you the full breakdown of every stage.
        </p>
        <a
          href={`mailto:${CONTACT.email}?subject=${subject}&body=${body}`}
          onClick={() => track("lead_magnet_submit", { source, method: "mailto" })}
          className="mt-4 inline-block rounded-lg bg-accent px-6 py-3 text-[14px] font-semibold text-text-on-dark transition-colors hover:bg-accent/90"
        >
          Email us for the breakdown
        </a>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border border-border-accent bg-accent-bg p-5" role="status">
        <p className="text-[15px] font-semibold text-dark">It&apos;s on its way to your inbox.</p>
        {LEAD_MAGNET_PDF_URL && (
          <a
            href={LEAD_MAGNET_PDF_URL}
            className="mt-2 inline-block text-[14px] font-semibold text-accent-muted underline underline-offset-2 hover:text-accent"
          >
            Or download it right now →
          </a>
        )}
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    // Honeypot: a filled "company" field means a bot — swallow silently.
    if (String(data.get("company") ?? "") !== "") {
      setStatus("success");
      return;
    }

    const now = Date.now();
    if (now - lastSubmitAt.current < MIN_SUBMIT_INTERVAL_MS || submitCount.current >= MAX_SUBMITS) {
      setStatus("error");
      return;
    }
    lastSubmitAt.current = now;
    submitCount.current += 1;

    setStatus("submitting");
    try {
      const res = await fetch(LEAD_MAGNET_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          parentName: String(data.get("parentName") ?? ""),
          email: String(data.get("email") ?? ""),
          gradeLevel: String(data.get("gradeLevel") ?? ""),
          source,
        }),
      });
      if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
      track("lead_magnet_submit", { source });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border-accent bg-accent-bg p-5">
      <p className="text-[15px] font-semibold text-dark">{cta}</p>
      <div className="mt-4 flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold text-text-secondary">Your name</span>
          <input name="parentName" type="text" required autoComplete="name" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold text-text-secondary">Email</span>
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold text-text-secondary">
            Your child&apos;s current grade
          </span>
          <select name="gradeLevel" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a grade
            </option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <div className="hp-field" aria-hidden="true">
          <label>
            Company
            <input name="company" type="text" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
      </div>
      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-4 w-full rounded-lg bg-accent px-6 py-3 text-[14px] font-semibold text-text-on-dark transition-colors hover:bg-accent/90 disabled:cursor-wait disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Send me the breakdown"}
      </button>
      {status === "error" && (
        <p className="mt-3 text-[13px] text-accent-muted" role="alert">
          That didn&apos;t go through. Please try again in a moment, or email{" "}
          <a href={`mailto:${CONTACT.email}`} className="underline underline-offset-2">
            {CONTACT.email}
          </a>
          .
        </p>
      )}
    </form>
  );
}
