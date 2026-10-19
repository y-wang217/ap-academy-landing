"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CardData } from "@/components/scheduler/class-card";
import { ClassForm, type FormMode } from "@/components/scheduler/class-form";
import { ExportsStrip } from "@/components/scheduler/exports-strip";
import { WeekGrid, type GridEditor } from "@/components/scheduler/week-grid";
import { Notice, buttonClass, secondaryButtonClass } from "@/components/ui";
import type { AvailabilityDay } from "@/lib/domain/schedule/availability";
import { isoWeekday } from "@/lib/domain/schedule/wallclock";
import { api } from "@/lib/scheduler/api-client";
import { dropLabel, saveErrorMessage } from "@/lib/view/booking-text";
import { afterDailyRetry, afterExportRetry, afterSummaryRetry, exportToRetry, readSaveOutcome, saveNotice, type SaveOutcome } from "@/lib/view/save-notice";
import type { Slot } from "@/lib/view/drag";

type Props = {
  days: AvailabilityDay[];
  occurrences: CardData[];
  today: string;
  teacher: { id: string; name: string };
  teachers: { id: string; name: string }[];
  /** Null: the student list could not be loaded, so booking is off. */
  students: { id: string; name: string }[] | null;
};
type Ask = { card: CardData; slot: Slot };
type EditorNotice = { kind: "error"; text: string } | { kind: "saved"; outcome: SaveOutcome };
const RETRY_LABEL = { summary: "Retry Weekly Schedule", dailyTask: "Retry today's task" } as const;

/**
 * Charlie's week: the grid plus Book, Edit, Cancel and drag-to-move. A move
 * shows at its new slot as "Saving…" and returns to the old one if the server
 * says no. The server is the only judge; this holds no copy of the schedule.
 */
export function WeekEditor({ days, occurrences, today, teacher, teachers, students }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormMode | null>(null);
  const [pending, setPending] = useState<Map<string, Slot>>(new Map());
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [retrying, setRetrying] = useState<"summary" | "dailyTask" | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [scope, setScope] = useState<"this" | "future">("this");
  const scopeDialog = useRef<HTMLDialogElement>(null);
  const lastCard = useRef<string | null>(null);
  // Bumped after every save or retry, so the Notion exports strip reloads.
  const [exportsKey, setExportsKey] = useState(0);

  // New data from the server: whatever was in flight has landed (or been refused), so show the server's picture.
  const [seen, setSeen] = useState(occurrences);
  if (seen !== occurrences) {
    setSeen(occurrences);
    setPending(new Map());
  }

  useEffect(() => {
    const d = scopeDialog.current;
    if (!d) return;
    if (ask && !d.open) d.showModal();
    if (!ask && d.open) d.close();
  }, [ask]);

  const refocus = () => {
    const key = lastCard.current;
    if (key) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card="${CSS.escape(key)}"]`)?.focus());
  };
  const openForm = (mode: FormMode) => {
    lastCard.current = mode.kind === "create" ? null : mode.card.occurrenceKey;
    setNotice(null);
    setForm(mode);
  };

  async function save(card: CardData, slot: Slot, how: "this" | "future") {
    setNotice(null);
    setPending((p) => new Map(p).set(card.occurrenceKey, slot));
    const changes = how === "future"
      ? { startTime: slot.startTime, ...(isoWeekday(slot.date) !== isoWeekday(card.date) ? { weekday: isoWeekday(slot.date) } : {}) }
      : { date: slot.date, startTime: slot.startTime };
    const body = { expectedUpdatedAt: card.seriesUpdatedAt, expectedDate: card.date, expectedStartTime: card.startTime, scope: how, changes };
    const r = await api.send("PATCH", `/classes/${card.seriesId}/occurrences/${card.originalDate}`, `move:${card.occurrenceKey}:${how}:${slot.date}:${slot.startTime}`, body);
    if (r.ok) {
      // The card stays at the new slot until the refreshed week replaces it.
      setNotice({ kind: "saved", outcome: readSaveOutcome(r.data, card.studentName ?? null) });
      setExportsKey((k) => k + 1);
      router.refresh();
      return;
    }
    setPending((p) => {
      const next = new Map(p);
      next.delete(card.occurrenceKey);
      return next;
    });
    setNotice({ kind: "error", text: saveErrorMessage(r, teacher.name) });
    if (r.stale) router.refresh();
  }

  // Re-run one export only; the class is not saved again (REQ-28). With an outbox row, resend that row (REQ-35).
  async function retry(what: "summary" | "dailyTask", outcome: SaveOutcome) {
    if (retrying) return;
    setRetrying(what);
    const rowId = exportToRetry(outcome, what);
    const next = rowId
      ? afterExportRetry(outcome, what, rowId, await api.send("POST", "/exports/retry", `export-retry:${rowId}`, { id: rowId }))
      : what === "summary"
        ? afterSummaryRetry(outcome, await api.send("POST", "/summaries/sync", `summary-retry:${outcome.studentId}`, { studentId: outcome.studentId }))
        : afterDailyRetry(outcome, await api.send("POST", "/daily-task", `daily-task:${today}`, { date: today }));
    setRetrying(null);
    setExportsKey((k) => k + 1);
    // A form or a move may have replaced the notice while the retry ran; only update the one it belongs to.
    setNotice((n) => (n?.kind === "saved" && n.outcome === outcome ? { kind: "saved", outcome: next } : n));
    router.refresh();
  }

  const editor: GridEditor = {
    pending,
    onMove: (card, slot) => {
      lastCard.current = card.occurrenceKey;
      if (card.kind === "weekly" && card.status === "scheduled") {
        setScope("this");
        setAsk({ card, slot });
      } else {
        void save(card, slot, "this");
      }
    },
    onEdit: (card) => openForm({ kind: "edit", card }),
    onCancel: (card) => openForm({ kind: "cancel", card }),
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={buttonClass} disabled={!students} onClick={() => openForm({ kind: "create" })}>Book a class</button>
        {!students && <span className="text-sm text-text-muted">Student list could not be loaded.</span>}
      </div>
      <div role="status" aria-live="polite">
        {pending.size > 0 ? <p className="text-sm font-medium">Saving…</p> : notice?.kind === "error" ? <Notice tone="error">{notice.text}</Notice> : notice && <SavedNotice outcome={notice.outcome} retrying={retrying} onRetry={(what) => void retry(what, notice.outcome)} />}
      </div>
      <ExportsStrip reloadKey={exportsKey} />
      <WeekGrid days={days} occurrences={occurrences} today={today} teacherName={teacher.name} editor={editor} />

      {form && (
        <ClassForm
          key={form.kind === "create" ? "create" : `${form.kind}:${form.card.occurrenceKey}`}
          mode={form}
          teachers={teachers}
          students={students}
          defaultStaffId={teacher.id}
          today={today}
          onClose={() => {
            setForm(null);
            refocus();
          }}
          onSaved={(outcome) => {
            setForm(null);
            setNotice({ kind: "saved", outcome });
            setExportsKey((k) => k + 1);
            router.refresh();
            refocus();
          }}
          onStale={() => router.refresh()}
        />
      )}

      <dialog
        ref={scopeDialog}
        aria-labelledby="scope-title"
        onClose={() => setAsk(null)}
        className="m-auto w-[min(92vw,24rem)] rounded-xl border border-border bg-surface p-5 text-text-primary backdrop:bg-black/40"
      >
        {ask && (
          <form
            method="dialog"
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const { card, slot } = ask;
              setAsk(null);
              void save(card, slot, scope);
            }}
          >
            <h2 id="scope-title" className="text-lg font-semibold">Move this class?</h2>
            <p className="text-sm">{dropLabel(ask.slot.date, ask.slot.startTime, ask.card.durationMinutes)}</p>
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="sr-only">Applies to</legend>
              <label className="flex items-center gap-2"><input type="radio" name="move-scope" checked={scope === "this"} onChange={() => setScope("this")} /> This class only</label>
              <label className="flex items-center gap-2"><input type="radio" name="move-scope" checked={scope === "future"} onChange={() => setScope("future")} /> This class and future</label>
            </fieldset>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryButtonClass} onClick={() => setAsk(null)}>Cancel</button>
              <button type="submit" className={buttonClass}>Move</button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}

/** "Saved." plus one line per Notion export, with a Retry beside a failed one. */
function SavedNotice({ outcome, retrying, onRetry }: { outcome: SaveOutcome; retrying: "summary" | "dailyTask" | null; onRetry: (what: "summary" | "dailyTask") => void }) {
  const { tone, lines } = saveNotice(outcome);
  return (
    <Notice tone={tone}>
      {lines.map((line) => (
        <p key={line.retry ?? line.text} className="flex flex-wrap items-center gap-2">
          <span>{line.text}</span>
          {line.retry && (
            <button type="button" className={secondaryButtonClass} aria-label={RETRY_LABEL[line.retry]} disabled={retrying !== null} onClick={() => onRetry(line.retry!)}>
              {retrying === line.retry ? "Retrying…" : "Retry"}
            </button>
          )}
        </p>
      ))}
    </Notice>
  );
}
