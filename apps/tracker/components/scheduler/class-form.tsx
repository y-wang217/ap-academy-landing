"use client";

import { useEffect, useRef, useState } from "react";
import type { CardData } from "@/components/scheduler/class-card";
import type { ClassPurpose } from "@/lib/domain/schedule/recurrence";
import { Notice, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { isoWeekday } from "@/lib/domain/schedule/wallclock";
import { api } from "@/lib/scheduler/api-client";
import { formatDayHeading } from "@/lib/view/availability-text";
import { clock, dayLabel } from "@/lib/view/calendar-text";
import { saveErrorMessage } from "@/lib/view/booking-text";
import { readSaveOutcome, type SaveOutcome } from "@/lib/view/save-notice";

export type FormMode = { kind: "create" } | { kind: "edit"; card: CardData } | { kind: "cancel"; card: CardData };
type Scope = "this" | "future";
type Props = {
  mode: FormMode;
  teachers: { id: string; name: string }[];
  /** Null: the student list could not be loaded. */
  students: { id: string; name: string }[] | null;
  defaultStaffId: string;
  today: string;
  onClose: () => void;
  /** The server accepted the change. The outcome carries what it did to the Weekly Schedule and today's Notion task. */
  onSaved: (outcome: SaveOutcome) => void;
  /** The server said the class changed under us: reload what is shown. */
  onStale: () => void;
};

const field = "flex min-w-0 flex-col gap-1 text-sm";
type Cancellation = { exceptionId: string; date: string; startTime: string; subject: string };
/** The cancellations loaded for one student; while none match the student shown, it is loading. */
type Loaded = { studentId: string; list: Cancellation[] | null };

/**
 * Book, edit or cancel one class in a native dialog. Fully usable by keyboard
 * and the only way to move a class on a phone. It sends only what changed, and
 * shows the server's answer: it never claims a save that failed.
 */
export function ClassForm({ mode, teachers, students, defaultStaffId, today, onClose, onSaved, onStale }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = mode.kind === "create" ? null : mode.card;
  const weekly = !!card && card.kind === "weekly";
  // A moved class cannot be split (its move would not follow), so it only offers "this class".
  const offersScope = weekly && card!.status !== "moved";
  const [scope, setScope] = useState<Scope>("this");
  const [studentId, setStudentId] = useState("");
  const [subject, setSubject] = useState(card?.subject ?? "");
  const [staffId, setStaffId] = useState(card?.staffId ?? defaultStaffId);
  const [date, setDate] = useState(card?.date ?? today);
  const [startTime, setStartTime] = useState(card?.startTime ?? "16:00");
  const [duration, setDuration] = useState(String(card?.durationMinutes ?? 60));
  const [repeats, setRepeats] = useState(false);
  const [until, setUntil] = useState("");
  // REQ-31: a one-off says why it exists. "" is not set: required on create, allowed to stay when editing a legacy row.
  const [purpose, setPurpose] = useState<ClassPurpose | "">(card?.purpose ?? "");
  const [makeupFor, setMakeupFor] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const asksPurpose = (mode.kind === "create" && !repeats) || (mode.kind === "edit" && card!.kind === "one_off");
  const purposeStudent = mode.kind === "create" ? studentId : card?.studentId ?? "";
  const wantsReplaces = asksPurpose && purpose === "makeup" && !!purposeStudent;
  const replaces = loaded && loaded.studentId === purposeStudent ? loaded.list : undefined;
  useEffect(() => {
    if (!wantsReplaces) return;
    let live = true;
    api.get<{ cancellations: Cancellation[] }>(`/classes/cancellations?studentId=${encodeURIComponent(purposeStudent)}`).then((r) => {
      if (live) setLoaded({ studentId: purposeStudent, list: r.ok ? r.data.cancellations : null });
    });
    return () => { live = false; };
  }, [wantsReplaces, purposeStudent]);

  const teacherName = (id: string) => teachers.find((t) => t.id === id)?.name ?? "The teacher";
  // On a weekly class "this class only" can only move the date and time; teacher, subject and length belong to "this class and future".
  const lockedFields = weekly && scope === "this";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const minutes = Number(duration);
    if (mode.kind !== "cancel" && (!Number.isInteger(minutes) || minutes < 15 || minutes > 480 || minutes % 5 !== 0)) {
      setError("Duration must be 15 to 480 minutes, in steps of 5.");
      return;
    }
    let call: ReturnType<typeof api.send>;
    if (mode.kind === "create") {
      if (!studentId) return setError("Choose a student.");
      if (!subject.trim()) return setError("Enter a subject.");
      if (!date) return setError("Choose a date.");
      if (!repeats && !purpose) return setError("Choose a purpose.");
      const body = {
        staffId, studentId, subject: subject.trim(), kind: repeats ? "weekly" : "one_off", startDate: date, startTime,
        durationMinutes: minutes, effectiveUntil: repeats && until ? until : null,
        ...(repeats ? {} : { purpose, makeupFor: purpose === "makeup" && makeupFor ? makeupFor : null }),
      };
      call = api.send("POST", "/classes", `create:${JSON.stringify(body)}`, body);
    } else {
      const c = mode.card;
      const path = `/classes/${c.seriesId}/occurrences/${c.originalDate}`;
      const seen = { expectedUpdatedAt: c.seriesUpdatedAt, expectedDate: c.date, expectedStartTime: c.startTime };
      if (mode.kind === "cancel") {
        const body = { ...seen, scope: offersScope ? scope : "this" };
        call = api.send("DELETE", path, `cancel:${c.occurrenceKey}:${body.scope}`, body);
      } else {
        const changes: Record<string, unknown> = {};
        if (startTime !== c.startTime) changes.startTime = startTime;
        if (scope === "this") {
          if (date !== c.date) changes.date = date;
          if (!weekly) {
            if (staffId !== c.staffId) changes.staffId = staffId;
            if (subject.trim() !== c.subject) changes.subject = subject.trim();
            if (minutes !== c.durationMinutes) changes.durationMinutes = minutes;
            if ((purpose || null) !== (c.purpose ?? null)) changes.purpose = purpose || null;
            if (purpose === "makeup" && makeupFor) changes.makeupFor = makeupFor;
          }
        } else {
          if (isoWeekday(date) !== isoWeekday(c.date)) changes.weekday = isoWeekday(date);
          if (staffId !== c.staffId) changes.staffId = staffId;
          if (subject.trim() !== c.subject) changes.subject = subject.trim();
          if (minutes !== c.durationMinutes) changes.durationMinutes = minutes;
        }
        if (Object.keys(changes).length === 0) return setError("Nothing to save.");
        const body = { ...seen, scope: offersScope ? scope : "this", changes };
        call = api.send("PATCH", path, `edit:${c.occurrenceKey}:${JSON.stringify(body)}`, body);
      }
    }
    setBusy(true);
    const r = await call;
    setBusy(false);
    if (r.ok) {
      const name = mode.kind === "create" ? students?.find((s) => s.id === studentId)?.name ?? null : mode.card.studentName ?? null;
      return onSaved(readSaveOutcome(r.data, name));
    }
    if (r.stale) onStale();
    setError(saveErrorMessage(r, teacherName(staffId)));
  }

  const title = mode.kind === "create" ? "Book a class" : mode.kind === "edit" ? "Edit class" : "Cancel class";
  return (
    <dialog
      ref={dialog}
      aria-labelledby="class-form-title"
      onClose={onClose}
      className="m-auto max-h-[90vh] w-[min(92vw,28rem)] overflow-y-auto rounded-xl border border-border bg-surface p-5 text-text-primary backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <h2 id="class-form-title" className="text-lg font-semibold">{title}</h2>
        {card && <p className="text-sm text-text-muted">{card.studentName ?? "Student"} · {card.subject} · {formatDayHeading(card.date)} {card.startTime}-{card.endTime}</p>}

        {mode.kind === "create" && (
          <label className={field}>
            <span className="font-medium">Student</span>
            <select className={inputClass} value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">Choose a student</option>
              {students?.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </label>
        )}

        {offersScope && (
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="font-medium">Applies to</legend>
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === "this"} onChange={() => setScope("this")} /> This class only</label>
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === "future"} onChange={() => setScope("future")} /> This class and future</label>
          </fieldset>
        )}

        {mode.kind !== "cancel" && (
          <>
            <label className={field}>
              <span className="font-medium">Subject</span>
              <input className={inputClass} value={subject} maxLength={80} onChange={(e) => setSubject(e.target.value)} disabled={lockedFields} required />
            </label>
            <label className={field}>
              <span className="font-medium">Teacher</span>
              <select className={inputClass} value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={lockedFields}>
                {teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={field}>
                <span className="font-medium">Date</span>
                <input type="date" className={inputClass} value={date} min={mode.kind === "create" ? today : undefined} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label className={field}>
                <span className="font-medium">Start time</span>
                <input type="time" step={300} className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </label>
            </div>
            {mode.kind === "edit" && scope === "future" && <p className="text-xs text-text-muted">The class and its future dates repeat on the weekday of the date you choose.</p>}
            <label className={field}>
              <span className="font-medium">Duration in minutes</span>
              <input type="number" inputMode="numeric" step={5} min={15} max={480} className={inputClass} value={duration} onChange={(e) => setDuration(e.target.value)} disabled={lockedFields} required />
            </label>
            {lockedFields && <p className="text-xs text-text-muted">To change the teacher, subject or length, choose “This class and future”.</p>}
          </>
        )}

        {mode.kind === "create" && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} /> Repeats weekly
            </label>
            {repeats && (
              <label className={field}>
                <span className="font-medium">Until (optional)</span>
                <input type="date" className={inputClass} value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
              </label>
            )}
            {!students && <Notice tone="warn">Student list could not be loaded.</Notice>}
          </>
        )}

        {asksPurpose && (
          <>
            <label className={field}>
              <span className="font-medium">Purpose</span>
              <select className={inputClass} value={purpose} onChange={(e) => { setPurpose(e.target.value as ClassPurpose | ""); setMakeupFor(""); }} required={mode.kind === "create"} data-field="purpose">
                {mode.kind === "create" && <option value="">Choose a purpose</option>}
                {mode.kind === "edit" && !card?.purpose && <option value="">Not set</option>}
                <option value="makeup">Makeup</option>
                <option value="trial">Trial</option>
                <option value="extra">Extra</option>
              </select>
            </label>
            {wantsReplaces && (
              <label className={field}>
                <span className="font-medium">Replaces (optional)</span>
                {replaces === undefined && <span className="text-xs text-text-muted">Loading cancelled classes</span>}
                {replaces === null && <Notice tone="warn">Cancelled classes could not load.</Notice>}
                {replaces && (
                  <select className={inputClass} value={makeupFor} onChange={(e) => setMakeupFor(e.target.value)} data-field="replaces">
                    {/* An edit does not know the current link; leaving this alone keeps it. */}
                    <option value="">{mode.kind === "edit" ? "No change" : "None"}</option>
                    {replaces.map((x) => (<option key={x.exceptionId} value={x.exceptionId}>{`${dayLabel(x.date)} · ${x.subject} ${clock(x.startTime)}`}</option>))}
                  </select>
                )}
              </label>
            )}
          </>
        )}

        {mode.kind === "cancel" && <p className="text-sm">{offersScope && scope === "future" ? "This class and every later one will be cancelled." : "This class will be cancelled."}</p>}
        {error && <div role="alert"><Notice tone="error">{error}</Notice></div>}

        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={() => dialog.current?.close()}>{mode.kind === "cancel" ? "Keep class" : "Close"}</button>
          <button type="submit" className={buttonClass} disabled={busy || (mode.kind === "create" && !students)}>
            {busy ? "Saving…" : mode.kind === "create" ? "Book class" : mode.kind === "edit" ? "Save changes" : "Cancel class"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
