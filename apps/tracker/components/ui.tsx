import Link from "next/link";
import type { ReactNode } from "react";

// Small presentational pieces. No data access, no grade maths.

export const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-text-primary focus:outline-2 focus:outline-accent";
/** For short numbers (scores, targets): same look, fixed width. */
export const numberInputClass = inputClass.replace("w-full", "w-28");
export const buttonClass =
  "inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-background disabled:opacity-50";
export const linkClass = "text-accent underline underline-offset-2";

export function Page({ title, back, children, aside }: { title: string; back?: { href: string; label: string }; children: ReactNode; aside?: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6">
      {back && (
        <Link href={back.href} className="text-sm text-text-muted underline underline-offset-2">
          {back.label}
        </Link>
      )}
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {aside}
      </header>
      {children}
    </main>
  );
}

export function Card({ title, children, action, id }: { title?: string; children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <section id={id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, name, children, hint }: { label: string; name: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={name}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </label>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const tones = {
    info: "bg-background text-text-primary",
    warn: "bg-warn-bg text-warn",
    error: "bg-error-bg text-error",
    ok: "bg-ok-bg text-ok",
  } as const;
  return <div className={`rounded-lg px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-muted">{children}</p>;
}

const STATE_TONE: Record<string, string> = {
  upcoming: "bg-background text-text-muted",
  done: "bg-ok-bg text-ok",
  awaiting_result: "bg-warn-bg text-warn",
  graded: "bg-surface text-text-primary border border-border",
  excused: "bg-background text-text-muted",
};

export function StateBadge({ state, label }: { state: string; label: string }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[state] ?? ""}`}>{label}</span>;
}

/** The sentence the UX rules require wherever a current grade is shown. */
export function GradeNote() {
  return <p className="text-xs text-text-muted">Current grades are calculated based on existing marked grades.</p>;
}
