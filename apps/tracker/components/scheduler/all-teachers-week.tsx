import Link from "next/link";
import type { CardData } from "@/components/scheduler/class-card";
import { Empty } from "@/components/ui";
import { formatDayHeading } from "@/lib/view/availability-text";
import { formatHours } from "@/lib/view/week-text";

export type TeacherWeek = {
  staff: { id: string; name: string };
  days: { date: string }[];
  occurrences: CardData[];
  totals: { scheduledMinutes: number; availableMinutes: number | null; remainingMinutes: number | null };
};

/** Charlie's compact view: one bordered section per teacher, hours first, then a 7-day list. */
export function AllTeachersWeek({ teachers, weekStart }: { teachers: TeacherWeek[]; weekStart: string }) {
  if (teachers.length === 0) return <Empty>No active teachers found.</Empty>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {teachers.map((t) => {
        const outside = t.occurrences.filter((o) => o.conflict).length;
        const hours = t.totals.remainingMinutes === null ? "No availability entered" : `${formatHours(t.totals.remainingMinutes)} available left`;
        return (
          <section key={t.staff.id} className="rounded-xl border-2 border-border bg-surface p-4">
            <h2 className="text-lg font-semibold">
              <Link href={`/schedule?staffId=${t.staff.id}&date=${weekStart}`} className="text-accent underline underline-offset-2">{t.staff.name}</Link>
            </h2>
            <p className="text-sm">
              Scheduled {formatHours(t.totals.scheduledMinutes)} · {hours}
              {outside > 0 && <span className="font-medium"> · <span aria-hidden="true">⚠ </span>{outside} outside hours</span>}
            </p>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {t.days.map((d) => {
                const day = t.occurrences.filter((o) => o.date === d.date).sort((a, b) => a.startTime.localeCompare(b.startTime));
                return (
                  <li key={d.date} className="flex gap-3">
                    <span className="w-16 shrink-0 text-text-muted">{formatDayHeading(d.date)}</span>
                    <span className="flex flex-col">
                      {day.length === 0 && <span className="text-text-muted">-</span>}
                      {day.map((o) => (
                        <span key={o.occurrenceKey} className={o.status === "cancelled" ? "line-through" : ""}>
                          {o.startTime} {o.studentName ?? "Student"} · {o.subject}
                          {o.status === "cancelled" && <span className="no-underline"> (Cancelled)</span>}
                        </span>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
