import { ClassCard, type CardData } from "@/components/scheduler/class-card";
import type { AvailabilityDay } from "@/lib/domain/schedule/availability";
import { minutesOf, timeOf } from "@/lib/domain/schedule/wallclock";
import { formatDayHeading } from "@/lib/view/availability-text";
import { gridBounds, layoutDay, ROW_MINUTES } from "@/lib/view/week-layout";
import { weekDayLabel } from "@/lib/view/week-text";

const ROW_REM = 1.1;
const HATCH = "repeating-linear-gradient(45deg, transparent 0 5px, rgb(0 0 0 / 0.12) 5px 6px)";

type Props = { days: AvailabilityDay[]; occurrences: CardData[]; today: string; teacherName?: string };

/**
 * One teacher's week. From 768 px: a time axis in 15-minute rows with
 * availability underneath and class cards on top. Below that: a stacked day
 * list. Both render the same data, and both state availability in words.
 */
export function WeekGrid({ days, occurrences, today, teacherName }: Props) {
  const cards = occurrences.map((o) => ({ ...o, teacherName }));
  const { startMinutes, endMinutes } = gridBounds(cards, days);
  const rows = (endMinutes - startMinutes) / ROW_MINUTES;
  const top = (time: string | number) => (((typeof time === "number" ? time : minutesOf(time)) - startMinutes) / ROW_MINUTES) * ROW_REM;
  const byDay = (date: string) => cards.filter((c) => c.date === date);
  const hours: number[] = [];
  for (let m = Math.ceil(startMinutes / 60) * 60; m < endMinutes; m += 60) hours.push(m);

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
        {days.map((d) => (
          <div key={d.date} className="relative border-l border-border" style={{ height: `${rows * ROW_REM}rem` }}>
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
                className="absolute"
                style={{ top: `${top(c.startTime)}rem`, height: `${top(c.endTime) - top(c.startTime)}rem`, left: `${(lane / laneCount) * 100}%`, width: `${100 / laneCount}%` }}
              />
            ))}
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
                <li key={c.occurrenceKey} className="flex"><ClassCard card={c} className="w-full" /></li>
              ))}
              {byDay(d.date).length === 0 && <li className="text-xs text-text-muted">No classes</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
