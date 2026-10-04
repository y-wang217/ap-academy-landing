"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import type { Result } from "@/lib/result";
import { buttonClass, secondaryButtonClass } from "./ui";

/**
 * A form wired to a server action. Shows "Saving..." while pending, the
 * action's error on failure (fields kept as typed), and a success message only
 * after the server confirms (non-negotiable 6).
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  pendingLabel = "Saving...",
  resetOnSuccess = false,
  labels = {},
  confirm,
  secondary = false,
  className = "flex flex-col gap-3",
}: {
  action: (form: FormData) => Promise<Result>;
  children?: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  labels?: Record<string, string>;
  confirm?: string;
  secondary?: boolean;
  className?: string;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className={className}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const form = new FormData(event.currentTarget);
        setResult(null);
        startTransition(async () => {
          try {
            const r = await action(form);
            setResult(r ?? null);
            if (r?.ok && resetOnSuccess) formRef.current?.reset();
          } catch (error) {
            // A redirect from the action is not a failure.
            if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
            setResult({ ok: false, error: "Could not save. Check your connection and try again." });
          }
        });
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={secondary ? secondaryButtonClass : buttonClass}>
          {pending ? pendingLabel : submitLabel}
        </button>
        <span aria-live="polite" className="text-sm">
          {result?.ok && result.message && <span className="text-ok">{result.message}</span>}
          {result && !result.ok && <span role="alert" className="text-error">{result.error}</span>}
        </span>
      </div>
      {result && !result.ok && result.fields && (
        <ul className="text-sm text-error">
          {Object.entries(result.fields).map(([field, message]) => (
            <li key={field}>
              {labels[field] ?? field}: {message}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

/** A one-click action (pin, move, remove) with the same honest feedback. */
export function ActionButton({
  action,
  label,
  pendingLabel = "...",
  confirm,
  className = secondaryButtonClass,
}: {
  action: () => Promise<Result>;
  label: string;
  pendingLabel?: string;
  confirm?: string;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          startTransition(async () => {
            try {
              const r = await action();
              if (!r.ok) setError(r.error);
            } catch {
              setError("Could not save. Try again.");
            }
          });
        }}
      >
        {pending ? pendingLabel : label}
      </button>
      {error && <span role="alert" className="text-sm text-error">{error}</span>}
    </span>
  );
}
