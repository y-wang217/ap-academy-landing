"use client";

import { useRef } from "react";
import type { ClassPurpose } from "@/lib/domain/schedule/recurrence";
import { cardStatus, notionStudentUrl, purposeRow } from "@/lib/view/week-text";
import { formatDayHeading } from "@/lib/view/availability-text";
import { outcomeBadge, type OutcomeState } from "@/lib/view/lesson-text";
import { OutcomeActions, type LessonMode } from "@/components/scheduler/outcome-actions";

export type CardData = {
  occurrenceKey: string;
  studentId: string;
  studentName: string | null;
  subject: string;
  date: string;
  originalDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  kind: "one_off" | "weekly";
  /** One-offs: the declared purpose; null shows "Class" (ADR 0051). */
  purpose?: ClassPurpose | null;
  status: "scheduled" | "cancelled" | "moved";
  conflict: "outside_availability" | "time_off" | null;
  teacherName?: string;
  /** Admin only: what an edit needs to name the class and its version. */
  seriesId?: string;
  staffId?: string;
  seriesUpdatedAt?: string;
  /** REQ-39: a past, not cancelled class; what it turned into; and what this viewer may do about it. */
  linkable?: boolean;
  outcome?: OutcomeState | null;
  lessonMode?: LessonMode;
};

/** Pointer handlers the grid hands to a draggable card (admin, 768 px and up). */
export type DragProps = Pick<React.HTMLAttributes<HTMLButtonElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onClick">;

/** A class on the calendar: a button that opens a native dialog. Everything comes in as props; nothing is fetched here. */
export function ClassCard({ card, className = "", style, drag, saving, today, onEdit, onCancel }: {
  card: CardData;
  className?: string;
  style?: React.CSSProperties;
  drag?: DragProps;
  saving?: boolean;
  /** Today in the schedule zone: past classes offer no Edit or Cancel. */
  today?: string;
  /** Admin only. Present: the dialog offers Edit and Cancel class. */
  onEdit?: (card: CardData) => void;
  onCancel?: (card: CardData) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { onClick: afterDrag, ...dragRest } = drag ?? {};
  const badges = cardStatus(card);
  const logged = outcomeBadge(card);
  const purpose = purposeRow(card);
  const cancelled = card.status === "cancelled";
  const name = card.studentName ?? "Student";
  const border = card.conflict ? "border-dashed border-warn" : "border-solid border-accent";
  return (
    <>
      <button
        type="button"
        data-card={card.occurrenceKey}
        onClick={(e) => {
          afterDrag?.(e);
          if (!e.defaultPrevented) dialog.current?.showModal();
        }}
        {...dragRest}
        style={style}
        className={`overflow-hidden rounded-md border-2 bg-surface px-1.5 py-1 text-left text-xs leading-tight hover:bg-background focus:outline-2 focus:outline-accent ${border} ${drag ? "cursor-grab touch-none select-none" : ""} ${saving ? "opacity-70" : ""} ${className}`}
      >
        <span className={`block font-semibold ${cancelled ? "line-through" : ""}`}>{name}</span>
        <span className={`block ${cancelled ? "line-through" : ""}`}>{card.subject}</span>
        <span className={`block ${cancelled ? "line-through" : ""}`}>{card.startTime}-{card.endTime}</span>
        {saving && <span className="block font-medium">Saving…</span>}
        {logged && <span className="block font-medium" data-testid="outcome-badge"><span aria-hidden="true">{logged.icon} </span>{logged.label}</span>}
        {badges.filter((b) => b.label !== "Scheduled").map((b) => (
          <span key={b.label} className="block font-medium">
            <span aria-hidden="true">{b.icon} </span>{b.label}
          </span>
        ))}
      </button>
      <dialog ref={dialog} aria-labelledby={`${card.occurrenceKey}-t`} className="m-auto w-[min(92vw,26rem)] rounded-xl border border-border bg-surface p-5 text-text-primary backdrop:bg-black/40">
        <h2 id={`${card.occurrenceKey}-t`} className="text-lg font-semibold">{name}</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-text-muted">Subject</dt><dd>{card.subject}</dd>
          {card.teacherName && (<><dt className="text-text-muted">Teacher</dt><dd>{card.teacherName}</dd></>)}
          <dt className="text-text-muted">Date</dt><dd>{formatDayHeading(card.date)}</dd>
          <dt className="text-text-muted">Time</dt><dd>{card.startTime}-{card.endTime}</dd>
          <dt className="text-text-muted">Duration</dt><dd>{card.durationMinutes} min</dd>
          <dt className="text-text-muted">Type</dt><dd>{card.kind === "weekly" ? "Weekly" : "One-off"}</dd>
          {purpose && (<><dt className="text-text-muted">{purpose.term}</dt><dd data-testid="class-purpose">{purpose.value}</dd></>)}
          <dt className="text-text-muted">Status</dt>
          <dd>{badges.map((b) => `${b.icon} ${b.label}`).join(" · ")}</dd>
          {card.status === "moved" && (<><dt className="text-text-muted">Original date</dt><dd>{formatDayHeading(card.originalDate)}</dd></>)}
        </dl>
        <OutcomeActions card={card} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <a href={notionStudentUrl(card.studentId)} target="_blank" rel="noopener" className="text-sm text-accent underline underline-offset-2">
            Open student record
          </a>
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-background">
            Close
          </button>
        </div>
        {onEdit && onCancel && card.seriesId && card.originalDate >= (today ?? "") && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <button type="button" onClick={() => { dialog.current?.close(); onEdit(card); }} className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-background">
              Edit
            </button>
            {card.status !== "cancelled" && (
              <button type="button" onClick={() => { dialog.current?.close(); onCancel(card); }} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-error hover:bg-background">
                Cancel class
              </button>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
