"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/scheduler/api-client";
import { LESSON_TEXT, lessonErrorText } from "@/lib/view/lesson-text";

/**
 * The owner's Link on the Unlinked lessons page (REQ-39 AC12). One click links
 * one Notion row to one class; on success the page reloads and the row leaves
 * the list, on refusal the reason shows under it.
 */
export function LinkLessonButton({ seriesId, originalDate, lessonId }: { seriesId: string; originalDate: string; lessonId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        data-testid={`link-${lessonId}`}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await api.act("POST", "/lessons/link", { seriesId, originalDate, lessonId });
          setBusy(false);
          if (!r.ok) setError(lessonErrorText(r.error));
          router.refresh();
        }}
        className="rounded-full border border-border px-3 py-1 text-sm font-medium hover:bg-background disabled:opacity-60"
      >
        {busy ? LESSON_TEXT.linking : LESSON_TEXT.link}
      </button>
      {error && <span role="alert" className="text-xs text-error">{error}</span>}
    </span>
  );
}
