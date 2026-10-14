"use client";

import { useEffect, useRef, useState } from "react";
import { ClassCard, type CardData, type DragProps } from "@/components/scheduler/class-card";
import type { AvailabilityDay } from "@/lib/domain/schedule/availability";
import { minutesOf, timeOf } from "@/lib/domain/schedule/wallclock";
import { formatDayHeading } from "@/lib/view/availability-text";
import { dropLabel } from "@/lib/view/booking-text";
import { dropTarget, isSameSlot, type Slot } from "@/lib/view/drag";
import { gridBounds, layoutDay, ROW_MINUTES } from "@/lib/view/week-layout";
import { weekDayLabel } from "@/lib/view/week-text";

const ROW_REM = 1.1;
const HATCH = "repeating-linear-gradient(45deg, transparent 0 5px, rgb(0 0 0 / 0.12) 5px 6px)";

/** Admin editing hooks. Absent for teachers and the All teachers view: the grid then renders exactly as before. */
export type GridEditor = {
  /** Where a card sits while its save is in flight, by occurrence key. */
  pending: Map<string, Slot>;
  onMove: (card: CardData, slot: Slot) => void;
  onEdit: (card: CardData) => void;
  onCancel: (card: CardData) => void;
};
type Props = { days: AvailabilityDay[]; occurrences: CardData[]; today: string; teacherName?: string; editor?: GridEditor };
type Ghost = { date: string; startTime: string; durationMinutes: number };
const MOVE_THRESHOLD_PX = 5;

/**
 * One teacher's week. From 768 px: a time axis in 15-minute rows with
 * availability underneath and class cards on top. Below that: a stacked day
 * list. Both render the same data, and both state availability in words.
 */
export function WeekGrid({ days, occurrences, today, teacherName, editor }: Props) {
  const cards = occurrences.map((o) => {
    const at = editor?.pending.get(o.occurrenceKey);
    const moved = at ? { date: at.date, startTime: at.startTime, endTime: timeOf(minutesOf(at.startTime) + o.durationMinutes) } : {};
    return { ...o, ...moved, teacherName };
  });
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef = useRef<{ card: CardData; startX: number; startY: number; offsetY: number; moved: boolean; target: Slot | null } | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  useEffect(() => {
    if (!ghost) return;
    // Escape abandons the drag: nothing is sent and the card stays where it was.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dragRef.current = null;
      setGhost(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ghost]);
  const { startMinutes, endMinutes } = gridBounds(cards, days);
  const rows = (endMinutes - startMinutes) / ROW_MINUTES;
  const top = (time: string | number) => (((typeof time === "number" ? time : minutesOf(time)) - startMinutes) / ROW_MINUTES) * ROW_REM;
  const byDay = (date: string) => cards.filter((c) => c.date === date);
  const hours: number[] = [];
  for (let m = Math.ceil(startMinutes / 60) * 60; m < endMinutes; m += 60) hours.push(m);

  const canDrag = (c: CardData) => !!editor && !!c.seriesId && c.status !== "cancelled" && c.originalDate >= today && !editor.pending.has(c.occurrenceKey);
  function dropAt(x: number, y: number, card: CardData, offsetY: number): Slot | null {
    const first = colRefs.current[0];
    const last = colRefs.current[days.length - 1];
    if (!first || !last) return null;
    const a = first.getBoundingClientRect();
    const b = last.getBoundingClientRect();
    return dropTarget({ x, y }, {
      days: days.map((d) => d.date), startMinutes, rowPx: a.height / rows, colWidth: (b.right - a.left) / days.length,
      left: a.left, top: a.top, duration: card.durationMinutes, offsetY,
    });
  }
  const dragProps = (card: CardData): DragProps | undefined => {
    if (!canDrag(card)) return undefined;
    return {
      onPointerDown: (e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { card, startX: e.clientX, startY: e.clientY, offsetY: e.clientY - e.currentTarget.getBoundingClientRect().top, moved: false, target: null };
      },
      onPointerMove: (e) => {
        const d = dragRef.current;
        if (!d || d.card.occurrenceKey !== card.occurrenceKey) return;
        if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < MOVE_THRESHOLD_PX) return;
        d.moved = true;
        d.target = dropAt(e.clientX, e.clientY, card, d.offsetY);
        setGhost(d.target ? { ...d.target, durationMinutes: card.durationMinutes } : null);
      },
      onPointerUp: (e) => {
        const d = dragRef.current;
        dragRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        setGhost(null);
        if (!d || !d.moved) return;
        suppressClick.current = true;
        if (d.target && !isSameSlot(d.target, { date: card.date, startTime: card.startTime })) editor!.onMove(card, d.target);
      },
      onPointerCancel: () => {
        dragRef.current = null;
        setGhost(null);
      },
      onClick: (e) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.preventDefault();
      },
    };
  };

  return (
    <>
      <div className="hidden md:grid" style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" }}>
        <div />
        {days.map((d) => (
          <div key={d.date} className="border-b border-border px-1 pb-1 text-center text-sm font-medium">
            {formatDayHeading(d.date)}{d.date === today ? " (Today)" : ""}
            <span className="block text-xs font-normal text-text-muted">{d.state === "not_entered" ? "No availability entered" : d.state === "unavailable" ? "Unavailable" : ""}</span>
          </div>
        ))}
        <div className="relative" style={{ height: `${rows * ROW_REM}rem` }} aria-hidden="true">
          {hours.map((m) => (<span key={m} className="absolute right-1 -translate-y-1/2 text-xs text-text-muted" style={{ top: `${top(m)}rem` }}>{timeOf(m)}</span>))}
        </div>
        {days.map((d, i) => (
          <div key={d.date} ref={(el) => { colRefs.current[i] = el; }} className="relative border-l border-border" style={{ height: `${rows * ROW_REM}rem` }}>
            {hours.map((m) => (<div key={m} className="absolute inset-x-0 border-t border-border/60" style={{ top: `${top(m)}rem` }} aria-hidden="true" />))}
            {d.intervals.map((i) => (
              <div
                key={i.start}
                className="absolute inset-x-0 border-y border-dashed border-text-muted bg-background"
                style={{ top: `${top(i.start)}rem`, height: `${top(i.end) - top(i.start)}rem`, backgroundImage: HATCH }}
              >
                <span className="px-1 text-[0.65rem] font-medium text-text-muted">Available</span>
              </div>
            ))}
            {layoutDay(byDay(d.date)).map(({ occurrence: c, lane, laneCount }) => (
              <ClassCard
                key={c.occurrenceKey}
                card={c}
                today={today}
                drag={dragProps(c)}
                saving={editor?.pending.has(c.occurrenceKey)}
                onEdit={editor?.onEdit}
                onCancel={editor?.onCancel}
                className="absolute"
                style={{ top: `${top(c.startTime)}rem`, height: `${top(c.endTime) - top(c.startTime)}rem`, left: `${(lane / laneCount) * 100}%`, width: `${100 / laneCount}%` }}
              />
            ))}
            {ghost && ghost.date === d.date && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 z-10 rounded-md border-2 border-dashed border-accent bg-accent/10 px-1 text-xs font-medium"
                style={{ top: `${top(ghost.startTime)}rem`, height: `${(ghost.durationMinutes / ROW_MINUTES) * ROW_REM}rem` }}
              >
                {dropLabel(ghost.date, ghost.startTime, ghost.durationMinutes)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {days.map((d) => (
          <section key={d.date} className="rounded-xl border border-border bg-surface p-3">
            <h3 className="text-sm font-semibold">{formatDayHeading(d.date)}{d.date === today ? " (Today)" : ""}</h3>
            <p className="text-xs text-text-muted">{weekDayLabel(d)}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {byDay(d.date).sort((a, b) => a.startTime.localeCompare(b.startTime)).map((c) => (
                <li key={c.occurrenceKey} className="flex">
                  <ClassCard card={c} today={today} saving={editor?.pending.has(c.occurrenceKey)} onEdit={editor?.onEdit} onCancel={editor?.onCancel} className="w-full" />
                </li>
              ))}
              {byDay(d.date).length === 0 && <li className="text-xs text-text-muted">No classes</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
