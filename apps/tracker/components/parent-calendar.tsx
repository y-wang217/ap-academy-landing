"use client";

import Link, { useLinkStatus } from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, Empty, Notice } from "@/components/ui";
import type { ChildHeader } from "@/lib/data/parent-calendar";
import type { CalendarClass, ClassState, Day, MonthView } from "@/lib/domain/schedule/month";
import { STATE_LABEL, cellLabel, clock, dayDots, dayLabel, fullDate, makeupNote, monthLabel, movedNote, summaryLine } from "@/lib/view/calendar-text";

// Tones per ADR 0047 and 0051: Scheduled ok, Moved warn, the one-off words (Makeup, Trial, Extra, Class) neutral,
// Cancelled error (struck and muted). Never per course.
const oneOff = (neutral: string) => ({ makeup: neutral, trial: neutral, extra: neutral, class: neutral });
const DOT: Record<ClassState, string> = {
  scheduled: "bg-ok",
  moved: "bg-warn",
  ...oneOff("border border-text-primary bg-surface"),
  cancelled: "bg-error",
};
const BLOCK: Record<ClassState, string> = {
  scheduled: "bg-ok-bg text-ok",
  moved: "bg-warn-bg text-warn",
  ...oneOff("border border-border bg-surface text-text-primary"),
  cancelled: "bg-error-bg text-text-muted line-through",
};
const PILL: Record<ClassState, string> = {
  scheduled: "bg-ok-bg text-ok",
  moved: "bg-warn-bg text-warn",
  ...oneOff("border border-border bg-surface text-text-primary"),
  cancelled: "bg-error-bg text-error",
};
const WEEK_HEAD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = { view: MonthView; path: string; names: Record<string, string>; namesFailed: boolean; header: ChildHeader };

/** The parent Calendar tab (REQ-24). Read-only: the only state is which day is selected. */
export function ParentCalendar({ view, path, names, namesFailed, header }: Props) {
  const startsInMonth = view.today.startsWith(view.month);
  const [selected, setSelected] = useState<string | null>(startsInMonth ? view.today : null);
  const [pending, setPending] = useState<"prev" | "next" | null>(null);
  const onPrev = useCallback((p: boolean) => setPending((cur) => (p ? "prev" : cur === "prev" ? null : cur)), []);
  const onNext = useCallback((p: boolean) => setPending((cur) => (p ? "next" : cur === "next" ? null : cur)), []);
  const teacher = (staffId: string) => names[staffId] ?? "Teacher";
  const selectedDay = selected ? view.weeks.flat().find((d) => d.date === selected && d.inMonth) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{`${header.firstName} ${header.lastInitial}.`}</h1>
        {header.gradeLevel !== null && <p className="text-sm text-text-muted">{`Grade ${header.gradeLevel}`}</p>}
      </div>
      {namesFailed && <Notice tone="warn">Teacher names could not load.</Notice>}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`${path}?month=${view.prev}`}
            prefetch={false}
            aria-label="Previous month"
            aria-busy={pending === "prev" ? true : undefined}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-lg"
          >
            <span aria-hidden>‹</span>
            <SwitchStatus onPending={onPrev} />
          </Link>
          <h2 className="text-base font-semibold" data-month-label aria-live="polite">
            {pending ? "Loading" : monthLabel(view.month)}
          </h2>
          <Link
            href={`${path}?month=${view.next}`}
            prefetch={false}
            aria-label="Next month"
            aria-busy={pending === "next" ? true : undefined}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-lg"
          >
            <span aria-hidden>›</span>
            <SwitchStatus onPending={onNext} />
          </Link>
        </div>
        <p className="text-sm text-text-muted" data-summary>{summaryLine(view.summary)}</p>
        <div className="grid grid-cols-7 gap-1" data-grid>
          {WEEK_HEAD.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-text-muted" aria-hidden>{d}</div>
          ))}
          {view.weeks.flat().map((day) => (
            <DayCell key={day.date} day={day} selected={day.date === selected} onSelect={setSelected} teacher={teacher} />
          ))}
        </div>
        <p className="text-xs text-text-muted sm:hidden">Tap a day to see its classes.</p>
        {selectedDay && (
          <section aria-label={`Classes on ${fullDate(selectedDay.date)}`} data-day-list className="flex flex-col gap-1 sm:hidden">
            <h3 className="text-sm font-semibold">{dayLabel(selectedDay.date)}</h3>
            {selectedDay.classes.length === 0 ? (
              <Empty>No classes this day.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {selectedDay.classes.map((c) => <ClassRow key={c.key} c={c} teacher={teacher(c.staffId)} />)}
              </ul>
            )}
          </section>
        )}
      </Card>
      <Card title="This week">
        {view.thisWeek.length === 0 ? (
          <Empty>No classes this week.</Empty>
        ) : (
          <ul className="divide-y divide-border" data-this-week>
            {view.thisWeek.map((c) => <ClassRow key={c.key} c={c} teacher={teacher(c.staffId)} showDay />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Reports the enclosing month link's pending state (AC17). */
function SwitchStatus({ onPending }: { onPending: (pending: boolean) => void }) {
  const { pending } = useLinkStatus();
  useEffect(() => onPending(pending), [pending, onPending]);
  return null;
}

function DayCell({ day, selected, onSelect, teacher }: { day: Day; selected: boolean; onSelect: (date: string) => void; teacher: (id: string) => string }) {
  const n = Number(day.date.slice(8));
  if (!day.inMonth) {
    return <div className="min-h-12 min-w-0 rounded-lg p-1 text-xs text-text-muted opacity-50" aria-hidden data-outside>{n}</div>;
  }
  const { dots, more } = dayDots(day.classes);
  return (
    <button
      type="button"
      data-date={day.date}
      aria-label={cellLabel(day)}
      aria-pressed={selected}
      onClick={() => onSelect(day.date)}
      className={`flex min-h-12 min-w-0 flex-col items-center gap-1 rounded-lg border p-1 sm:items-stretch ${selected ? "border-accent" : "border-transparent"} ${day.isToday ? "bg-background" : ""}`}
    >
      <span className={`text-xs ${day.isToday ? "font-bold" : "font-medium"}`}>{n}</span>
      <span className="flex items-center gap-0.5 sm:hidden" data-dots>
        {dots.map((s, i) => (
          <span key={i} data-state={s} className={`h-1.5 w-1.5 rounded-full ${DOT[s]}`} />
        ))}
        {more > 0 && <span className="text-[10px] leading-none text-text-muted">{`+${more}`}</span>}
      </span>
      <span className="hidden flex-col gap-0.5 sm:flex">
        {day.classes.map((c) => (
          <span key={c.key} data-state={c.state} data-block className={`block min-w-0 truncate rounded px-1 text-left text-[10px] leading-tight ${BLOCK[c.state]}`}>
            {clock(c.startTime)}
            <br />
            {c.subject}
            <br />
            {teacher(c.staffId)}
          </span>
        ))}
      </span>
    </button>
  );
}

function ClassRow({ c, teacher, showDay }: { c: CalendarClass; teacher: string; showDay?: boolean }) {
  const cancelled = c.state === "cancelled";
  return (
    <li className="flex items-start justify-between gap-2 py-2" data-state={c.state}>
      <div className="min-w-0">
        <div className={cancelled ? "text-text-muted line-through" : ""}>
          <p className="text-sm font-medium">{showDay ? `${dayLabel(c.date)} · ${clock(c.startTime)}` : clock(c.startTime)}</p>
          <p className="text-sm">{`${c.subject} · ${teacher}`}</p>
        </div>
        {c.state === "moved" && <p className="text-xs text-text-muted">{movedNote(c)}</p>}
        {c.makeupFor && <p className="text-xs text-text-muted" data-makeup-note>{makeupNote(c)}</p>}
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PILL[c.state]}`}>{STATE_LABEL[c.state]}</span>
    </li>
  );
}
