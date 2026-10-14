"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CardData } from "@/components/scheduler/class-card";
import { ClassForm, type FormMode } from "@/components/scheduler/class-form";
import { WeekGrid, type GridEditor } from "@/components/scheduler/week-grid";
import { Notice, buttonClass, secondaryButtonClass } from "@/components/ui";
import type { AvailabilityDay } from "@/lib/domain/schedule/availability";
import { isoWeekday } from "@/lib/domain/schedule/wallclock";
import { api } from "@/lib/scheduler/api-client";
import { dropLabel, saveErrorMessage } from "@/lib/view/booking-text";
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

/**
 * Charlie's week: the grid plus Book, Edit, Cancel and drag-to-move. A move
 * shows at its new slot as "Saving…" and returns to the old one if the server
 * says no. The server is the only judge; this holds no copy of the schedule.
 */
export function WeekEditor({ days, occurrences, today, teacher, teachers, students }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormMode | null>(null);
  const [pending, setPending] = useState<Map<string, Slot>>(new Map());
  const [notice, setNotice] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [scope, setScope] = useState<"this" | "future">("this");
  const scopeDialog = useRef<HTMLDialogElement>(null);
  const lastCard = useRef<string | null>(null);

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
      if ((r.data as { dailyTask?: string } | null)?.dailyTask === "failed") setNotice({ tone: "warn", text: "Saved. Today's Notion task could not be updated." });
      router.refresh();
      return;
    }
    setPending((p) => {
      const next = new Map(p);
      next.delete(card.occurrenceKey);
      return next;
    });
    setNotice({ tone: "error", text: saveErrorMessage(r, teacher.name) });
    if (r.stale) router.refresh();
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
        {pending.size > 0 ? <p className="text-sm font-medium">Saving…</p> : notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      </div>
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
          onSaved={(dailyTask) => {
            setForm(null);
            setNotice(dailyTask === "failed" ? { tone: "warn", text: "Saved. Today's Notion task could not be updated." } : { tone: "ok", text: "Saved." });
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
