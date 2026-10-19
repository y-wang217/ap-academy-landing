"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/scheduler/api-client";
import { LESSON_TEXT, lessonErrorText, outcomeView, type OutcomeState } from "@/lib/view/lesson-text";

export type LessonMode = "off" | "unloaded" | "teacher" | "owner";
type Props = {
  card: { seriesId?: string; originalDate: string; linkable?: boolean; outcome?: OutcomeState | null; lessonMode?: LessonMode };
};

const button = "rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-background disabled:opacity-60";

/**
 * Log this class, Mark no-show, and the owner's Clear, inside the class dialog
 * (REQ-39 AC11). The server decides everything; after any answer the page
 * reloads its week so the card shows what was stored, never a guess.
 */
export function OutcomeActions({ card }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const mode = card.lessonMode ?? "off";
  const view = outcomeView(card);
  if (mode === "off" || !view || !card.seriesId) return null;
  if (mode === "unloaded") return <p className="mt-3 border-t border-border pt-3 text-sm text-text-muted">{LESSON_TEXT.statusUnavailable}</p>;
  const target = { seriesId: card.seriesId, originalDate: card.originalDate };

  async function run(method: "POST" | "DELETE", path: string, body: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    const r = await api.act(method, path, body);
    setBusy(false);
    if (!r.ok) setError(lessonErrorText(r.error));
    else after?.();
    router.refresh();
  }
  const log = () => run("POST", "/lessons", target, () => setHint(true));
  const noShow = () => {
    if (window.confirm(LESSON_TEXT.confirmNoShow)) void run("POST", "/outcomes", { ...target, outcome: "no_show" });
  };
  const clear = (question: string) => {
    if (window.confirm(question)) void run("DELETE", "/outcomes", target);
  };

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-sm" data-testid="outcome-actions">
      {view.kind === "actions" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={log} className={button}>{busy ? LESSON_TEXT.logging : LESSON_TEXT.log}</button>
          <button type="button" disabled={busy} onClick={noShow} className={button}>{LESSON_TEXT.noShow}</button>
        </div>
      )}
      {view.kind === "delivered" && (
        <>
          <p className="font-medium"><span aria-hidden="true">✓ </span>{view.label}</p>
          <div className="flex flex-wrap items-center gap-3">
            <a href={view.url} target="_blank" rel="noopener" className="text-accent underline underline-offset-2">{LESSON_TEXT.openLesson}</a>
            {mode === "owner" && <button type="button" disabled={busy} onClick={() => clear(LESSON_TEXT.confirmUnlink)} className={button}>{LESSON_TEXT.clear}</button>}
          </div>
          {hint && <p className="text-text-muted">{LESSON_TEXT.notesHint}</p>}
        </>
      )}
      {view.kind === "no_show" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-medium"><span aria-hidden="true">✕ </span>{view.label}</p>
          {mode === "owner" && <button type="button" disabled={busy} onClick={() => clear(LESSON_TEXT.confirmClearNoShow)} className={button}>{LESSON_TEXT.clear}</button>}
        </div>
      )}
      {view.kind === "logging" && (
        <div className="flex flex-wrap items-center gap-3">
          <p>{view.label}</p>
          {view.retry && <button type="button" disabled={busy} onClick={log} className={button}>{LESSON_TEXT.tryAgain}</button>}
        </div>
      )}
      {error && <p role="alert" className="text-error">{error}</p>}
    </div>
  );
}
